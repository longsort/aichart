import { Candle } from '@/types';

/** 바이낸스 BTC 상장 시점(2017-08-17) ~ 현재까지 1d/1w 전수 수집용 */
const BINANCE_LISTING_START_MS = Date.UTC(2017, 7, 17);

const intervalMap: Record<string, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
  '1M': '1M'
};

const LIMIT_PER_REQUEST = 1000;

function rangeFor(tf: string) {
  const now = Date.now();
  if (tf === '1m') return { startTime: now - 1000 * 60 * 1000, limit: LIMIT_PER_REQUEST };
  if (tf === '3m') return { startTime: now - 1000 * 60 * 3000, limit: LIMIT_PER_REQUEST };
  if (tf === '5m') return { startTime: now - 1000 * 60 * 5000, limit: LIMIT_PER_REQUEST };
  if (tf === '15m') return { startTime: now - 1000 * 60 * 15000, limit: LIMIT_PER_REQUEST };
  if (tf === '1h') return { startTime: now - 1000 * 60 * 60 * 1000, limit: LIMIT_PER_REQUEST };
  if (tf === '4h') return { startTime: now - 1000 * 60 * 60 * 4000, limit: LIMIT_PER_REQUEST };
  if (tf === '1d') return { startTime: BINANCE_LISTING_START_MS, limit: LIMIT_PER_REQUEST, fullHistory: true };
  if (tf === '1w') return { startTime: BINANCE_LISTING_START_MS, limit: LIMIT_PER_REQUEST, fullHistory: true };
  return { startTime: BINANCE_LISTING_START_MS, limit: LIMIT_PER_REQUEST };
}

function parseKline(c: number[]): Candle {
  return {
    time: Math.floor(Number(c[0]) / 1000),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5])
  };
}

/** 1d/1w: 상장일부터 오늘까지 전부 페이지네이션으로 수집 */
async function fetchFullHistory(symbol: string, interval: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let startMs = BINANCE_LISTING_START_MS;
  const nowMs = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneWeekMs = 7 * oneDayMs;
  const stepMs = interval === '1w' ? oneWeekMs : oneDayMs;

  while (startMs < nowMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&limit=${LIMIT_PER_REQUEST}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const raw = await res.json() as number[][];
    if (raw.length === 0) break;
    const batch = raw.map(parseKline);
    for (const c of batch) all.push(c);
    const lastOpenMs = raw[raw.length - 1][0] as number;
    startMs = lastOpenMs + stepMs;
    if (raw.length < LIMIT_PER_REQUEST) break;
  }

  return all;
}

export async function fetchMarketCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  if (timeframe === '1Y') {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1M&startTime=${BINANCE_LISTING_START_MS}&limit=1000`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const raw = await res.json();
    const monthly = raw.map((c: any[]) => parseKline(c as number[]));

    const byYear = new Map<number, Candle[]>();
    for (const m of monthly) {
      const y = new Date(m.time * 1000).getUTCFullYear();
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(m);
    }

    return Array.from(byYear.values()).map(arr => ({
      time: arr[0].time,
      open: arr[0].open,
      high: Math.max(...arr.map(x => x.high)),
      low: Math.min(...arr.map(x => x.low)),
      close: arr[arr.length - 1].close,
      volume: arr.reduce((sum, x) => sum + x.volume, 0)
    }));
  }

  const interval = intervalMap[timeframe] || '4h';
  const range = rangeFor(timeframe);
  const fullHistory = 'fullHistory' in range && range.fullHistory;

  if (fullHistory && (timeframe === '1d' || timeframe === '1w')) {
    return fetchFullHistory(symbol, interval);
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${range.startTime}&limit=${range.limit}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const raw = await res.json();
  return raw.map((c: any[]) => parseKline(c as number[]));
}

/** 특정 시간 구간의 캔들 조회 (path API 등에서 사용) */
export async function fetchMarketCandlesInRange(
  symbol: string,
  interval: string,
  startTimeSec: number,
  endTimeSec: number
): Promise<Candle[]> {
  const startMs = startTimeSec * 1000;
  const endMs = endTimeSec * 1000;
  const int = intervalMap[interval] || '1h';
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${int}&startTime=${startMs}&endTime=${endMs}&limit=500`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const raw = await res.json() as number[][];
  return raw.map((c) => parseKline(c));
}
