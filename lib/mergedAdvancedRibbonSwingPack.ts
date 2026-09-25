import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  type InstitutionalSuperTrendCore,
} from '@/lib/institutionalSuperBand';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

export type RibbonSwingSignal = {
  barIndex: number;
  time: number;
  dir: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  tp1: number;
};

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const h = candles[i].high;
  for (let j = i - L; j < i; j++) {
    if (candles[j].high >= h) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length) return false;
    if (candles[j].high > h) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i].low;
  for (let j = i - L; j < i; j++) {
    if (candles[j].low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length) return false;
    if (candles[j].low < lo) return false;
  }
  return true;
}

function collectRibbonSwingSignals(
  candles: Candle[],
  core: InstitutionalSuperTrendCore,
  opts?: { pivotL?: number; pivotR?: number; minBarGap?: number; maxSignals?: number },
): RibbonSwingSignal[] {
  const L = opts?.pivotL ?? 2;
  const R = opts?.pivotR ?? 2;
  const minGap = opts?.minBarGap ?? 4;
  const maxSignals = opts?.maxSignals ?? 64;
  const { trend, finalUpper, finalLower } = core;
  const n = candles.length;
  const out: RibbonSwingSignal[] = [];
  let lastIdx = -minGap;

  for (let i = L; i < n - R; i++) {
    if (i - lastIdx < minGap) continue;
    const bw = finalUpper[i] - finalLower[i];
    if (!Number.isFinite(bw) || bw <= 0) continue;
    const epsTouch = Math.max(bw * 0.085, candles[i].close * 0.00018);
    const epsSl = Math.max(bw * 0.038, candles[i].close * 0.00012);

    const flipShort = i > 0 && trend[i - 1] === 1 && trend[i] === -1;
    const flipLong = i > 0 && trend[i - 1] === -1 && trend[i] === 1;

    let emit: RibbonSwingSignal | null = null;

    if (flipShort) {
      emit = {
        barIndex: i,
        time: Number(candles[i].time),
        dir: 'SHORT',
        entry: candles[i].high,
        stop: finalUpper[i] + epsSl,
        tp1: finalLower[i],
      };
    } else if (flipLong) {
      emit = {
        barIndex: i,
        time: Number(candles[i].time),
        dir: 'LONG',
        entry: candles[i].low,
        stop: finalLower[i] - epsSl,
        tp1: finalUpper[i],
      };
    } else if (pivotHigh(candles, i, L, R) && trend[i] === -1 && candles[i].high >= finalUpper[i] - epsTouch) {
      emit = {
        barIndex: i,
        time: Number(candles[i].time),
        dir: 'SHORT',
        entry: candles[i].high,
        stop: finalUpper[i] + epsSl,
        tp1: finalLower[i],
      };
    } else if (pivotLow(candles, i, L, R) && trend[i] === 1 && candles[i].low <= finalLower[i] + epsTouch) {
      emit = {
        barIndex: i,
        time: Number(candles[i].time),
        dir: 'LONG',
        entry: candles[i].low,
        stop: finalLower[i] - epsSl,
        tp1: finalUpper[i],
      };
    }

    if (emit) {
      out.push(emit);
      lastIdx = i;
    }
  }

  return out.slice(-maxSignals);
}

export function buildMergedAdvancedRibbonSwingSignals(
  candles: Candle[],
  reuseCore?: InstitutionalSuperTrendCore | null,
): RibbonSwingSignal[] {
  const safe = sanitizeChartCandlesForSeries(candles);
  if (safe.length < 8) return [];
  const core =
    reuseCore && reuseCore.trend.length === safe.length
      ? reuseCore
      : computeInstitutionalSuperTrendCore(safe, INSTITUTIONAL_BAND_DEFAULT_PERIOD, INSTITUTIONAL_BAND_DEFAULT_MULT);
  if (!core) return [];
  return collectRibbonSwingSignals(safe, core);
}

function toRatio(price: number, pMin: number, pMax: number) {
  const range = Math.max(1e-9, pMax - pMin);
  return (pMax - price) / range;
}

/**
 * 통합 고급 완전판: 차트에 그려진 ST 밴드와 동일 코어로 스윙 타점별 진입·SL·TP 수평선.
 */
