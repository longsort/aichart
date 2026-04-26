import type { MarketDataInput } from './types';

export function divergence(input: MarketDataInput) {
  const bullish = input.rsiVerdict === 'LONG';
  const bearish = input.rsiVerdict === 'SHORT';
  return { bullish, bearish };
}
