/**
 * 통합·분석 — 스윙 피벗(고/저) 캔들 시가·가격에 정확히 맞춘 추세선·평행 채널.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  mergedDesk4hReferencePivotWindowForTf,
  mergedDesk4hReferenceSwingChannelLookbackForTf,
} from '@/lib/mergedDesk4hReference';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

export type CandlePivot = { i: number; price: number; time: number };

function workCandles(candles: Candle[], timeframe: string): Candle[] {
  return sanitizeChartCandlesForSeries(mergedWorkCandles(candles, timeframe), timeframe);
}

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const h = candles[i]!.high;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.high >= h) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.high > h) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i]!.low;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.low < lo) return false;
  }
  return true;
}

/** 전 TF 4h 채널 lookback (42) */
export function mergedDeskChannelLookbackBars(timeframe?: string): number {
  return mergedDesk4hReferenceSwingChannelLookbackForTf(timeframe);
}

export function collectSwingPivots(
  candles: Candle[],
  timeframe: string
): { highs: CandlePivot[]; lows: CandlePivot[] } {
  const safe = workCandles(candles, timeframe);
  const lookback = Math.min(mergedDeskChannelLookbackBars(timeframe), safe.length - 4);
  const minLb = safe.length >= 20 ? 12 : 6;
  if (lookback < minLb) return { highs: [], lows: [] };

  const { L, R } = mergedDesk4hReferencePivotWindowForTf(timeframe);
  const start = Math.max(L, safe.length - lookback);
  const highs: CandlePivot[] = [];
  const lows: CandlePivot[] = [];

  for (let i = start + L; i < safe.length - R; i++) {
    if (pivotHigh(safe, i, L, R)) {
      highs.push({ i, price: safe[i]!.high, time: Number(safe[i]!.time) });
    }
    if (pivotLow(safe, i, L, R)) {
      lows.push({ i, price: safe[i]!.low, time: Number(safe[i]!.time) });
    }
  }
  const tailFrom = Math.max(0, safe.length - R - 1);
  let maxI = -1;
  let maxH = -Infinity;
  let minI = -1;
  let minL = Infinity;
  for (let i = tailFrom; i < safe.length; i++) {
    const h = Number(safe[i]!.high);
    const l = Number(safe[i]!.low);
    if (h > maxH) {
      maxH = h;
      maxI = i;
    }
    if (l < minL) {
      minL = l;
      minI = i;
    }
  }
  const lastH = highs[highs.length - 1];
  if (maxI >= 0 && (!lastH || maxH > lastH.price)) {
    const pt = { i: maxI, price: maxH, time: Number(safe[maxI]!.time) };
    if (lastH && maxI - lastH.i <= Math.max(R * 2, 4)) highs[highs.length - 1] = pt;
    else highs.push(pt);
  }
  const lastL = lows[lows.length - 1];
  if (minI >= 0 && (!lastL || minL < lastL.price)) {
    const pt = { i: minI, price: minL, time: Number(safe[minI]!.time) };
    if (lastL && minI - lastL.i <= Math.max(R * 2, 4)) lows[lows.length - 1] = pt;
    else lows.push(pt);
  }
  if (start < safe.length) {
    let absHi = start;
    let absH = -Infinity;
    let absLo = start;
    let absLval = Infinity;
    for (let i = start; i < safe.length; i++) {
      const h = Number(safe[i]!.high);
      const l = Number(safe[i]!.low);
      if (h > absH) {
        absH = h;
        absHi = i;
      }
      if (l < absLval) {
        absLval = l;
        absLo = i;
      }
    }
    if (Number.isFinite(absH) && absH > 0 && !highs.some((p) => p.price >= absH - 1e-9)) {
      highs.push({ i: absHi, price: absH, time: Number(safe[absHi]!.time) });
      highs.sort((a, b) => a.i - b.i);
    }
    if (Number.isFinite(absLval) && !lows.some((p) => p.price <= absLval + 1e-9)) {
      lows.push({ i: absLo, price: absLval, time: Number(safe[absLo]!.time) });
      lows.sort((a, b) => a.i - b.i);
    }
  }
  return { highs, lows };
}

/** 전 TF 4h 피벗 추세선 최소 간격(봉) */
export function mergedDeskPivotMinBars(_timeframe?: string): number {
  return 6;
}

