/**
 * TradingView 스타일 단일 평행채널
 * - 캔들 wick(high/low)에만 앵커
 * - 전역 고점(또는 저점) → 최근 LH/HL을 잇는 한 개의 저항/지지선
 * - 평행한 반대편 + 0.5 중앙선(점선)
 * - 선택: -0.17 / 1.25 구간(채널 폭 대비) 보조선
 */

import type { Candle } from '@/types';
import { detectPivots } from './trendlineEngine';

export type PivotPoint = { index: number; price: number };

export type ChannelSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  price1: number;
  price2: number;
};

function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

function lineExtended(
  i1: number,
  p1: number,
  i2: number,
  p2: number,
  visibleLen: number,
  min: number,
  max: number
): ChannelSegment {
  const denom = Math.max(1, visibleLen - 1);
  const rightIdx = visibleLen - 1;
  const m = i2 === i1 ? 0 : (p2 - p1) / (i2 - i1);
  const priceRight = p1 + m * (rightIdx - i1);
  return {
    x1: i1 / denom,
    y1: toRatio(p1, min, max),
    x2: Math.min(0.995, rightIdx / denom),
    y2: toRatio(priceRight, min, max),
    price1: p1,
    price2: priceRight,
  };
}

/** 같은 기울기 m, (i0,p0) 지나는 직선을 우측까지 */
function parallelExtended(
  m: number,
  i0: number,
  p0: number,
  visibleLen: number,
  min: number,
  max: number
): ChannelSegment {
  const denom = Math.max(1, visibleLen - 1);
  const rightIdx = visibleLen - 1;
  const priceRight = p0 + m * (rightIdx - i0);
  return {
    x1: i0 / denom,
    y1: toRatio(p0, min, max),
    x2: Math.min(0.995, rightIdx / denom),
    y2: toRatio(priceRight, min, max),
    price1: p0,
    price2: priceRight,
  };
}

function priceOnLine(m: number, iAnchor: number, pAnchor: number, i: number): number {
  return pAnchor + m * (i - iAnchor);
}

/** 차트에 정확히 붙이기: 두 앵커(캔들 time + wick 가격) — mapOverlays가 이걸 우선 사용 */
export type LineAnchors = {
  i1: number;
  p1: number;
  i2: number;
  p2: number;
};

export type ParallelChannelResult = {
  mode: 'descending' | 'ascending';
  /** 상단 경계 (하락: 고점 연결 / 상승: 평행 상단) */
  upper: ChannelSegment;
  /** 하단 경계 */
  lower: ChannelSegment;
  /** 0.5 중앙 (TradingView median) */
  median: ChannelSegment;
  /** -0.17 × 채널폭 (하단 바깥) */
  extBelow?: ChannelSegment;
  /** +0.25 × 채널폭 (상단 바깥, 1.25 레벨 근사) */
  extAbove?: ChannelSegment;
  /** 화면 좌표·우측 연장 시 가격 보간용 (캔들 인덱스 = visible 기준) */
  anchors: {
    upper: LineAnchors;
    lower: LineAnchors;
    median: LineAnchors;
  };
};

/**
 * 단일 채널: 하락 — 전역 최고 wick 고점 + 그 이후 가장 최근의 낮은 고점(LH) 연결,
 * 평행 하단은 그 사이 구간에서 상단선 대비 가장 깊게 벗어난 저점 wick.
 */
