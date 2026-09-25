/**
 * BNB 3m·5m·15m SFP 스캔 — 차트 포커스 불필요.
 * GET ?leverage=&minRr=
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { analyzeCandles } from '@/lib/analyze';
import {
  BNB_SFP_AI_MIN_PCT,
  BNB_SFP_SYMBOL,
  BNB_SFP_TP1_ROE_PCT,
  listBnbSfpAutoTimeframes,
  scanBnbSfpOnClosedBar,
  type BnbSfpSignal,
} from '@/lib/mergedDeskBnbSfpTrade';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const leverage = Math.max(1, Math.min(125, Number(req.nextUrl.searchParams.get('leverage')) || 10));
  const minRr = Math.max(1, Math.min(3, Number(req.nextUrl.searchParams.get('minRr')) || 1.2));
  const tfs = listBnbSfpAutoTimeframes();
  const signals: BnbSfpSignal[] = [];
  const skipped: Array<{ tf: string; reasonKo: string }> = [];
  const errors: Array<{ tf: string; msg: string }> = [];

  await Promise.all(
    tfs.map(async (tf) => {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(BNB_SFP_SYMBOL, tf, {
          recentOnly: true,
        });
        let longPct = 0;
        let shortPct = 0;
        try {
          const pack = analyzeCandles(BNB_SFP_SYMBOL, tf, candles) as {
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
          /* AI 추정 실패 시 SFP만으로도 시도(게이트는 0이면 통과) */
        }

        const sig = scanBnbSfpOnClosedBar({
          candles,
          timeframe: tf,
          leverage,
          minRr,
          longPct,
          shortPct,
        });
        if (!sig) {
          if (longPct > 0 || shortPct > 0) {
            skipped.push({
              tf,
              reasonKo: `SFP없음 또는 AI게이트 · 롱${longPct.toFixed(0)}/숏${shortPct.toFixed(0)}`,
            });
          }
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

  signals.sort((a, b) => {
    const rank = (s: BnbSfpSignal) => (s.railConfirm ? 2 : 0) + (s.aiZonePct ?? 0) / 100;
    return rank(b) - rank(a);
  });

  return NextResponse.json({
    ok: true,
    symbol: BNB_SFP_SYMBOL,
    scannedAt: Date.now(),
    timeframes: tfs,
    signalCount: signals.length,
    signals,
    skipped: skipped.slice(0, 8),
    errors: errors.slice(0, 6),
    hintKo: `BNB 3m·5m·15m SFP · AI≥${BNB_SFP_AI_MIN_PCT}% · TP ${BNB_SFP_TP1_ROE_PCT}%ROE · 확정아님`,
  });
}
