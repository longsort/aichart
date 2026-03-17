/**
 * Trendline Engine
 * Pivot 기반 추세선 탐지, 터치 검증, 최적 추세선 선택, 채널·돌파 감지
 */

import type { Candle } from '@/types';
import { atrSeries } from './indicators';

const PIVOT_LEFT = 3;
const PIVOT_RIGHT = 3;
const ATR_PERIOD = 14;
const ATR_TOLERANCE_MULT = 0.5;
const MIN_TOUCHES = 3;
const MAX_TRENDLINES_DISPLAY = 3;

export type PivotPoint = { index: number; price: number };

export type PivotResult = {
  highs: PivotPoint[];
  lows: PivotPoint[];
};

/**
 * 1. Pivot 탐지
 * High[i] > High[i-1] && High[i] > High[i+1] (좌우 3캔들 기준)
 */
export function detectPivots(candles: Candle[]): PivotResult {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];
  const len = candles.length;
  for (let i = PIVOT_LEFT; i < len - PIVOT_RIGHT; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - PIVOT_LEFT; j <= i + PIVOT_RIGHT; j++) {
      if (j === i) continue;
      if (candles[j].high >= h) isHigh = false;
      if (candles[j].low <= l) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: h });
    if (isLow) lows.push({ index: i, price: l });
  }
  return { highs, lows };
}

export type TrendlineSegment = {
  type: 'down' | 'up';
  p1: PivotPoint;
  p2: PivotPoint;
  slope: number;
  touches: number;
  touchIndices: number[];
};

function priceAt(tl: TrendlineSegment, index: number): number {
  const { p1, slope } = tl;
  return p1.price + slope * (index - p1.index);
}

/**
 * 2. 하락 추세선: pivot highs 중 High2 < High1 인 두 pivot 연결
 */
function buildDownTrendlines(highs: PivotPoint[]): TrendlineSegment[] {
  const out: TrendlineSegment[] = [];
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const p1 = highs[i];
      const p2 = highs[j];
      if (p2.price >= p1.price) continue;
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      out.push({
        type: 'down',
        p1,
        p2,
        slope,
        touches: 0,
        touchIndices: [],
      });
    }
  }
  return out;
}

/**
 * 3. 상승 추세선: pivot lows 중 Low2 > Low1 인 두 pivot 연결
 */
function buildUpTrendlines(lows: PivotPoint[]): TrendlineSegment[] {
  const out: TrendlineSegment[] = [];
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const p1 = lows[i];
      const p2 = lows[j];
      if (p2.price <= p1.price) continue;
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      out.push({
        type: 'up',
        p1,
        p2,
        slope,
        touches: 0,
        touchIndices: [],
      });
    }
  }
  return out;
}

/**
 * 4. 터치 검증: ATR 기반 tolerance, touch >= 3 이면 유효
 */
function countTouches(
  candles: Candle[],
  trendline: TrendlineSegment,
  tolerance: number
): TrendlineSegment {
  const touchIndices: number[] = [];
  const start = trendline.p1.index;
  const end = trendline.p2.index;
  for (let i = start; i <= end; i++) {
    const expected = priceAt(trendline, i);
    const price = trendline.type === 'down' ? candles[i].high : candles[i].low;
    if (Math.abs(price - expected) <= tolerance) touchIndices.push(i);
  }
  return { ...trendline, touches: touchIndices.length, touchIndices };
}

/**
 * 5. 최적 추세선 선택: touch 많음, 최근 pivot 포함, 길이 긴 순
 */
function pickBestTrendlines(
  candidates: TrendlineSegment[],
  candles: Candle[],
  maxCount: number
): TrendlineSegment[] {
  const valid = candidates.filter((t) => t.touches >= MIN_TOUCHES);
  const len = candles.length;
  valid.sort((a, b) => {
    if (b.touches !== a.touches) return b.touches - a.touches;
    const aRecent = Math.max(a.p1.index, a.p2.index);
    const bRecent = Math.max(b.p1.index, b.p2.index);
    if (bRecent !== aRecent) return bRecent - aRecent;
    const aLen = Math.abs(a.p2.index - a.p1.index);
    const bLen = Math.abs(b.p2.index - b.p1.index);
    return bLen - aLen;
  });
  return valid.slice(0, maxCount);
}

export type BreakoutState = 'UP_BREAK' | 'DOWN_BREAK' | 'NONE';

/**
 * 6. 돌파 감지
 */
function detectBreakout(
  candles: Candle[],
  trendline: TrendlineSegment,
  tolerance: number
): BreakoutState {
  if (candles.length === 0) return 'NONE';
  const lastIdx = candles.length - 1;
  const expected = priceAt(trendline, lastIdx);
  const close = candles[lastIdx].close;
  if (close > expected + tolerance) return 'UP_BREAK';
  if (close < expected - tolerance) return 'DOWN_BREAK';
  return 'NONE';
}

