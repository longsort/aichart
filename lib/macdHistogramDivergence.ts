/**
 * MACD 히스토그램 기준 다이버전스 — RSI 다이버와 별개로 가격 피벗 vs hist 기울기 불일치를 한 쌍으로 반환.
 * 교육·참고용, 확정 신호 아님.
 */
import type { Candle } from '@/types';

export type MacdHistDivergenceSegment = {
  type: 'bullish' | 'bearish';
  index1: number;
  index2: number;
  price1: number;
  price2: number;
};

function pivotHigh(candles: Candle[], index: number, left: number, right: number): boolean {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].high;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].high >= v) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], index: number, left: number, right: number): boolean {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].low;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].low <= v) return false;
  }
  return true;
}

const PIVOT_L = 2;
const PIVOT_R = 2;
const MIN_GAP = 5;

function histEps(h: number): number {
  return 1e-9 + Math.abs(h) * 0.02 + 1e-12;
}

/**
 * 최근 피벗 두 개만 검사 — 강세: 저점 갱신 + hist 저점 상승 / 약세: 고점 갱신 + hist 고점 하락
 */
export function buildMacdHistogramDivergenceSegments(
  candles: Candle[],
  hist: number[]
): MacdHistDivergenceSegment[] {
  const n = Math.min(candles.length, hist.length);
  if (n < MIN_GAP + PIVOT_L + PIVOT_R + 2) return [];
  const pivL: number[] = [];
  const pivH: number[] = [];
  for (let i = PIVOT_L; i < n - PIVOT_R; i++) {
    if (pivotLow(candles, i, PIVOT_L, PIVOT_R)) pivL.push(i);
    if (pivotHigh(candles, i, PIVOT_L, PIVOT_R)) pivH.push(i);
  }
  const out: MacdHistDivergenceSegment[] = [];
  if (pivL.length >= 2) {
    const i1 = pivL[pivL.length - 2];
    const i2 = pivL[pivL.length - 1];
    const p1 = candles[i1].low;
    const p2 = candles[i2].low;
    const h1 = hist[i1] ?? 0;
    const h2 = hist[i2] ?? 0;
    if (i2 - i1 >= MIN_GAP && p2 < p1 && h2 > h1 + histEps(h1)) {
      out.push({ type: 'bullish', index1: i1, index2: i2, price1: p1, price2: p2 });
    }
  }
  if (pivH.length >= 2) {
    const i1 = pivH[pivH.length - 2];
    const i2 = pivH[pivH.length - 1];
    const p1 = candles[i1].high;
    const p2 = candles[i2].high;
    const h1 = hist[i1] ?? 0;
    const h2 = hist[i2] ?? 0;
    if (i2 - i1 >= MIN_GAP && p2 > p1 && h2 < h1 - histEps(h1)) {
      out.push({ type: 'bearish', index1: i1, index2: i2, price1: p1, price2: p2 });
    }
  }
  return out;
}
