/**
 * 4전략 공용 헬퍼 — ultra ROE 재export + 가격 변환.
 */
import {
  resolveUltraScalpRoeCaps,
  type UltraTradingMode,
} from '@/lib/doksuri1/ultraScalpEngine';

export { resolveUltraScalpRoeCaps };
export type { UltraTradingMode };

export function roeTargetPriceSafe(
  entry: number,
  direction: 'LONG' | 'SHORT',
  lev: number,
  roeFrac: number
): number {
  const move = roeFrac / Math.max(1, lev);
  return direction === 'LONG' ? entry * (1 + move) : entry * (1 - move);
}
