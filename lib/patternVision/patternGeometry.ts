import type { Candle } from '@/types';
import type { PivotPoint } from '@/types/patternVision';

const PIVOT_LEFT = 2;
const PIVOT_RIGHT = 2;
const NOISE_RATIO = 0.002;
const MIN_DISTANCE_INDEX = 3;

/**
 * Swing high/low 피벗 추출 (노이즈 감소, 중복 제거)
 */
export function extractPivots(candles: Candle[]): PivotPoint[] {
  const result: PivotPoint[] = [];
  const len = candles.length;
  if (len < PIVOT_LEFT + PIVOT_RIGHT + 1) return result;

  for (let i = PIVOT_LEFT; i < len - PIVOT_RIGHT; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - PIVOT_LEFT; j <= i + PIVOT_RIGHT; j++) {
      if (j !== i && candles[j].high >= high) isHigh = false;
      if (j !== i && candles[j].low <= low) isLow = false;
    }
    if (isHigh) result.push({ index: i, price: high, type: 'high' });
    if (isLow) result.push({ index: i, price: low, type: 'low' });
  }

  return deduplicatePivots(result);
}

function deduplicatePivots(pivots: PivotPoint[]): PivotPoint[] {
  const out: PivotPoint[] = [];
  for (const p of pivots) {
    const tooClose = out.some(
      (q) => q.type === p.type && Math.abs(q.index - p.index) < MIN_DISTANCE_INDEX
    );
    if (!tooClose) out.push(p);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** 같은 타입 연속 피벗에서 클러스터 대표값 (가격 근처 그룹) */
export function clusterPivots(pivots: PivotPoint[], priceToleranceRatio: number): PivotPoint[] {
  if (pivots.length <= 1) return pivots;
  const groups: PivotPoint[][] = [];
  for (const p of pivots) {
    const group = groups.find((g) => g.length && Math.abs(g[0].price - p.price) / (g[0].price || 1) < priceToleranceRatio);
    if (group) group.push(p);
    else groups.push([p]);
  }
  return groups.map((g) => (g.length === 1 ? g[0] : g.reduce((a, b) => (a.price >= b.price && a.type === 'high') || (a.price <= b.price && a.type === 'low') ? a : b)));
}

/** 로컬 고점 시퀀스 (시간순) */
export function localHighs(pivots: PivotPoint[]): PivotPoint[] {
  return pivots.filter((p) => p.type === 'high').sort((a, b) => a.index - b.index);
}

/** 로컬 저점 시퀀스 */
export function localLows(pivots: PivotPoint[]): PivotPoint[] {
  return pivots.filter((p) => p.type === 'low').sort((a, b) => a.index - b.index);
}

export function slope(aIdx: number, aPrice: number, bIdx: number, bPrice: number): number {
  const dx = Math.max(1, bIdx - aIdx);
  return (bPrice - aPrice) / dx;
}
