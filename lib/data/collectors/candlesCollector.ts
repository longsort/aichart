import type { Candle } from '@/types';

const BASE = 'https://api.binance.com/api/v3';
const intervalMap: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M',
};

function rangeFor(tf: string) {
  const now = Date.now();
  if (tf === '1m') return { startTime: now - 1000 * 60 * 1000, limit: 1000 };
  if (tf === '3m') return { startTime: now - 1000 * 60 * 3000, limit: 1000 };
  if (tf === '5m') return { startTime: now - 1000 * 60 * 5000, limit: 1000 };
  if (tf === '15m') return { startTime: now - 1000 * 60 * 15000, limit: 1000 };
  if (tf === '1h') return { startTime: now - 1000 * 60 * 60 * 1000, limit: 1000 };
  if (tf === '4h') return { startTime: now - 1000 * 60 * 60 * 4000, limit: 1000 };
  if (tf === '1d') return { startTime: now - 1000 * 60 * 60 * 24 * 1000, limit: 1000 };
  return { startTime: now - 1000 * 60 * 60 * 24 * 1000, limit: 1000 };
}

/** 거래소(바이낸스 스팟)에서 캔들 수집 */
export async function collectCandles(
  symbol: string,
  timeframe: string,
  limit = 1000
): Promise<Candle[]> {
  const interval = intervalMap[timeframe] || '1m';
  const range = rangeFor(timeframe);
  const startTime = range.startTime;
  const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${Math.min(limit, range.limit)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`candles ${res.status}`);
  const raw = await res.json();
  return raw.map((c: number[]) => ({
    time: Math.floor(Number(c[0]) / 1000),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5]),
  })) as Candle[];
}
