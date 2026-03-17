export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'FETUSDT'];
export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];

/** 고래·기관 zone 표시 가격 구간 (캔들 구간 무관, 120k ~ 8k 고정) */
export const ZONE_PRICE_CEIL = 120_000;
export const ZONE_PRICE_FLOOR = 8_000;

export function visibleLimit(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 1000, '3m': 1000, '5m': 1000, '15m': 900, '1h': 800, '4h': 700,
    '1d': 600, '1w': 400, '1M': 240, '1Y': 120,
  };
  return map[timeframe] ?? 700;
}
