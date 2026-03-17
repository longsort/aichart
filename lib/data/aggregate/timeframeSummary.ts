import type { VolumeDeltaResult } from './volumeDeltaAggregator';
import type { OrderbookImbalanceResult } from './orderbookImbalance';

export type TimeframeSummaryInput = {
  volumeDelta?: VolumeDeltaResult | null;
  orderbookImbalance?: OrderbookImbalanceResult | null;
  trend?: 'bullish' | 'bearish' | 'range';
};

export type TimeframeSummary = {
  buyPressure: number;
  sellPressure: number;
  volumeDelta: number;
  orderbookImbalance: number;
  timeframeTrend: 'bullish' | 'bearish' | 'range';
};

export function buildTimeframeSummary(input: TimeframeSummaryInput): TimeframeSummary {
  const vd = input.volumeDelta;
  const ob = input.orderbookImbalance;
  return {
    buyPressure: vd?.buyPressure ?? 0.5,
    sellPressure: vd?.sellPressure ?? 0.5,
    volumeDelta: vd?.volumeDelta ?? 0,
    orderbookImbalance: ob?.imbalance ?? 0,
    timeframeTrend: input.trend ?? 'range',
  };
}
