/**
 * Premium / Discount from the current causal swing range.
 * Location is a feature, not a trade instruction.
 */
import type { StructureSnapshot } from './structureEngine';

export type PremiumDiscountReport = {
  high: number | null;
  low: number | null;
  equilibrium: number | null;
  position: number | null;
  zone: 'PREMIUM' | 'EQUILIBRIUM' | 'DISCOUNT' | 'NONE';
  longFit: number | null;
  shortFit: number | null;
  note: string;
};

export function runPremiumDiscount(params: {
  lastClose: number | null | undefined;
  structure: StructureSnapshot | null | undefined;
}): PremiumDiscountReport {
  const high = params.structure?.lastSwingHigh?.price ?? params.structure?.rangeHigh ?? null;
  const low = params.structure?.lastSwingLow?.price ?? params.structure?.rangeLow ?? null;
  const px = params.lastClose;
  if (high == null || low == null || !(high > low) || px == null || !Number.isFinite(px)) {
    return {
      high: null,
      low: null,
      equilibrium: null,
      position: null,
      zone: 'NONE',
      longFit: null,
      shortFit: null,
      note: '데이터 없음',
    };
  }
  const eq = (high + low) / 2;
  const pos = (px - low) / (high - low);
  const zone: PremiumDiscountReport['zone'] =
    pos >= 0.62 ? 'PREMIUM' : pos <= 0.38 ? 'DISCOUNT' : 'EQUILIBRIUM';
  const longFit = Math.max(0, Math.min(100, (1 - pos) * 100));
  const shortFit = Math.max(0, Math.min(100, pos * 100));
  return {
    high,
    low,
    equilibrium: eq,
    position: pos,
    zone,
    longFit,
    shortFit,
    note: '',
  };
}
