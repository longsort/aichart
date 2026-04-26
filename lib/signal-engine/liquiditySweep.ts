import type { MarketDataInput } from './types';

export function liquiditySweep(input: MarketDataInput) {
  const sweeps = input.sweeps ?? [];
  const hasSellSweep = sweeps.some((s) => s.side === 'sell');
  const hasBuySweep = sweeps.some((s) => s.side === 'buy');
  return {
    bullish: hasSellSweep,
    bearish: hasBuySweep,
    valid: hasSellSweep || hasBuySweep,
  };
}
