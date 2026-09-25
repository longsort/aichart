/**
 * POST /api/merged-desk/order-diag
 * 실제 주문 없이 주문 경로 진단.
 * 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import {
  bitgetFetchAccountSummary,
  bitgetFetchContractRules,
  bitgetFetchPositionMode,
  bitgetProbeTradePermission,
  equityPctToMarginUsdt,
  formatBitgetSize,
  marginToBaseSize,
  validateOrderSizeAgainstRules,
} from '@/lib/bitgetPrivateTrade';
import { tryAcquireLiveLock } from '@/lib/bitgetLiveInstanceLock';
import { normalizeMarginMode } from '@/lib/bitgetOrderTrace';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    push('AUTH FAIL');
    return NextResponse.json({ ok: false, lines, summaryKo: 'AUTH FAIL' }, { status: 401 });
  }
  push('AUTH PASS');

  const meta = readExchangeKeysMeta(auth.user);
  if (!meta) {
    push('ACCOUNT FAIL · API 키 미등록');
    return NextResponse.json({ ok: false, lines, summaryKo: 'API 키 없음' });
  }
  if (meta.lastTestOk === false) {
    push('ACCOUNT FAIL · 키 테스트 실패 상태');
    return NextResponse.json({ ok: false, lines, summaryKo: '키 재테스트 필요' });
  }

  const creds = readExchangeKeysPlain(auth.user);
  if (!creds) {
    push('ACCOUNT FAIL · 복호화 실패');
    return NextResponse.json({ ok: false, lines, summaryKo: '키 복호화 실패' });
  }
  push('ACCOUNT PASS');

  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol || 'BTCUSDT').toUpperCase();
  const equityPct = Math.max(0.5, Math.min(100, Number(body.equityPct) || 5));
  const leverage = Math.max(1, Math.min(125, Number(body.leverage) || 10));
  let price = Number(body.price) || 0;
  const marginModeRaw = body.marginMode || 'isolated';
  const marginMode = normalizeMarginMode(marginModeRaw);

  if (!(price > 0)) {
    try {
      const u = `https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`;
      const tr = await fetch(u, { cache: 'no-store' });
      const tj = await tr.json().catch(() => ({}));
      const row = Array.isArray(tj?.data) ? tj.data[0] : tj?.data;
      price = Number(row?.lastPr ?? row?.markPrice ?? 0) || 0;
    } catch {
      /* ignore */
    }
  }

  try {
    const { fetchOutboundPublicIp } = await import('@/lib/bitgetAuth');
    const ip = await fetchOutboundPublicIp();
    push(ip.ok ? `IP PASS · ${ip.ip}` : `IP FAIL · ${ip.msg}`);
  } catch {
    push('IP FAIL');
  }

  const perm = await bitgetProbeTradePermission(creds);
  push(`TRADE PERMISSION ${perm.tradePermission}${perm.code ? ` · ${perm.code}` : ''}`);
  if (perm.tradePermission === 'FAIL') push(`  detail: ${perm.msg}`);

  const modePack = await bitgetFetchPositionMode(creds, symbol);
  if (modePack.ok && modePack.posMode) {
    const label = modePack.posMode === 'hedge_mode' ? 'HEDGE' : 'ONE-WAY';
    push(`POSITION MODE ${label}`);
    push(`APP POSITION MODE = ${modePack.posMode} (Bitget 따름 · 추정 없음)`);
    push(`BITGET POSITION MODE = ${modePack.posMode}`);
  } else {
    push(`POSITION MODE FAIL · ${modePack.msg}`);
  }

  if (marginMode) {
    push(`MARGIN MODE ${marginMode.toUpperCase()}`);
  } else {
    push(`MARGIN MODE FAIL · raw=${marginModeRaw} (isolated|crossed only)`);
  }

  const acct = await bitgetFetchAccountSummary(creds);
  const bal = acct.availableUsdt ?? acct.equityUsdt;
  if (acct.ok && bal != null) {
    push(`BALANCE ${bal.toFixed(4)} USDT`);
  } else {
    push(`BALANCE FAIL · ${acct.msg}`);
  }

  push(`SYMBOL ${symbol}`);
  push(`ENDPOINT /api/v2/mix/order/place-order`);

  const rules = await bitgetFetchContractRules(symbol);
  let minSize = '?';
  if (rules.ok && rules.rules) {
    minSize = String(rules.rules.minTradeNum);
    push(
      `MIN SIZE ${rules.rules.minTradeNum} · step=${rules.rules.sizeMultiplier} · place=${rules.rules.volumePlace}`
    );
  } else {
    push(`MIN SIZE FAIL · ${rules.msg}`);
  }

  let calcSize = '?';
  let sizeValid: 'PASS' | 'FAIL' | 'SKIP' = 'SKIP';
  if (acct.ok && (acct.equityUsdt || acct.availableUsdt) && price > 0) {
    const eq = acct.equityUsdt ?? acct.availableUsdt ?? 0;
    const marginUsdt = equityPctToMarginUsdt(eq, equityPct);
    const base = marginToBaseSize(marginUsdt, leverage, price);
    calcSize = formatBitgetSize(base, symbol);
    push(`CALCULATED SIZE ${calcSize} (from ${equityPct}% equity · lev ${leverage} · px ${price})`);
    if (rules.ok && rules.rules) {
      const v = validateOrderSizeAgainstRules(calcSize, rules.rules);
      sizeValid = v.ok ? 'PASS' : 'FAIL';
      push(`SIZE VALID ${sizeValid}${v.reason ? ` · ${v.reason}` : ''}`);
    }
  } else {
    push(`CALCULATED SIZE SKIP · price=${price} equity needed`);
  }

  /** Risk gate / live lock — 진단만, 락 점유 유지하지 않음 */
  const lock = tryAcquireLiveLock();
  push(lock.ok ? 'LIVE LOCK PASS' : `LIVE LOCK BLOCK · ${lock.msg}`);
  push(lock.ok ? 'RISK GATE PASS (lock)' : 'RISK GATE BLOCK (lock)');

  push('NOTE · 이 진단은 실제 주문을 보내지 않음');

  const summaryKo = lines.join('\n');
  return NextResponse.json({
    ok: true,
    lines,
    summaryKo,
    symbol,
    minSize,
    calculatedSize: calcSize,
    sizeValid,
    positionMode: modePack.posMode,
    marginMode,
    balance: bal,
    tradePermission: perm.tradePermission,
    liveLockOk: lock.ok,
  });
}
