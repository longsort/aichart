import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import {
  bitgetFetchAccountSummary,
  bitgetFetchAllOpenPositions,
  bitgetFetchOpenPosition,
} from '@/lib/bitgetPrivateTrade';
import {
  filterAutoTradePositions,
  matchAutoTradeSymbolId,
} from '@/lib/mergedDeskAutoTradeConfig';

export const dynamic = 'force-dynamic';

/**
 * 로그인 사용자 개인 API로 실포지션 조회.
 * symbol=차트심볼 · positions[] 에 BTC/ETH/BNB/XRP 전부 포함 (수동 진입도 감지).
 */
export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const meta = readExchangeKeysMeta(auth.user);
  if (!meta) {
    return NextResponse.json({
      ok: true,
      configured: false,
      position: null,
      positions: [],
      availableUsdt: null,
      msg: 'API 미등록',
    });
  }

  if (meta.lastTestOk === false) {
    return NextResponse.json({
      ok: false,
      configured: true,
      user: auth.user,
      apiKeyMasked: meta.apiKeyMasked,
      position: null,
      positions: [],
      availableUsdt: null,
      equityUsdt: null,
      authFailed: true,
      msg: meta.lastTestMsg || 'API 인증 실패 · 재테스트 필요',
      error: meta.lastTestMsg || 'API 인증 실패',
    });
  }

  const creds = readExchangeKeysPlain(auth.user);
  if (!creds) {
    return NextResponse.json({ ok: false, error: '키 복호화 실패' }, { status: 500 });
  }

  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const [allPack, acct] = await Promise.all([
    bitgetFetchAllOpenPositions(creds),
    bitgetFetchAccountSummary(creds),
  ]);

  /** 자동매매 게이트용 — BTC/ETH/BNB/XRP만 (앱 외 코인 제외) */
  const autoPositions = filterAutoTradePositions(allPack.positions);

  const wantId = matchAutoTradeSymbolId(symbol);
  let position =
    (wantId
      ? autoPositions.find((p) => matchAutoTradeSymbolId(p.symbol) === wantId)
      : allPack.positions.find((p) => p.symbol.toUpperCase() === symbol)) ?? null;
  if (!position && allPack.ok && wantId) {
    const single = await bitgetFetchOpenPosition(creds, wantId);
    position = single.position;
  }

  const byId = (id: 'BTCUSDT' | 'ETHUSDT' | 'BNBUSDT' | 'XRPUSDT' | 'SOLUSDT') =>
    autoPositions.find((p) => matchAutoTradeSymbolId(p.symbol) === id) ?? null;

  return NextResponse.json({
    ok: allPack.ok,
    configured: true,
    user: auth.user,
    apiKeyMasked: meta.apiKeyMasked,
    position,
    /** 게이트·UI: 자동매매 심볼만 */
    positions: autoPositions,
    /** 참고용: 거래소 전체(앱 외 포함) — 동시 한도에는 미사용 */
    allExchangePositions: allPack.positions,
    btcPosition: byId('BTCUSDT'),
    ethPosition: byId('ETHUSDT'),
    bnbPosition: byId('BNBUSDT'),
    xrpPosition: byId('XRPUSDT'),
    solPosition: byId('SOLUSDT'),
    openCount: autoPositions.length,
    exchangeOpenCount: allPack.positions.filter((p) => Number(p.size) > 0).length,
    availableUsdt: acct.availableUsdt ?? null,
    equityUsdt: acct.equityUsdt ?? null,
    msg: allPack.ok ? allPack.msg : allPack.msg,
    error: allPack.ok ? undefined : allPack.msg,
  });
}