export function pickSwingPivotPair(
  pivots: CandlePivot[],
  timeframe: string,
  mode: 'max' | 'min' | 'last' = 'last'
): [CandlePivot, CandlePivot] | null {
  return pickTrendPair(pivots, mergedDeskPivotMinBars(timeframe), mode);
}

function pickTrendPair(
  pivots: CandlePivot[],
  minBars = 6,
  mode: 'max' | 'min' | 'last' = 'last'
): [CandlePivot, CandlePivot] | null {
  if (pivots.length < 2) return null;
  if (mode === 'last') {
    const p2 = pivots[pivots.length - 1]!;
    for (let k = pivots.length - 2; k >= 0; k--) {
      const p1 = pivots[k]!;
      if (p2.i - p1.i >= minBars) return [p1, p2];
    }
    return [pivots[pivots.length - 2]!, p2];
  }
  let extremeIdx = 0;
  for (let i = 1; i < pivots.length; i++) {
    const p = pivots[i]!;
    const e = pivots[extremeIdx]!;
    if (mode === 'max' && p.price > e.price) extremeIdx = i;
    if (mode === 'min' && p.price < e.price) extremeIdx = i;
  }
  const p1 = pivots[extremeIdx]!;
  let p2: CandlePivot | null = null;
  for (let k = extremeIdx + 1; k < pivots.length; k++) {
    if (pivots[k]!.i - p1.i >= minBars) p2 = pivots[k]!;
  }
  if (p2) return [p1, p2];
  for (let k = extremeIdx - 1; k >= 0; k--) {
    if (p1.i - pivots[k]!.i >= minBars) {
      const earlier = pivots[k]!;
      return earlier.i <= p1.i ? [earlier, p1] : [p1, earlier];
    }
  }
  const other = extremeIdx === 0 ? pivots[1]! : pivots[0]!;
  return p1.i <= other.i ? [p1, other] : [other, p1];
}

function priceOnLine(p1: CandlePivot, p2: CandlePivot, idx: number): number {
  const slope = (p2.price - p1.price) / Math.max(1, p2.i - p1.i);
  return p1.price + slope * (idx - p1.i);
}

function extendPivotLine(
  p1: CandlePivot,
  p2: CandlePivot,
  candles: Candle[],
  iEnd: number
): { time1: number; price1: number; time2: number; price2: number } {
  const t1 = p1.time;
  const t2 = Number(candles[iEnd]!.time);
  return {
    time1: t1,
    price1: p1.price,
    time2: t2,
    price2: priceOnLine(p1, p2, iEnd),
  };
}

export type CandleTrendChannelGeom = {
  upper: [CandlePivot, CandlePivot];
  lower: [CandlePivot, CandlePivot];
  upperEnd: { time: number; price: number };
  lowerEnd: { time: number; price: number };
  midEnd: { time: number; price: number };
};

export function computeCandleTrendChannelGeom(
  candles: Candle[],
  timeframe: string
): CandleTrendChannelGeom | null {
  const safe = workCandles(candles, timeframe);
  const { highs, lows } = collectSwingPivots(candles, timeframe);
  const hiPair = pickTrendPair(highs, mergedDeskPivotMinBars(timeframe), 'max');
  const loPair = pickTrendPair(lows, mergedDeskPivotMinBars(timeframe), 'min');
  if (!hiPair || !loPair) return null;

  const iEnd = safe.length - 1;
  const [h1, h2] = hiPair;
  const [l1, l2] = loPair;
  const upperEnd = extendPivotLine(h1, h2, safe, iEnd);
  const lowerEnd = extendPivotLine(l1, l2, safe, iEnd);
  const midPrice1 = (h1.price + l1.price) / 2;
  const midPrice2 = (upperEnd.price2 + lowerEnd.price2) / 2;

  return {
    upper: [h1, h2],
    lower: [l1, l2],
    upperEnd: { time: upperEnd.time2, price: upperEnd.price2 },
    lowerEnd: { time: lowerEnd.time2, price: lowerEnd.price2 },
    midEnd: { time: upperEnd.time2, price: midPrice2 },
  };
}

