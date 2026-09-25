import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { mergedDeskLastCandleZoneTimes } from '@/lib/mergedAnalysisOverlayTimes';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import { buildProfileFromPanelFeatures, DEFAULT_UNIFIED_PANEL_FEATURES } from '@/lib/unifiedSignalPanelProfile';
import { MERGED_ADVANCED_UNIFIED_LS_PROFILE } from '@/lib/mergedAdvancedUnifiedLsProfile';
import { FUSION_DIRECTION_LABEL_KO, SIGNAL_GRADE_LABEL_KO } from '@/lib/unifiedSignalTypes';

function simpleAtr(candles: Candle[], period: number): number {
  const n = candles.length;
  if (n < 2) return 0;
  let sum = 0;
  let count = 0;
  const start = Math.max(1, n - period);
  for (let i = start; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : candles[n - 1].high - candles[n - 1].low;
}

function firstIdxAtOrAfter(candles: Candle[], t: number): number {
  for (let i = 0; i < candles.length; i++) {
    if (Number(candles[i].time) >= t) return i;
  }
  return Math.max(0, candles.length - 1);
}

function toRatio(price: number, min: number, max: number) {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

/**
 * 통합 고급: `buildUnifiedLsSignal` 다채널 합성을 **가격대 압력 밴드 + 기준선**으로 시각화.
 * 참고용(투자 권유·고정 승률 아님).
 */
export function buildMergedAdvancedLsFusionOverlays(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  timeframe: string;
  showRsi: boolean;
  showMacdPanel: boolean;
  showBbPanel: boolean;
}): OverlayItem[] {
  const { analysis, candles, timeframe, showRsi, showMacdPanel, showBbPanel } = params;
  if (!analysis) return [];
  const safe = sanitizeChartCandlesForSeries(candles, timeframe);
  if (safe.length < 8) return [];

  const baseProfile = buildProfileFromPanelFeatures(
    DEFAULT_UNIFIED_PANEL_FEATURES,
    { showRsiIndicators: showRsi, showMacdPanel, showBbPanel },
    MERGED_ADVANCED_UNIFIED_LS_PROFILE,
  );
  const fusion = buildUnifiedLsSignal(
    analysis,
    baseProfile,
    safe.length >= 30 ? { candles: safe } : undefined,
  );

  const last = safe[safe.length - 1];
  const { t1: tStart, t2: tEnd } = mergedDeskLastCandleZoneTimes(safe, timeframe);
  const close = Number(last.close);
  if (!Number.isFinite(tEnd) || !Number.isFinite(tStart) || !Number.isFinite(close)) return [];

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of safe) {
    pMin = Math.min(pMin, c.low);
    pMax = Math.max(pMax, c.high);
  }
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMax <= pMin) return [];

  const atr = simpleAtr(safe, 14);
  const atrUse = Number.isFinite(atr) && atr > 0 ? atr : Math.max(Math.abs(last.high - last.low), close * 0.002);

  const longW = fusion.longDisplay / 100;
  const shortW = fusion.shortDisplay / 100;
  const edgeR = fusion.edge;

  const longAlpha = Math.min(0.2, 0.055 + longW * 0.14);
  const shortAlpha = Math.min(0.2, 0.055 + shortW * 0.14);

  const longBandUpper = close - atr * 0.02;
  const longBandLower = close - atr * (0.82 + shortW * 0.38);
  const shortBandLower = close + atr * 0.02;
  const shortBandUpper = close + atr * (0.82 + longW * 0.38);

  const gradeKo = SIGNAL_GRADE_LABEL_KO[fusion.grade];
  const dirKo = FUSION_DIRECTION_LABEL_KO[fusion.direction];
  const labelText = `합성 ${dirKo} · ${gradeKo} · L${Math.round(fusion.longDisplay)}/S${Math.round(fusion.shortDisplay)}`;
  const explainTip = [...fusion.explain.slice(0, 4), `격차 ${edgeR > 0 ? '+' : ''}${Math.round(edgeR)}`].join(' | ');

  const x1 = 0;
  const x2 = 1;

  const longZone: OverlayItem = {
    id: 'merged-ls-fusion-pressure-demand',
    kind: 'demandZone',
    label: `합성·롱압 ${Math.round(fusion.longDisplay)}`,
    x1,
    y1: toRatio(Math.max(longBandLower, longBandUpper), pMin, pMax),
    x2,
    y2: toRatio(Math.min(longBandLower, longBandUpper), pMin, pMax),
    time1: tStart,
    time2: tEnd,
    price1: Math.max(longBandLower, longBandUpper),
    price2: Math.min(longBandLower, longBandUpper),
    confidence: Math.round(fusion.longDisplay),
    color: `rgba(34,197,94,${longAlpha.toFixed(3)})`,
    category: 'zones',
    zoneFillPreserve: true,
    labelTooltip: explainTip,
    overlayZoneExtraClass: 'overlay-zone--merged-ls-fusion',
  };

  const shortZone: OverlayItem = {
    id: 'merged-ls-fusion-pressure-supply',
    kind: 'supplyZone',
    label: `합성·숏압 ${Math.round(fusion.shortDisplay)}`,
    x1,
    y1: toRatio(Math.max(shortBandLower, shortBandUpper), pMin, pMax),
    x2,
    y2: toRatio(Math.min(shortBandLower, shortBandUpper), pMin, pMax),
    time1: tStart,
    time2: tEnd,
    price1: Math.max(shortBandLower, shortBandUpper),
    price2: Math.min(shortBandLower, shortBandUpper),
    confidence: Math.round(fusion.shortDisplay),
    color: `rgba(248,113,113,${shortAlpha.toFixed(3)})`,
    category: 'zones',
    zoneFillPreserve: true,
    labelTooltip: explainTip,
    overlayZoneExtraClass: 'overlay-zone--merged-ls-fusion',
  };

  const eqLine: OverlayItem = {
    id: 'merged-ls-fusion-equilibrium',
    kind: 'keyLevel',
    label: labelText,
    x1,
    y1: toRatio(close, pMin, pMax),
    x2,
    y2: toRatio(close, pMin, pMax),
    time1: tStart,
    time2: tEnd,
    price1: close,
    price2: close,
    confidence: 72,
    color: 'rgba(148,163,184,0.72)',
    lineLabelColor: '#e2e8f0',
    category: 'keyLevel',
    lineDash: '4 6',
    labelTooltip: explainTip,
  };

  return [longZone, shortZone, eqLine];
}
