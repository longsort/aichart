import type { MarketDataInput } from './types';

export function structureTrigger(input: MarketDataInput) {
  const bullishChoch = (input.chochCount ?? 0) > 0 && input.verdict === 'LONG';
  const bearishChoch = (input.chochCount ?? 0) > 0 && input.verdict === 'SHORT';
  const bullishBos = (input.bosCount ?? 0) > 0 && input.verdict === 'LONG';
  const bearishBos = (input.bosCount ?? 0) > 0 && input.verdict === 'SHORT';
  const displacementUp = (input.breakoutLevelProbability ?? 0) >= 75;
  const displacementDown = (input.invalidationLevelProbability ?? 0) >= 75;
  const retestHold = (input.entryHoldProbability ?? 0) >= 72;
  return {
    bullishChoch,
    bearishChoch,
    bullishBos,
    bearishBos,
    displacementUp,
    displacementDown,
    retestHold,
  };
}
