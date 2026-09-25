import { normalizeChartTimeframe } from '@/lib/constants';

/**
 * 주력: 동적 P95·P99 + RVOL≥2 (코드)
 * 보조: 15m 비트겟만 TV 습관용 2k·5k·10k
 */
export function resolveVolumeShockFixedThresholds(
  timeframe: string,
  source: 'bitget-futures-csv' | 'binance-spot' | 'bybit-spot'
): number[] {
  const tf = normalizeChartTimeframe(timeframe);
  if (source === 'bitget-futures-csv' && tf === '15m') return [2000, 5000, 10000];
  return [];
}

export function barsPerDayForTimeframe(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number> = {
    '1m': 1440,
    '3m': 480,
    '5m': 288,
    '15m': 96,
    '1h': 24,
    '4h': 6,
    '1d': 1,
  };
  if (map[tf]) return map[tf];
  if (tf === '1w') return 1 / 7;
  if (tf === '1M') return 1 / 30;
  if (tf === '1Y') return 1 / 365;
  return 96;
}

export function lookbackBarsForVolumeShock(timeframe: string, lookbackDays: number, totalBars: number): number {
  const tf = normalizeChartTimeframe(timeframe);
  const days = Math.max(7, Math.min(365, Math.floor(lookbackDays) || 30));
  let target: number;
  if (tf === '1w') target = Math.max(52, Math.min(156, days * 2));
  else if (tf === '1M' || tf === '1Y') target = Math.max(24, Math.min(60, days));
  else target = Math.max(200, Math.floor(days * barsPerDayForTimeframe(tf)));
  return Math.max(50, Math.min(totalBars - 2, target));
}

export function extendedBarCountForVolumeShock(timeframe: string, lookbackDays: number): number {
  const tf = normalizeChartTimeframe(timeframe);
  const lb = lookbackBarsForVolumeShock(tf, lookbackDays, 200_000);
  const pad = tf === '1m' || tf === '3m' || tf === '5m' ? 800 : 400;
  if (tf === '1w') return Math.min(520, lb + 80);
  if (tf === '1M') return Math.min(240, lb + 60);
  if (tf === '1Y') return Math.min(80, lb + 20);
  return Math.min(110_000, lb + pad);
}

export const VOLUME_SHOCK_MTF_TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;

export type VolumeShockMtfTimeframe = (typeof VOLUME_SHOCK_MTF_TIMEFRAMES)[number];