function buildDescendingChannel(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  min: number,
  max: number
): ParallelChannelResult | null {
  const n = candles.length;
  if (n < 8 || highs.length < 2) return null;

  let peakIdx = 0;
  let peakPrice = candles[0].high;
  for (let i = 0; i < n; i++) {
    if (candles[i].high > peakPrice) {
      peakPrice = candles[i].high;
      peakIdx = i;
    }
  }

  const highsAfter = highs.filter((h) => h.index > peakIdx && h.price < peakPrice);
  let h2: PivotPoint;
  if (highsAfter.length > 0) {
    h2 = highsAfter.reduce((a, b) => (a.index > b.index ? a : b));
  } else {
    const tail = highs.filter((h) => h.index > peakIdx).sort((a, b) => b.index - a.index);
    if (tail.length === 0) return null;
    h2 = tail[0];
    if (h2.price >= peakPrice) return null;
  }

  const h1: PivotPoint = { index: peakIdx, price: peakPrice };
  if (h2.index <= h1.index) return null;

  const m = (h2.price - h1.price) / (h2.index - h1.index);

  let bestLow: PivotPoint | null = null;
  let bestDev = 0;
  for (const l of lows) {
    if (l.index < h1.index || l.index > n - 1) continue;
    const upperAt = priceOnLine(m, h1.index, h1.price, l.index);
    const dev = upperAt - l.price;
    if (dev > bestDev) {
      bestDev = dev;
      bestLow = l;
    }
  }
  if (!bestLow || bestDev < 1e-9) return null;

  const lowerOnParallel = bestLow.price;
  const upperSeg = lineExtended(h1.index, h1.price, h2.index, h2.price, n, min, max);
  const lowerSeg = parallelExtended(m, bestLow.index, lowerOnParallel, n, min, max);

  const midI1 = h1.index;
  const midP1 = (priceOnLine(m, h1.index, h1.price, midI1) + priceOnLine(m, bestLow.index, lowerOnParallel, midI1)) / 2;
  const midI2 = n - 1;
  const midP2 =
    (priceOnLine(m, h1.index, h1.price, midI2) + priceOnLine(m, bestLow.index, lowerOnParallel, midI2)) / 2;
  const medianSeg = lineExtended(midI1, midP1, midI2, midP2, n, min, max);

  const lowerAtH2 = lowerOnParallel + m * (h2.index - bestLow.index);
  const upperAnchors: LineAnchors = { i1: h1.index, p1: h1.price, i2: h2.index, p2: h2.price };
  const lowerAnchors: LineAnchors = {
    i1: bestLow.index,
    p1: lowerOnParallel,
    i2: h2.index,
    p2: lowerAtH2,
  };
  const medianAnchors: LineAnchors = { i1: midI1, p1: midP1, i2: midI2, p2: midP2 };

  const d =
    priceOnLine(m, h1.index, h1.price, n - 1) - priceOnLine(m, bestLow.index, lowerOnParallel, n - 1);
  const dAbs = Math.abs(d);
  const extBelowSeg =
    dAbs > 1e-9
      ? parallelExtended(m, bestLow.index, lowerOnParallel - 0.17 * dAbs, n, min, max)
      : undefined;
  const extAboveSeg =
    dAbs > 1e-9
      ? parallelExtended(m, h1.index, h1.price + 0.25 * dAbs, n, min, max)
      : undefined;

  return {
    mode: 'descending',
    upper: upperSeg,
    lower: lowerSeg,
    median: medianSeg,
    extBelow: extBelowSeg,
    extAbove: extAboveSeg,
    anchors: { upper: upperAnchors, lower: lowerAnchors, median: medianAnchors },
  };
}

