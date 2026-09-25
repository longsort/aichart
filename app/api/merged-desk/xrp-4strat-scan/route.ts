/**
 * XRP 독수리1호 4패턴 스캔 — 1·3·5·15분.
 * GET ?leverage=&tp1RoePct=
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import {
  XRP_4STRAT_SYMBOL,
  listXrpFourStrategyTimeframes,
  scanXrpFourStrategyOnClosedBar,
  type XrpFourStrategySignal,
} from '@/lib/mergedDeskXrpFourStrategyTrade';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10));
  const tp1RoePct = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('tp1RoePct')) || 5));
  const tfs = listXrpFourStrategyTimeframes();
  const signals: XrpFourStrategySignal[] = [];
  const skipped: Array<{ tf: string; reasonKo: string }> = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  await Promise.all(
    tfs.map(async (tf) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(XRP_4STRAT_SYMBOL, tf, {
          recentOnly: true,
        });
        const sig = scanXrpFourStrategyOnClosedBar({
          candles,
          timeframe: tf,
          leverage,
          tp1RoePct,
        });
        if (!sig) {
          skipped.push({ tf, reasonKo: '필수3미충족 또는 WAIT' });
          return;
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

  signals.sort((a, b) => b.score - a.score || b.mandatoryCount - a.mandatoryCount);

  return NextResponse.json({
    ok: true,
    symbol: XRP_4STRAT_SYMBOL,
    scannedAt: Date.now(),
    timeframes: tfs,
    signalCount: signals.length,
    signal: signals[0] ?? null,
    signals,
    skipped: skipped.slice(0, 8),
    errors: errors.slice(0, 6),
    hintKo:
      'XRP 독수리1호 4패턴 · Trend/Breakout/Sweep/Absorption · 필수3+보너스 · 확정아님',
  });
}
