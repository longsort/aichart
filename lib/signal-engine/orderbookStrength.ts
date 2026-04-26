import type { MarketDataInput } from './types';

export function orderbookStrength(input: MarketDataInput) {
  const supportStrong = (input.orderbookImbalance ?? 0) > 0.05;
  const resistanceStrong = (input.orderbookImbalance ?? 0) < -0.05;
  return { supportStrong, resistanceStrong };
}
