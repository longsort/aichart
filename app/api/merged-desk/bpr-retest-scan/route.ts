/**
 * 15m BPR 재터치+추정≥70 스캔 — BTC/ETH/BNB/XRP/SOL.
 * GET ?symbol=ALL|&leverage=&pctMin=
 * 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import {
  BPR_RETEST_PCT_MIN,
  BPR_RETEST_TF,
  listBprRetestSymbols,
  scanBprRetestOnClosedBar,
  type BprRetestSignal,
} from '@/lib/mergedDeskBprRetestTrade';
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
    Math.min(95, Number(req.nextUrl.searchParams.get('pctMin')) || BPR_RETEST_PCT_MIN)
  );
  const symQ = String(req.nextUrl.searchParams.get('symbol') || 'ALL').toUpperCase();
  const symbols =
    symQ === 'ALL' || !symQ
      ? listBprRetestSymbols()
      : listBprRetestSymbols([symQ.endsWith('USDT') ? symQ : `${symQ}USDT`]);

  const signals: BprRetestSignal[] = [];
  const skipped: Array<{ symbol: string; reasonKo: string }> = [];
  const errors: Array<{ symbol: string; msg: string }> = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(symbol, BPR_RETEST_TF, {
          recentOnly: true,
        });
        let longPct = 0;
        let shortPct = 0;
        try {
          const pack = analyzeCandles(symbol, BPR_RETEST_TF, candles) as {
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
          /* 추정 실패 → 스킵 */
        }

        const sig = scanBprRetestOnClosedBar({
          symbol,
          candles,
          longPct,
          shortPct,
          leverage,
          pctMin,
        });
        if (!sig) {
          skipped.push({
            symbol,
            reasonKo: `BPR미터치/추정미달 · 롱${longPct.toFixed(0)}/숏${shortPct.toFixed(0)} · ≥${pctMin}`,
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
    timeframe: BPR_RETEST_TF,
    pctMin,
    leverage,
    scannedAt: Date.now(),
    symbols,
    signalCount: signals.length,
    signals,
    skipped: skipped.slice(0, 12),
    errors: errors.slice(0, 8),
    hintKo:
      '15m BPR · 이탈후재터치≥2 · 추정≥70+갭10 · bias일치 · ≈40x · SL-20%·TP+8% · 확정아님',
  });
}
