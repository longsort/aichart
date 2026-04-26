import type { MarketDataInput } from './types';

export function zoneReaction(input: MarketDataInput) {
  const demandConfirmed = (input.supportLevelProbability ?? 0) >= 70 || (input.entryHoldProbability ?? 0) >= 72;
  const supplyConfirmed = (input.resistanceLevelProbability ?? 0) >= 70 || (input.invalidationLevelProbability ?? 0) >= 72;
  return { demandConfirmed, supplyConfirmed };
}