export function buildMergedAdvancedRibbonSwingOverlays(params: {
  candles: Candle[];
  reuseCore?: InstitutionalSuperTrendCore | null;
}): OverlayItem[] {
  const { candles, reuseCore } = params;
  const safe = sanitizeChartCandlesForSeries(candles);
  if (safe.length < 8) return [];
  const core =
    reuseCore && reuseCore.trend.length === safe.length
      ? reuseCore
      : computeInstitutionalSuperTrendCore(safe, INSTITUTIONAL_BAND_DEFAULT_PERIOD, INSTITUTIONAL_BAND_DEFAULT_MULT);
  if (!core) return [];

  const signals = collectRibbonSwingSignals(safe, core, { maxSignals: 14 });
  if (!signals.length) return [];

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of safe) {
    pMin = Math.min(pMin, c.low);
    pMax = Math.max(pMax, c.high);
  }
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMax <= pMin) return [];

  const tEnd = Number(safe[safe.length - 1].time);
  const nNorm = Math.max(1, safe.length - 1);
  const out: OverlayItem[] = [];
  const tip = '밴드·스윙 — ST 상·하한·전환 기준(참고·비보장)';

  signals.forEach((sig, k) => {
    const i1 = Math.max(0, Math.min(sig.barIndex, safe.length - 1));
    const tStart = Number(safe[i1].time);
    const x1 = i1 / nNorm;
    const x2 = 1;
    const entryCol = sig.dir === 'LONG' ? 'rgba(249,115,22,0.94)' : 'rgba(59,130,246,0.94)';

    out.push({
      id: `merged-ribbon-swing-${k}-entry`,
      kind: 'keyLevel',
      label: sig.dir === 'LONG' ? '✕ 롱·진입' : '✕ 숏·진입',
      x1,
      y1: toRatio(sig.entry, pMin, pMax),
      x2,
      y2: toRatio(sig.entry, pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: sig.entry,
      price2: sig.entry,
      confidence: 82,
      color: entryCol,
      lineLabelColor: '#f8fafc',
      category: 'keyLevel',
      lineDash: '4 4',
      labelTooltip: tip,
    });
    out.push({
      id: `merged-ribbon-swing-${k}-sl`,
      kind: 'keyLevel',
      label: '밴드 SL',
      x1,
      y1: toRatio(sig.stop, pMin, pMax),
      x2,
      y2: toRatio(sig.stop, pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: sig.stop,
      price2: sig.stop,
      confidence: 78,
      color: 'rgba(248,113,113,0.88)',
      lineLabelColor: '#fecaca',
      category: 'keyLevel',
      lineDash: '6 4',
      labelTooltip: tip,
    });
    out.push({
      id: `merged-ribbon-swing-${k}-tp1`,
      kind: 'keyLevel',
      label: '밴드 TP1',
      x1,
      y1: toRatio(sig.tp1, pMin, pMax),
      x2,
      y2: toRatio(sig.tp1, pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: sig.tp1,
      price2: sig.tp1,
      confidence: 76,
      color: 'rgba(52,211,153,0.85)',
      lineLabelColor: '#bbf7d0',
      category: 'keyLevel',
      lineDash: '3 6',
      labelTooltip: tip,
    });
  });

  return out;
}

export type RibbonSwingChartMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'circle';
  color: string;
  text: string;
  size?: number;
};

/** 캔들 ✕ 스타일 마커 — TradingView 럭스식 숏(파랑 위)·롱(주황 아래) */
export function buildMergedAdvancedRibbonSwingChartMarkers(
  candles: Candle[],
  reuseCore?: InstitutionalSuperTrendCore | null,
): RibbonSwingChartMarker[] {
  const safe = sanitizeChartCandlesForSeries(candles);
  if (safe.length < 8) return [];
  const core =
    reuseCore && reuseCore.trend.length === safe.length
      ? reuseCore
      : computeInstitutionalSuperTrendCore(safe, INSTITUTIONAL_BAND_DEFAULT_PERIOD, INSTITUTIONAL_BAND_DEFAULT_MULT);
  if (!core) return [];
  const signals = collectRibbonSwingSignals(safe, core, { maxSignals: 80 });
  const recent = signals.slice(-32);
  return recent.map((sig) => ({
    time: sig.time as UTCTimestamp,
    position: sig.dir === 'LONG' ? 'belowBar' : 'aboveBar',
    shape: 'circle',
    color: sig.dir === 'LONG' ? '#f97316' : '#3b82f6',
    text: sig.dir === 'LONG' ? '✕·L' : '✕·S',
    size: 2,
  }));
}
