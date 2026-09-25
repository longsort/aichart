/**
 * BNB Parallel Pivot + 캔들분석 롱숏 스캔.
 * GET ?leverage=&minRr=
 * 기존 bnb-sfp-scan 대체(SFP 라우트는 유지·미사용).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import type { AnalyzeResponse } from '@/types';
import {
  BNB_PPL_SYMBOL,
  BNB_PPL_TP1_ROE_PCT,
  listBnbPplAutoTimeframes,
  scanBnbPplCandleOnClosedBar,
  type BnbPplCandleSignal,
  type BnbPplScanSkip,
} from '@/lib/mergedDeskBnbPplCandleTrade';

export const dynamic = 'force-dynamic';

function isSignal(x: BnbPplCandleSignal | BnbPplScanSkip): x is BnbPplCandleSignal {
  return 'signalId' in x && 'mode' in x;
}

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = Math.max(
    1,
    Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10)
  );
  const minRr = Math.max(1, Math.min(3, Number(req.nextUrl.searchParams.get('minRr')) || 1.2));
  const tfs = listBnbPplAutoTimeframes();
  const signals: BnbPplCandleSignal[] = [];
  const waiting: BnbPplCandleSignal[] = [];
  const skipped: BnbPplScanSkip[] = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  await Promise.all(
    tfs.map(async (tf) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(BNB_PPL_SYMBOL, tf, {
          recentOnly: true,
        });
        let analysis: AnalyzeResponse | null = null;
        let longPct: number | null = null;
        let shortPct: number | null = null;
        try {
          analysis = analyzeCandles(BNB_PPL_SYMBOL, tf, candles) as AnalyzeResponse & {
            aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
          };
          const pack = analysis as {
            longScore?: number;
            shortScore?: number;
            aiZonePack?: { longPct?: number | null; shortPct?: number | null } | null;
          };
          longPct =
            pack.aiZonePack?.longPct != null
              ? Number(pack.aiZonePack.longPct)
              : Number(pack.longScore) || null;
          shortPct =
            pack.aiZonePack?.shortPct != null
              ? Number(pack.aiZonePack.shortPct)
              : Number(pack.shortScore) || null;
        } catch {
          analysis = null;
        }
        const out = scanBnbPplCandleOnClosedBar({
          candles,
          timeframe: tf,
          leverage,
          minRr,
          analysis,
          longPct,
          shortPct,
        });
        if (!isSignal(out)) {
          skipped.push(out);
          return;
        }
        if (out.mode === 'enter_now') signals.push(out);
        else waiting.push(out);
      } catch (e) {
        errors.push({
          tf,
          msg: e instanceof Error ? e.message : 'scan fail',
        });
      }
    })
  );

  const rank = (s: BnbPplCandleSignal) =>
    (s.mode === 'enter_now' ? 10 : 0) +
    (s.confirmKo.includes('확정') ? 2 : 0) +
    (s.timeframe === '15m' ? 1 : 0);

  signals.sort((a, b) => rank(b) - rank(a));
  waiting.sort((a, b) => rank(b) - rank(a));

  return NextResponse.json({
    ok: true,
    symbol: BNB_PPL_SYMBOL,
    scannedAt: Date.now(),
    timeframes: tfs,
    signalCount: signals.length,
    waitCount: waiting.length,
    signals,
    waiting,
    skipped: skipped.slice(0, 8),
    errors: errors.slice(0, 6),
    hintKo: `BNB 캔들분석+PPL · 롱=PL·숏=PH · 타점미달시 AIZONE≥70 · TP ${BNB_PPL_TP1_ROE_PCT}%ROE · SFP중지 · 확정아님`,
  });
}
