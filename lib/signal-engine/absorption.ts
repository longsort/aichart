import type { MarketDataInput } from './types';

export function absorption(input: MarketDataInput) {
  const bullish = (input.sellPressure ?? 0.5) > 0.58 && (input.currentPrice >= (input.supportLevel ?? 0));
  const bearish = (input.buyPressure ?? 0.5) > 0.58 && (input.currentPrice <= (input.resistanceLevel ?? Number.POSITIVE_INFINITY));
  return { bullish, bearish };
}
