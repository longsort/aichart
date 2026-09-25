import { normalizeChartTimeframe } from '@/lib/constants';

const CHART_TO_EAGLE: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '12h': '12H',
  '1d': '1D',
  '1w': '1W',
  '1M': '1M',
};

const EAGLE_TO_CHART: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1H': '1h',
  '4H': '4h',
  '12H': '12h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

const STEP_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1H': 3_600_000,
  '4h': 14_400_000,
  '4H': 14_400_000,
  '12h': 43_200_000,
  '12H': 43_200_000,
  '1d': 86_400_000,
  '1D': 86_400_000,
  '1w': 7 * 86_400_000,
  '1W': 7 * 86_400_000,
};

export function chartTfToEagle1Tf(tf: string): string {
  const n = normalizeChartTimeframe(tf);
  return CHART_TO_EAGLE[n] ?? n;
}

export function eagle1TfToChartTf(tf: string): string {
  return EAGLE_TO_CHART[tf] ?? normalizeChartTimeframe(tf);
}

export function tfStepMs(tf: string): number | null {
  if (STEP_MS[tf]) return STEP_MS[tf];
  const n = normalizeChartTimeframe(tf);
  if (n === '1M') return null;
  return STEP_MS[n] ?? null;
}

export function isoUtc(ms: number): string {
  return new Date(ms).toISOString();
}
