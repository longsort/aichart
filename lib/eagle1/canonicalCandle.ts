/**
 * Live REST/WS 캔들과 CSV 히스토리를 동일 Eagle1 raw 스키마로 맞춘다.
 * Chart `Candle.time`은 초. Eagle1 `open_time`은 UTC ms.
 */
import type { Candle } from '@/types';
import type { Eagle1RawCandle } from '@/lib/eagle1/rawTypes';
import { eagle1RawMarketType } from '@/lib/eagle1/rawTypes';
import { expectedCloseTime } from '@/lib/eagle1/dataQualityValidator';

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
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

export function eagle1CandleUniqueKey(c: Pick<Eagle1RawCandle, 'exchange' | 'symbol' | 'market_type' | 'timeframe' | 'open_time'>): string {
  return `${c.exchange}|${c.symbol}|${c.market_type}|${c.timeframe}|${c.open_time}`;
}

export function chartCandleToEagle1Raw(
  c: Candle,
  meta: {
    symbol: string;
    timeframe: string;
    source: Eagle1RawCandle['source'];
    exchange?: Eagle1RawCandle['exchange'];
    downloaded_at?: number;
  }
): Eagle1RawCandle | null {
  const open_time = Number(c.time) * 1000;
  const open = Number(c.open);
  const high = Number(c.high);
  const low = Number(c.low);
  const close = Number(c.close);
  const base_volume = Number(c.volume);
  if (![open_time, open, high, low, close, base_volume].every(Number.isFinite)) return null;
  const close_time = expectedCloseTime(open_time, meta.timeframe) ?? open_time + (TF_MS[meta.timeframe] || 0);
  const exchange = meta.exchange ?? 'bitget';
  return {
    exchange,
    symbol: String(meta.symbol || 'BTCUSDT').toUpperCase(),
    market_type: eagle1RawMarketType(exchange),
    timeframe: meta.timeframe,
    open_time,
    close_time,
    open,
    high,
    low,
    close,
    base_volume,
    quote_volume: Number.isFinite(Number(c.quoteVolume)) ? Number(c.quoteVolume) : null,
    source: meta.source,
    downloaded_at: meta.downloaded_at ?? Date.now(),
  };
}

export function chartCandlesToEagle1Raw(
  candles: Candle[],
  meta: {
    symbol: string;
    timeframe: string;
    source: Eagle1RawCandle['source'];
    exchange?: Eagle1RawCandle['exchange'];
  }
): Eagle1RawCandle[] {
  const seen = new Set<string>();
  const out: Eagle1RawCandle[] = [];
  const downloaded_at = Date.now();
  for (const c of candles) {
    const row = chartCandleToEagle1Raw(c, { ...meta, downloaded_at });
    if (!row) continue;
    const key = eagle1CandleUniqueKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => a.open_time - b.open_time);
  return out;
}
