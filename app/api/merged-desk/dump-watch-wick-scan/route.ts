/**
 * GET /api/merged-desk/dump-watch-wick-scan
 * 15m 폭락감시+윗꼬리+저항≥70+연속매도거래량 → 숏.
 * ?symbol=ALL|&leverage=&pctMin=
 * 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import {
  DUMP_WATCH_WICK_PCT_MIN,
  DUMP_WATCH_WICK_TF,
  listDumpWatchWickSymbols,
  scanDumpWatchWickShortOnClosedBar,
  type DumpWatchWickSignal,
} from '@/lib/mergedDeskDumpWatchWickShort';
import { resolveWick15mLeverage } from '@/lib/mergedDeskWick15mTrade';

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
    Math.min(95, Number(req.nextUrl.searchParams.get('pctMin')) || DUMP_WATCH_WICK_PCT_MIN)
  );
  const symQ = String(req.nextUrl.searchParams.get('symbol') || 'ALL').toUpperCase();
  const symbols =
    symQ === 'ALL' || !symQ
      ? listDumpWatchWickSymbols()
      : listDumpWatchWickSymbols([symQ.endsWith('USDT') ? symQ : `${symQ}USDT`]);

  const signals: DumpWatchWickSignal[] = [];
  const skipped: Array<{ symbol: string; reasonKo: string }> = [];
  const errors: Array<{ symbol: string; msg: string }> = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(symbol, DUMP_WATCH_WICK_TF, {
          recentOnly: true,
        });
        let longPct = 0;
        let shortPct = 0;
        try {
          const pack = analyzeCandles(symbol, DUMP_WATCH_WICK_TF, candles) as {
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
          /* ignore */
        }

        const sig = scanDumpWatchWickShortOnClosedBar({
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
            reasonKo: `폭락감시합류미달 · 롱${longPct.toFixed(0)}/숏${shortPct.toFixed(0)} · 필요숏≥${pctMin}`,
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
    timeframe: DUMP_WATCH_WICK_TF,
    leverage,
    pctMin,
    signals,
    skipped,
    errors,
    hintKo: '15m 폭락감시+윗꼬리+저항≥70+연속매도량 · 기존 신호와 병행 · 확정아님',
  });
}
