/**
 * ETH 폭락존 터치 백그라운드 스캔 — 3m·5m·15m만.
 * AI존 롱/숏 추정 ≥70% + TP ROE 5%.
 * GET ?symbol=ETHUSDT
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import {
  ETH_DUMP_AI_ZONE_MIN_PCT,
  ETH_DUMP_TP1_ROE_PCT,
  ethAiZoneAllowsDirection,
  listBgScanTimeframes,
  listEthDumpAutoTimeframes,
  scanDumpTouchOnClosedBar,
  type BgDumpTouchSignal,
} from '@/lib/mergedDeskBgDumpTouchEngine';
import { ethDumpVolConfluenceOk } from '@/lib/mergedDeskWick15mTrade';

export const dynamic = 'force-dynamic';

function readAiZonePcts(pack: {
  longScore?: number;
  shortScore?: number;
  aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
}): { longPct: number; shortPct: number } {
  const az = pack.aiZonePack;
  const longPct =
    az?.longPct != null && Number.isFinite(Number(az.longPct))
      ? Number(az.longPct)
      : Number(pack.longScore) || 0;
  const shortPct =
    az?.shortPct != null && Number.isFinite(Number(az.shortPct))
      ? Number(az.shortPct)
      : Number(pack.shortScore) || 0;
  return { longPct, shortPct };
}

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'ETHUSDT').toUpperCase();
  if (!isBitgetPerpChartSymbol(symbol)) {
    return NextResponse.json({ ok: false, error: 'USDT-M 심볼만' }, { status: 400 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10));
  const minRr = Math.max(1, Math.min(3, Number(req.nextUrl.searchParams.get('minRr')) || 1.2));
  const isEth = symbol === 'ETHUSDT' || symbol.startsWith('ETH');
  const tfs = isEth ? listEthDumpAutoTimeframes() : listBgScanTimeframes();
  const signals: BgDumpTouchSignal[] = [];
  const skipped: Array<{ tf: string; reasonKo: string }> = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  for (let i = 0; i < tfs.length; i += 3) {
    const batch = tfs.slice(i, i + 3);
    await Promise.all(
      batch.map(async (tf) => {
        try {
          const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
            recentOnly: true,
          });
          const sig = scanDumpTouchOnClosedBar({
            symbol,
            timeframe: tf,
            candles,
            leverage,
            minRr,
            tp1RoePctOverride: isEth ? ETH_DUMP_TP1_ROE_PCT : undefined,
          });
          if (!sig) return;

          if (isEth) {
            const pack = analyzeCandles(symbol, tf, candles);
            const { longPct, shortPct } = readAiZonePcts(pack as {
              longScore?: number;
              shortScore?: number;
              aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
            });
            const gate = ethAiZoneAllowsDirection({
              direction: sig.direction,
              longPct,
              shortPct,
              minPct: ETH_DUMP_AI_ZONE_MIN_PCT,
            });
            if (!gate.allow) {
              skipped.push({ tf, reasonKo: gate.reasonKo });
              return;
            }
            const volGate = ethDumpVolConfluenceOk({
              direction: sig.direction,
              candles,
            });
            if (!volGate.allow) {
              skipped.push({ tf, reasonKo: `거래량합류 · ${volGate.reasonKo}` });
              return;
            }
            sig.aiZonePct = gate.pct;
            sig.noteKo = `ETH ${tf} 폭락존터치 · ${gate.reasonKo} · ${volGate.reasonKo} · TP ROE ${ETH_DUMP_TP1_ROE_PCT}%`;
          }

          signals.push(sig);
        } catch (e) {
          errors.push({
            tf,
            msg: e instanceof Error ? e.message : 'scan fail',
          });
        }
      })
    );
  }

  return NextResponse.json({
    ok: true,
    symbol,
    scannedAt: Date.now(),
    tfCount: tfs.length,
    timeframes: tfs,
    signalCount: signals.length,
    signals,
    skipped: skipped.slice(0, 8),
    errors: errors.slice(0, 6),
    hintKo: isEth
      ? `ETH 폭락존+AI≥${ETH_DUMP_AI_ZONE_MIN_PCT}%+거래량합류 · TP ${ETH_DUMP_TP1_ROE_PCT}%ROE · 확정아님`
      : '차트 없이도 폭락존 터치 시그널 · 확정 아님',
  });
}
