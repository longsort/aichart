import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { fetchMarketCandlesExtended } from '@/lib/market';
import {
  extendedBarCountForVolumeShock,
  lookbackBarsForVolumeShock,
  resolveVolumeShockFixedThresholds,
} from '@/lib/volumeShockThresholds';
import type { Candle } from '@/types';

export type VolumeShockCandleSource = 'bitget-futures-csv' | 'binance-spot';

export async function loadVolumeShockCandles(
  symbol: string,
  timeframe: string,
  lookbackDays = 30
): Promise<
  | {
      candles: Candle[];
      source: VolumeShockCandleSource;
      fixedThresholds: number[];
      lookbackBars: number;
    }
  | { error: string }
> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const tf = normalizeChartTimeframe(timeframe);
  if (!tf) return { error: 'timeframe 없음' };

  let candles: Candle[] = [];
  let source: VolumeShockCandleSource = 'binance-spot';

  try {
    const csv = await readBitgetFuturesCsv(sym, tf);
    if (csv.length >= 80) {
      candles = csv;
      source = 'bitget-futures-csv';
    }
  } catch {
    /* fallback binance */
  }

  if (candles.length < 80) {
    try {
      const n = extendedBarCountForVolumeShock(tf, lookbackDays);
      candles = await fetchMarketCandlesExtended(sym, tf, n);
      source = 'binance-spot';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '캔들 로드 실패';
      return { error: msg };
    }
  }

  if (candles.length < 80) {
    return { error: `캔들 부족 (${candles.length})` };
  }

  const lookbackBars = lookbackBarsForVolumeShock(tf, lookbackDays, candles.length);
  const fixedThresholds = resolveVolumeShockFixedThresholds(tf, source);

  return { candles, source, fixedThresholds, lookbackBars };
}