export type ChannelBounds = {
  upper: { p1: PivotPoint; p2: PivotPoint; slope: number };
  lower: { p1: PivotPoint; p2: PivotPoint; slope: number };
  distance: number;
};

/**
 * 8. 채널: 추세선과 평행, distance = max deviation (반대편 가격이 추세선에서 벗어난 최대 거리)
 */
function buildChannel(
  candles: Candle[],
  trendline: TrendlineSegment
): ChannelBounds | null {
  const start = trendline.p1.index;
  const end = Math.min(trendline.p2.index + 80, candles.length - 1);
  let maxDev = 0;
  for (let i = start; i <= end; i++) {
    const linePrice = priceAt(trendline, i);
    const price = trendline.type === 'down' ? candles[i].low : candles[i].high;
    const dev = trendline.type === 'down' ? linePrice - price : price - linePrice;
    if (dev > maxDev) maxDev = dev;
  }
  const distance = maxDev;
  if (distance <= 0) return null;
  if (trendline.type === 'down') {
    return {
      upper: { p1: trendline.p1, p2: trendline.p2, slope: trendline.slope },
      lower: {
        p1: { ...trendline.p1, price: trendline.p1.price - distance },
        p2: { ...trendline.p2, price: trendline.p2.price - distance },
        slope: trendline.slope,
      },
      distance,
    };
  }
  return {
    upper: {
      p1: { ...trendline.p1, price: trendline.p1.price + distance },
      p2: { ...trendline.p2, price: trendline.p2.price + distance },
      slope: trendline.slope,
    },
    lower: { p1: trendline.p1, p2: trendline.p2, slope: trendline.slope },
    distance,
  };
}

export type TrendlineEngineResult = {
  trendlines: TrendlineSegment[];
  channels: (ChannelBounds | null)[];
  breakoutStates: BreakoutState[];
  touches: number[];
  pivot: PivotResult;
};

/**
 * 엔진 진입점: pivot 탐지 → 추세선 생성 → 터치 검증 → 최적 선택 → 채널·돌파
 */
export function runTrendlineEngine(candles: Candle[]): TrendlineEngineResult {
  const pivot = detectPivots(candles);
  const atrArr = atrSeries(candles, ATR_PERIOD);
  const lastAtr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0;
  const tolerance = lastAtr * ATR_TOLERANCE_MULT;

  const downLines = buildDownTrendlines(pivot.highs).map((t) => countTouches(candles, t, tolerance));
  const upLines = buildUpTrendlines(pivot.lows).map((t) => countTouches(candles, t, tolerance));
  const all = [...downLines, ...upLines];
  const best = pickBestTrendlines(all, candles, MAX_TRENDLINES_DISPLAY);

  const channels = best.map((t) => buildChannel(candles, t));
  const breakoutStates = best.map((t) => detectBreakout(candles, t, tolerance));

  return {
    trendlines: best,
    channels,
    breakoutStates,
    touches: best.map((t) => t.touches),
    pivot,
  };
}

/** 차트 오버레이용: 비율 좌표 0~1 (x: 인덱스 비율, y: 가격 비율) */
export function trendlineToOverlaySegment(
  tl: TrendlineSegment,
  candles: Candle[],
  min: number,
  max: number
): { x1: number; y1: number; x2: number; y2: number } {
  const n = candles.length;
  const denom = Math.max(1, n - 1);
  const toY = (p: number) => (max - p) / Math.max(1e-9, max - min);
  const x1 = tl.p1.index / denom;
  const y1 = toY(tl.p1.price);
  const rightIdx = n - 1;
  const priceAtRight = priceAt(tl, rightIdx);
  const x2 = Math.min(0.995, rightIdx / denom);
  const y2 = toY(priceAtRight);
  return { x1, y1, x2, y2 };
}

export function channelToOverlaySegment(
  ch: ChannelBounds,
  trendline: TrendlineSegment,
  candles: Candle[],
  min: number,
  max: number,
  upper: boolean
): { x1: number; y1: number; x2: number; y2: number } {
  const n = candles.length;
  const denom = Math.max(1, n - 1);
  const toY = (p: number) => (max - p) / Math.max(1e-9, max - min);
  const side = upper ? ch.upper : ch.lower;
  const x1 = side.p1.index / denom;
  const y1 = toY(side.p1.price);
  const rightIdx = n - 1;
  const priceAtRight = side.p1.price + side.slope * (rightIdx - side.p1.index);
  const x2 = Math.min(0.995, rightIdx / denom);
  const y2 = toY(priceAtRight);
  return { x1, y1, x2, y2 };
}
