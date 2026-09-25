/**
 * typeom·Strike Desk 공유 — 포켓·레그·연합 fusion 컨텍스트.
 */
import type { Candle } from '@/types';
import type { ClosingEnvelopeFuturesScenario, InstitutionalSuperTrendCore } from '@/lib/institutionalSuperBand';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  capZoneVerticalSpan,
  findRecentImpulseLeg,
  htfMaxPocketSpan,
  htfOtePocketBounds,
  isMonthDeskHtfTimeframe,
  monthDeskZoneLookbackBars,
} from '@/lib/monthDeskZonePrecision';
import {
  computeMonthDeskUnifiedFusion,
  type MonthDeskAnalysisFusionInput,
  type MonthDeskUnifiedFusion,
} from '@/lib/monthDeskUnifiedTradeDesk';
import {
  resolveMonthDeskZoneSignal,
  type MonthDeskConfirmedInput,
} from '@/lib/monthDeskZoneSignalPalette';
import { rangeFromPivots, structureMarksFu } from '@/lib/smcDeskOverlay';
import { computeTypeomPocket, enforceMinPocketWidth, snapPocketToStMid, atr14 } from '@/lib/monthDeskTypeomOverlays';

export type MonthDeskTypeomFusionContext = {
  fusion: MonthDeskUnifiedFusion;
  legHi: number;
  legLo: number;
  pocketTop: number;
  pocketBot: number;
  swingHigh: number;
  swingLow: number;
  tZoneStart: number;
  t2: number;
  chartTf: string;
  L: number;
};

export function resolveMonthDeskTypeomFusionContext(params: {
  candles: Candle[];
  timeframe?: string;
  swingPivot: number;
  scenario: ClosingEnvelopeFuturesScenario | null;
  stCore: InstitutionalSuperTrendCore | null;
  confirmedSignal?: MonthDeskConfirmedInput | null;
  analyzeVerdict?: 'LONG' | 'SHORT' | null;
  analyzeFusion?: MonthDeskAnalysisFusionInput | null;
}): MonthDeskTypeomFusionContext | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 12) return null;

  const chartTf = normalizeChartTimeframe(params.timeframe ?? '4h');
  const htfPrecision = isMonthDeskHtfTimeframe(chartTf);
  const L = Math.max(2, Math.min(4, Math.floor(Number(params.swingPivot) || 2)));
  const end = n - 1;
  const lookback = monthDeskZoneLookbackBars(chartTf, Math.min(200, Math.max(32, n - L - 2)));
  const start = Math.max(L, n - lookback);
  const rng = rangeFromPivots(candles, L, start, end);
  if (!rng) return null;

  const marks = structureMarksFu(candles, L, 14);
  const lastMk = marks.length ? marks[marks.length - 1]! : null;
  const bias = params.scenario?.bias ?? 'NEUTRAL';
  const biasDir: 'LONG' | 'SHORT' | 'NEUTRAL' =
    bias === 'LONG' || bias === 'SHORT' ? bias : 'NEUTRAL';

  let pocket0 = computeTypeomPocket({ candles, L, bias: biasDir, rng, lastMk });
  if (!pocket0) return null;

  let { pocketTop, pocketBot, legHi, legLo, tZoneStart } = pocket0;

  if (htfPrecision) {
    const impulse = findRecentImpulseLeg(candles, L, start, end, biasDir);
    if (impulse) {
      legHi = impulse.legHi;
      legLo = impulse.legLo;
      if (Number.isFinite(impulse.tStart)) tZoneStart = impulse.tStart;
      const ote = htfOtePocketBounds(legHi, legLo, biasDir);
      if (ote) {
        pocketTop = Math.min(ote.pocketTop, legHi);
        pocketBot = Math.max(ote.pocketBot, legLo);
        if (pocketTop <= pocketBot) {
          pocketTop = ote.pocketTop;
          pocketBot = ote.pocketBot;
        }
      }
    }
  }

  const endIdx = candles.length - 1;
  const tail = candles.slice(Math.max(0, endIdx - 6), endIdx + 1);
  let bearBars = 0;
  let bullBars = 0;
  for (const c of tail) {
    if (c.close < c.open) bearBars++;
    else if (c.close > c.open) bullBars++;
  }

  const zoneResolve = resolveMonthDeskZoneSignal(
    params.scenario,
    params.confirmedSignal ?? null,
    params.analyzeVerdict ?? null,
    {
      close: Number(candles[endIdx]?.close),
      pocketTop,
      pocketBot,
      bearBars,
      bullBars,
    }
  );

  const atr0 = atr14(candles);
  const snapped = snapPocketToStMid({
    pocketTop,
    pocketBot,
    legHi,
    legLo,
    stCore: params.stCore,
    endIdx: end,
    atrHint: atr0,
  });
  pocketTop = snapped.pocketTop;
  pocketBot = snapped.pocketBot;
  const mw = enforceMinPocketWidth(pocketTop, pocketBot, legHi, legLo, atr0);
  pocketTop = mw.pocketTop;
  pocketBot = mw.pocketBot;

  if (htfPrecision) {
    const refPx = Number(candles[end]?.close) || (pocketTop + pocketBot) / 2;
    const maxSpan = htfMaxPocketSpan({ legHi, legLo, atr: atr0, refPrice: refPx, timeframe: chartTf });
    const midPx = (pocketTop + pocketBot) / 2;
    const capped = capZoneVerticalSpan(pocketTop, pocketBot, midPx, maxSpan);
    pocketTop = Math.min(capped.top, legHi);
    pocketBot = Math.max(capped.bot, legLo);
    if (pocketTop <= pocketBot) {
      pocketTop = midPx + maxSpan / 2;
      pocketBot = midPx - maxSpan / 2;
    }
  }

  const t2 = Number(candles[end]?.time);
  if (!Number.isFinite(t2) || !Number.isFinite(tZoneStart)) return null;

  const fusion = computeMonthDeskUnifiedFusion({
    candles,
    timeframe: chartTf,
    pocketTop,
    pocketBot,
    legHi,
    legLo,
    scenario: params.scenario,
    confirmedSignal: params.confirmedSignal,
    analyze: params.analyzeFusion,
    stCore: params.stCore,
    zoneResolveSignal: zoneResolve.signal,
  });

  pocketTop = fusion.zoneTop;
  pocketBot = fusion.zoneBot;

  return {
    fusion,
    legHi,
    legLo,
    pocketTop,
    pocketBot,
    swingHigh: rng.swingHigh,
    swingLow: rng.swingLow,
    tZoneStart,
    t2,
    chartTf,
    L,
  };
}
