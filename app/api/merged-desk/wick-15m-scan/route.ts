/**
 * 15분 꼬리+추정 스캔 — BTC/ETH/BNB/XRP/SOL.
 * GET ?symbol=ALL|&leverage=&pctMin=
 * 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import {
  WICK_15M_PCT_MIN,
  WICK_15M_TF,
  listWick15mSymbols,
  scanWick15mOnClosedBar,
  resolveWick15mLeverage,
  type Wick15mSignal,
} from '@/lib/mergedDeskWick15mTrade';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = resolveWick15mLeverage(
    Number(req.nextUrl.searchParams.get('leverage')) || null
  );
  const pctMin = Math.max(
    50,
    Math.min(95, Number(req.nextUrl.searchParams.get('pctMin')) || WICK_15M_PCT_MIN)
  );
  const symQ = String(req.nextUrl.searchParams.get('symbol') || 'ALL').toUpperCase();
  const symbols =
    symQ === 'ALL' || !symQ
      ? listWick15mSymbols()
      : listWick15mSymbols([symQ.endsWith('USDT') ? symQ : `${symQ}USDT`]);

  const signals: Wick15mSignal[] = [];
  const skipped: Array<{ symbol: string; reasonKo: string }> = [];
  const errors: Array<{ symbol: string; msg: string }> = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(symbol, WICK_15M_TF, {
          recentOnly: true,
        });
        let longPct = 0;
        let shortPct = 0;
        try {
          const pack = analyzeCandles(symbol, WICK_15M_TF, candles) as {
            longScore?: number;
            shortScore?: number;
            aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
          };
          longPct =
            pack.aiZonePack?.longPct != null
              ? Number(pack.aiZonePack.longPct)
              : Number(pack.longScore) || 0;
          shortPct =
            pack.aiZonePack?.shortPct != null
              ? Number(pack.aiZonePack.shortPct)
              : Number(pack.shortScore) || 0;
        } catch {
          /* 추정 실패 시 0 → 게이트에서 스킵 */
        }

        const sig = scanWick15mOnClosedBar({
          symbol,
          candles,
          longPct,
          shortPct,
          leverage,
          pctMin,
          tp1RoePct: FAST_TP1_ROE_PCT,
        });
        if (!sig) {
          skipped.push({
            symbol,
            reasonKo: `꼬리/추정미달 · 롱${longPct.toFixed(0)}/숏${shortPct.toFixed(0)} · 필요≥${pctMin}`,
          });
          return;
        }
        signals.push(sig);
      } catch (e) {
        errors.push({
          symbol,
          msg: e instanceof Error ? e.message : 'scan fail',
        });
      }
    })
  );

  return NextResponse.json({
    ok: true,
    timeframe: WICK_15M_TF,
    pctMin,
    scannedAt: Date.now(),
    symbols,
    signalCount: signals.length,
    signals,
    skipped: skipped.slice(0, 12),
    errors: errors.slice(0, 8),
    hintKo:
      '15m 마감 · 코인별단독 · BTC/BNB/XRP=꼬리+추정≥70·몸통무시 · ETH=+볼륨 · ≈40x · SL-20%ROE · TP+8%ROE · 확정아님',
  });
}
