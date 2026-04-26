import type { Candle } from '@/types';

export type WhaleZoneBand = { low: number; high: number };

function validBand(z: WhaleZoneBand): boolean {
  const lo = Math.min(z.low, z.high);
  const hi = Math.max(z.low, z.high);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo;
}

/** 봉 가격 범위와 존 [low,high] 겹침 */
export function candleOverlapsZone(c: Candle, z: WhaleZoneBand): boolean {
  if (!validBand(z)) return false;
  const zlo = Math.min(z.low, z.high);
  const zhi = Math.max(z.low, z.high);
  return c.high >= zlo && c.low <= zhi;
}

export function candleOverlapsAnyBuyZone(c: Candle, zones: WhaleZoneBand[]): boolean {
  return zones.some((z) => validBand(z) && candleOverlapsZone(c, z));
}

export function candleOverlapsAnySellZone(c: Candle, zones: WhaleZoneBand[]): boolean {
  return zones.some((z) => validBand(z) && candleOverlapsZone(c, z));
}
