/**
 * Triple Top / Triple Bottom 패턴 탐지
 * - Triple Top: 3개 피크 → Underneath Support (하단 지지선, 2개 valley 연결) → 아래 돌파 시 패턴 완성
 * - Triple Bottom: 3개 밸리 → Overhead Support (상단 저항선, 2개 peak 연결) → 위 돌파 시 패턴 완성
 * 분·시간·일·주 차트 각각 스스로 분석
 */

import type { Candle } from '@/types';
import { detectPivots, type PivotPoint } from './trendlineEngine';
import { atrSeries } from './indicators';

const ATR_PERIOD = 14;
const PRICE_TOLERANCE_ATR = 0.6; // 피크/밸리 유사 구간 판정
const BREAKOUT_ATR = 0.3; // 돌파 인정 시 ATR 비율

export type TripleTopResult = {
  type: 'triple_top';
  resistancePrice: number; // 3개 피크 수준
  underneathSupportPrice: number; // 하단 지지선 (2개 valley)
  peakIndices: [number, number, number];
  valleyIndices: [number, number];
  breakout: 'DOWN_BREAK' | null;
  targetPrice?: number; // resistance - (resistance - support) = support - height
};

export type TripleBottomResult = {
  type: 'triple_bottom';
  supportPrice: number; // 3개 밸리 수준
  overheadSupportPrice: number; // 상단 저항선 (2개 peak)
  valleyIndices: [number, number, number];
  peakIndices: [number, number];
  breakout: 'UP_BREAK' | null;
  targetPrice?: number;
};

export type TriplePatternResult = TripleTopResult | TripleBottomResult | null;

function findTripleTop(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  tolerance: number
): TripleTopResult | null {
  // 3개 피크 + 2개 밸리 (Peak1 - Valley1 - Peak2 - Valley2 - Peak3) — 최근 패턴 우선
  for (let i = highs.length - 3; i >= 0; i--) {
    const p1 = highs[i];
    const p2 = highs[i + 1];
    const p3 = highs[i + 2];
    const avgPeak = (p1.price + p2.price + p3.price) / 3;
    const peakRange = Math.max(
      Math.abs(p1.price - p2.price),
      Math.abs(p2.price - p3.price),
      Math.abs(p1.price - p3.price)
    );
    if (peakRange > tolerance) continue;

    const resistancePrice = avgPeak;

    const betw1 = lows.filter((l) => l.index > p1.index && l.index < p2.index);
    const betw2 = lows.filter((l) => l.index > p2.index && l.index < p3.index);
    const v1 = betw1.length ? betw1.reduce((a, b) => (a.price < b.price ? a : b)) : null;
    const v2 = betw2.length ? betw2.reduce((a, b) => (a.price < b.price ? a : b)) : null;
    if (!v1 || !v2) continue;

    const underneathSupportPrice = (v1.price + v2.price) / 2;
    if (underneathSupportPrice >= resistancePrice - tolerance * 0.5) continue;

    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const breakoutTol = tolerance * BREAKOUT_ATR;
    const breakout: 'DOWN_BREAK' | null =
      lastClose < underneathSupportPrice - breakoutTol ? 'DOWN_BREAK' : null;

    const height = resistancePrice - underneathSupportPrice;
    const targetPrice = underneathSupportPrice - height;

    return {
      type: 'triple_top',
      resistancePrice,
      underneathSupportPrice,
      peakIndices: [p1.index, p2.index, p3.index],
      valleyIndices: [v1.index, v2.index],
      breakout,
      targetPrice,
    };
  }
  return null;
}

function findTripleBottom(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  tolerance: number
): TripleBottomResult | null {
  for (let i = lows.length - 3; i >= 0; i--) {
    const v1 = lows[i];
    const v2 = lows[i + 1];
    const v3 = lows[i + 2];
    const avgValley = (v1.price + v2.price + v3.price) / 3;
    const valleyRange = Math.max(
      Math.abs(v1.price - v2.price),
      Math.abs(v2.price - v3.price),
      Math.abs(v1.price - v3.price)
    );
    if (valleyRange > tolerance) continue;

    const supportPrice = avgValley;

    const betw1 = highs.filter((h) => h.index > v1.index && h.index < v2.index);
    const betw2 = highs.filter((h) => h.index > v2.index && h.index < v3.index);
    const p1 = betw1.length ? betw1.reduce((a, b) => (a.price > b.price ? a : b)) : null;
    const p2 = betw2.length ? betw2.reduce((a, b) => (a.price > b.price ? a : b)) : null;
    if (!p1 || !p2) continue;

    const overheadSupportPrice = (p1.price + p2.price) / 2;
    if (overheadSupportPrice <= supportPrice + tolerance * 0.5) continue;

    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const breakoutTol = tolerance * BREAKOUT_ATR;
    const breakout: 'UP_BREAK' | null =
      lastClose > overheadSupportPrice + breakoutTol ? 'UP_BREAK' : null;

    const height = overheadSupportPrice - supportPrice;
    const targetPrice = overheadSupportPrice + height;

    return {
      type: 'triple_bottom',
      supportPrice,
      overheadSupportPrice,
      valleyIndices: [v1.index, v2.index, v3.index],
      peakIndices: [p1.index, p2.index],
      breakout,
      targetPrice,
    };
  }
  return null;
}

/**
 * Triple Top / Triple Bottom 탐지 — 분·시간·일·주 각 차트에 적용
 */
export function detectTriplePattern(candles: Candle[]): TriplePatternResult {
  if (!candles || candles.length < 20) return null;

  const pivot = detectPivots(candles);
  const atrArr = atrSeries(candles, ATR_PERIOD);
  const lastAtr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0;
  const tolerance = lastAtr * PRICE_TOLERANCE_ATR || candles[0].close * 0.005;

  const tripleTop = findTripleTop(candles, pivot.highs, pivot.lows, tolerance);
  if (tripleTop) return tripleTop;

  const tripleBottom = findTripleBottom(candles, pivot.highs, pivot.lows, tolerance);
  return tripleBottom;
}
