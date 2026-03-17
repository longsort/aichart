import { Candle } from '@/types';

/**
 * BPR (Balance Price Range): FVG 기반 균형 구간
 * 여러 FVG 갭의 상·하단을 클러스터링해 밸런스 가격대 도출
 */
export type BPRZone = {
  top: number;
  bottom: number;
  midpoint: number;
  strength: number;
  index: number;
};

export function detectBPR(
  fvgs: Array<{ low: number; high: number; index: number; valid: boolean }>,
  atr: number,
  maxZones = 3
): BPRZone[] {
  const valid = fvgs.filter(f => f.valid);
  if (valid.length < 2) return [];

  const tol = atr * 0.3;
  const clusters: Array<{ tops: number[]; bottoms: number[]; indices: number[] }> = [];

  for (const f of valid) {
    const mid = (f.low + f.high) / 2;
    let found = false;
    for (const c of clusters) {
      const cMid = (Math.min(...c.bottoms) + Math.max(...c.tops)) / 2;
      if (Math.abs(mid - cMid) <= tol) {
        c.tops.push(f.high);
        c.bottoms.push(f.low);
        c.indices.push(f.index);
        found = true;
        break;
      }
    }
    if (!found) clusters.push({ tops: [f.high], bottoms: [f.low], indices: [f.index] });
  }

  return clusters
    .filter(c => c.tops.length >= 2)
    .map(c => ({
      top: Math.max(...c.tops),
      bottom: Math.min(...c.bottoms),
      midpoint: (Math.max(...c.tops) + Math.min(...c.bottoms)) / 2,
      strength: c.tops.length,
      index: Math.min(...c.indices),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxZones);
}