/** 상승 채널: 전역 최저 wick + 그 이후 가장 최근의 높은 저점(HL) */
function buildAscendingChannel(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  min: number,
  max: number
): ParallelChannelResult | null {
  const n = candles.length;
  if (n < 8 || lows.length < 2) return null;

  let troughIdx = 0;
  let troughPrice = candles[0].low;
  for (let i = 0; i < n; i++) {
    if (candles[i].low < troughPrice) {
      troughPrice = candles[i].low;
      troughIdx = i;
    }
  }

  const lowsAfter = lows.filter((l) => l.index > troughIdx && l.price > troughPrice);
  let l2: PivotPoint;
  if (lowsAfter.length > 0) {
    l2 = lowsAfter.reduce((a, b) => (a.index > b.index ? a : b));
  } else {
    const tail = lows.filter((l) => l.index > troughIdx).sort((a, b) => b.index - a.index);
    if (tail.length === 0) return null;
    l2 = tail[0];
    if (l2.price <= troughPrice) return null;
  }

  const l1: PivotPoint = { index: troughIdx, price: troughPrice };
  if (l2.index <= l1.index) return null;

  const m = (l2.price - l1.price) / (l2.index - l1.index);

  let bestHigh: PivotPoint | null = null;
  let bestDev = 0;
  for (const h of highs) {
    if (h.index < l1.index) continue;
    const lowerAt = priceOnLine(m, l1.index, l1.price, h.index);
    const dev = h.price - lowerAt;
    if (dev > bestDev) {
      bestDev = dev;
      bestHigh = h;
    }
  }
  if (!bestHigh || bestDev < 1e-9) return null;

  const lowerSeg = lineExtended(l1.index, l1.price, l2.index, l2.price, n, min, max);
  const upperSeg = parallelExtended(m, bestHigh.index, bestHigh.price, n, min, max);

  const midI1 = l1.index;
  const midP1 =
    (priceOnLine(m, l1.index, l1.price, midI1) + priceOnLine(m, bestHigh.index, bestHigh.price, midI1)) / 2;
  const midI2 = n - 1;
  const midP2 =
    (priceOnLine(m, l1.index, l1.price, midI2) + priceOnLine(m, bestHigh.index, bestHigh.price, midI2)) / 2;
  const medianSeg = lineExtended(midI1, midP1, midI2, midP2, n, min, max);

  const upperAtL2 = bestHigh.price + m * (l2.index - bestHigh.index);
  const upperAnchors: LineAnchors = {
    i1: bestHigh.index,
    p1: bestHigh.price,
    i2: l2.index,
    p2: upperAtL2,
  };
  const lowerAnchors: LineAnchors = { i1: l1.index, p1: l1.price, i2: l2.index, p2: l2.price };
  const medianAnchors: LineAnchors = { i1: midI1, p1: midP1, i2: midI2, p2: midP2 };

  const d =
    priceOnLine(m, bestHigh.index, bestHigh.price, n - 1) - priceOnLine(m, l1.index, l1.price, n - 1);
  const dAbs = Math.abs(d);
  const extBelowSeg =
    dAbs > 1e-9 ? parallelExtended(m, l1.index, l1.price - 0.17 * dAbs, n, min, max) : undefined;
  const extAboveSeg =
    dAbs > 1e-9 ? parallelExtended(m, bestHigh.index, bestHigh.price + 0.25 * dAbs, n, min, max) : undefined;

  return {
    mode: 'ascending',
    upper: upperSeg,
    lower: lowerSeg,
    median: medianSeg,
    extBelow: extBelowSeg,
    extAbove: extAboveSeg,
    anchors: { upper: upperAnchors, lower: lowerAnchors, median: medianAnchors },
  };
}

/**
 * 화면에 **하나의** 평행채널만 — 추세에 따라 하락/상승 후보 중 더 맞는 쪽 선택.
 */
export function computePrimaryParallelChannel(
  candles: Candle[],
  trend: 'bullish' | 'bearish' | 'range',
  min: number,
  max: number
): ParallelChannelResult | null {
  if (candles.length < 8) return null;
  const { highs, lows } = detectPivots(candles);
  const desc = buildDescendingChannel(candles, highs, lows, min, max);
  const asc = buildAscendingChannel(candles, highs, lows, min, max);

  if (trend === 'bearish') return desc ?? asc;
  if (trend === 'bullish') return asc ?? desc;

  if (desc && asc) {
    const last = candles[candles.length - 1].close;
    const first = candles[Math.floor(candles.length / 2)].close;
    const downBias = last < first;
    return downBias ? desc : asc;
  }
  return desc ?? asc;
}
