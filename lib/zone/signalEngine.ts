import type { Verdict } from '@/types';
import type { StrongZoneOutput } from '@/types';

export type ZoneSignalResult = {
  verdict: Verdict;
  confidence: number;
  nearestBuyZone: StrongZoneOutput | null;
  nearestSellZone: StrongZoneOutput | null;
};

export function computeSignalFromZones(
  buyZones: StrongZoneOutput[],
  sellZones: StrongZoneOutput[],
  currentPrice: number
): ZoneSignalResult {
  const nearestBuy = buyZones.length
    ? buyZones.reduce((a, b) =>
        Math.abs((a.low + a.high) / 2 - currentPrice) <
        Math.abs((b.low + b.high) / 2 - currentPrice)
          ? a
          : b
      )
    : null;
  const nearestSell = sellZones.length
    ? sellZones.reduce((a, b) =>
        Math.abs((a.low + a.high) / 2 - currentPrice) <
        Math.abs((b.low + b.high) / 2 - currentPrice)
          ? a
          : b
      )
    : null;

  const buyProb = nearestBuy?.probability ?? 0;
  const sellProb = nearestSell?.probability ?? 0;
  const diff = buyProb - sellProb;

  let verdict: Verdict = 'WATCH';
  let confidence = 50;
  if (diff >= 15) {
    verdict = 'LONG';
    confidence = Math.min(92, 50 + diff * 0.8);
  } else if (diff <= -15) {
    verdict = 'SHORT';
    confidence = Math.min(92, 50 + Math.abs(diff) * 0.8);
  } else {
    confidence = 50 + diff * 0.5;
  }

  return {
    verdict,
    confidence: Math.round(confidence),
    nearestBuyZone: nearestBuy ?? null,
    nearestSellZone: nearestSell ?? null,
  };
}
