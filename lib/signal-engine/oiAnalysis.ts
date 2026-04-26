import type { MarketDataInput } from './types';

export function oiAnalysis(input: MarketDataInput) {
  const flush = input.oiState === 'decreasing' && input.regime !== 'trend';
  const weakTrend = input.oiState !== 'increasing' && input.regime === 'trend';
  return { flush, weakTrend };
}