/** 피벗 고점·저점을 지나는 추세선 + 평행 채널 (캔들 시각·가격 스냅) */
export function buildCandleAnchoredSwingChannel(
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  const safe = workCandles(candles, timeframe);
  const geom = computeCandleTrendChannelGeom(candles, timeframe);
  if (!geom) return [];

  const [h1, h2] = geom.upper;
  const [l1, l2] = geom.lower;
  const upperLine = extendPivotLine(h1, h2, safe, safe.length - 1);
  const lowerLine = extendPivotLine(l1, l2, safe, safe.length - 1);
  /** 끝점은 마지막 봉까지 연장하되, 앵커는 피벗 캔들 고·저가 그대로 */
  upperLine.price1 = h1.price;
  lowerLine.price1 = l1.price;

  const analysisStart = Math.min(h2.time, l2.time);
  const lerpOnLine = (t0: number, p0: number, t1: number, p1: number, t: number) => {
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return p0;
    const r = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
    return p0 + (p1 - p0) * r;
  };
  const upperAtAnalysis = lerpOnLine(
    upperLine.time1,
    upperLine.price1,
    upperLine.time2,
    upperLine.price2,
    analysisStart
  );
  const lowerAtAnalysis = lerpOnLine(
    lowerLine.time1,
    lowerLine.price1,
    lowerLine.time2,
    lowerLine.price2,
    analysisStart
  );
  const midPrice1 = (h1.price + l1.price) / 2;
  const midAtAnalysis = lerpOnLine(h1.time, midPrice1, upperLine.time2, geom.midEnd.price, analysisStart);

  const ascending = upperLine.price2 >= upperLine.price1;
  const featureKo = '스윙채널';
  const tip = `${featureKo} — 피벗 고·저점 통과 추세선(조건부 참고)`;
  const tipUpper = `${featureKo} 상단·저항 — 스윙 고점 레일`;
  const tipMid = `${featureKo} 중심 — 상·하 레일 균형`;
  const tipLower = `${featureKo} 하단·지지 — 스윙 저점 레일`;

  const trend = (
    id: string,
    _label: string,
    tipLine: string,
    t1: number,
    p1: number,
    t2: number,
    p2: number,
    color: string,
    dash?: string
  ): OverlayItem => ({
    id,
    kind: 'trendLine',
    /** 마지막 봉에 라벨 몰림 방지 — 선만, 툴팁만 */
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1 as UTCTimestamp,
    price1: p1,
    time2: t2 as UTCTimestamp,
    price2: p2,
    confidence: 78,
    color,
    lineLabelColor: '#e2e8f0',
    category: 'chartPrimeTrendChannels',
    lineDash: dash,
    lineStrokeWidth: 2,
    noProject: true,
    overlayZoneExtraClass:
      'merged-desk-candle-trend merged-swing-channel merged-desk-channel-no-end-label',
    labelTooltip: tipLine,
  });

  const band: OverlayItem = {
    id: 'merged-swing-channel-band',
    kind: 'channelBand',
    label: '',
    zoneFaceBase: featureKo,
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: analysisStart as UTCTimestamp,
    time2: upperLine.time2 as UTCTimestamp,
    price1: upperLine.price2,
    price2: lowerLine.price2,
    confidence: 62,
    color: 'rgba(56,189,248,0.08)',
    category: 'chartPrimeTrendChannels',
    structureBias: ascending ? 'bullish' : 'bearish',
    channelBand: {
      time1: analysisStart,
      time2: upperLine.time2,
      priceHigh1: upperAtAnalysis,
      priceHigh2: upperLine.price2,
      priceLow1: lowerAtAnalysis,
      priceLow2: lowerLine.price2,
    },
    overlayZoneExtraClass:
      'merged-desk-candle-trend merged-swing-channel merged-desk-channel-no-end-label',
    labelTooltip: tip,
  };

  return [
    band,
    trend(
      'merged-swing-channel-upper',
      `${featureKo}상단·저항`,
      tipUpper,
      analysisStart,
      upperAtAnalysis,
      upperLine.time2,
      upperLine.price2,
      'rgba(51,124,79,0.78)',
      '6 4'
    ),
    trend(
      'merged-swing-channel-mid',
      `${featureKo}중심`,
      tipMid,
      analysisStart,
      midAtAnalysis,
      upperLine.time2,
      geom.midEnd.price,
      'rgba(148,163,184,0.55)',
      '3 5'
    ),
    trend(
      'merged-swing-channel-lower',
      `${featureKo}하단·지지`,
      tipLower,
      analysisStart,
      lowerAtAnalysis,
      lowerLine.time2,
      lowerLine.price2,
      'rgba(165,45,45,0.78)',
      '6 4'
    ),
  ];
}
