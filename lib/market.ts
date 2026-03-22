import { Candle } from '@/types';
import { visibleLimit } from './constants';

/** 바이낸스 BTC 상장 시점(2017-08-17) ~ 현재까지 1d/1w 전수 수집용 */
const BINANCE_LISTING_START_MS = Date.UTC(2017, 7, 17);

/** 바이낸스 interval → Bybit v5 kline interval (미국 등 차단 지역에서 공개 API 폴백) */
const BINANCE_TO_BYBIT_INTERVAL: Record<string, string> = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
  '1M': 'M',
};

function parseBybitKlineRow(row: string[]): Candle {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5] ?? 0),
  };
}

/**
 * Bybit 공개 kline (spot → 실패 시 linear). 미국 VPS 등에서 Binance 차단 시 사용.
 */
async function fetchBybitKlines(
  symbol: string,
  binanceInterval: string,
  startTimeMs: number,
  limit: number
): Promise<Candle[] | null> {
  const iv = BINANCE_TO_BYBIT_INTERVAL[binanceInterval];
  if (!iv) return null;
  const lim = Math.min(Math.max(1, limit), 1000);
  const base = `https://api.bybit.com/v5/market/kline?symbol=${encodeURIComponent(symbol)}&interval=${iv}&start=${Math.floor(startTimeMs)}&limit=${lim}`;
  for (const category of ['spot', 'linear'] as const) {
    try {
      const url = `${base}&category=${category}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = (await res.json()) as { retCode?: number; result?: { list?: string[][] } };
      if (j.retCode !== 0 || !j.result?.list?.length) continue;
      const candles = j.result.list.map(parseBybitKlineRow).sort((a, b) => a.time - b.time);
      return candles;
    } catch {
      continue;
    }
  }
  return null;
}

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

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000, '1M': 30 * 86_400_000,
};

function rangeFor(tf: string) {
  const now = Date.now();
  const n = visibleLimit(tf);
  // 1d/1w/1M: 2017 상장일 ~ 현재 전수 수집 (동일 기간)
  if (tf === '1d' || tf === '1w' || tf === '1M') {
    return { startTime: BINANCE_LISTING_START_MS, limit: LIMIT_PER_REQUEST, fullHistory: true };
  }
  const stepMs = INTERVAL_MS[tf];
  if (stepMs) return { startTime: now - n * stepMs, limit: Math.min(n, LIMIT_PER_REQUEST) };
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

/** Binance 실패 시 Bybit로 동일 기간 페이지네이션 */
async function fetchFullHistoryViaBybit(symbol: string, interval: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let startMs = BINANCE_LISTING_START_MS;
  const nowMs = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneWeekMs = 7 * oneDayMs;
  const oneMonthMs = 30 * oneDayMs;
  const stepMs = interval === '1M' ? oneMonthMs : interval === '1w' ? oneWeekMs : oneDayMs;

  while (startMs < nowMs) {
    const batch = await fetchBybitKlines(symbol, interval, startMs, LIMIT_PER_REQUEST);
    if (!batch || batch.length === 0) break;
    for (const c of batch) all.push(c);
    const lastOpenMs = batch[batch.length - 1].time * 1000;
    startMs = lastOpenMs + stepMs;
    if (batch.length < LIMIT_PER_REQUEST) break;
  }

  return all;
}

/** 1d/1w/1M: 상장일(2017)부터 오늘까지 전부 페이지네이션으로 수집 */
async function fetchFullHistory(symbol: string, interval: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let startMs = BINANCE_LISTING_START_MS;
  const nowMs = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneWeekMs = 7 * oneDayMs;
  const oneMonthMs = 30 * oneDayMs;
  const stepMs = interval === '1M' ? oneMonthMs : interval === '1w' ? oneWeekMs : oneDayMs;

  while (startMs < nowMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&limit=${LIMIT_PER_REQUEST}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return fetchFullHistoryViaBybit(symbol, interval);
    }
    const raw = await res.json() as number[][];
    if (!Array.isArray(raw) || raw.length === 0) break;
    const batch = raw.map(parseKline);
    for (const c of batch) all.push(c);
    const lastOpenMs = raw[raw.length - 1][0] as number;
    startMs = lastOpenMs + stepMs;
    if (raw.length < LIMIT_PER_REQUEST) break;
  }

  return all;
}

function aggregateMonthlyToYearly(monthly: Candle[]): Candle[] {
  const byYear = new Map<number, Candle[]>();
  for (const m of monthly) {
    const y = new Date(m.time * 1000).getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(m);
  }
  return Array.from(byYear.values()).map((arr) => ({
    time: arr[0].time,
    open: arr[0].open,
    high: Math.max(...arr.map((x) => x.high)),
    low: Math.min(...arr.map((x) => x.low)),
    close: arr[arr.length - 1].close,
    volume: arr.reduce((sum, x) => sum + x.volume, 0),
  }));
}

export async function fetchMarketCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  if (timeframe === '1Y') {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1M&startTime=${BINANCE_LISTING_START_MS}&limit=1000`;
    const res = await fetch(url, { cache: 'no-store' });
    let monthly: Candle[];
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        monthly = raw.map((c: any[]) => parseKline(c as number[]));
      } else {
        monthly = await fetchFullHistoryViaBybit(symbol, '1M');
      }
    } else {
      monthly = await fetchFullHistoryViaBybit(symbol, '1M');
    }
    if (!monthly.length) {
      throw new Error(`market 1Y: binance ${res.status}, bybit empty`);
    }
    return aggregateMonthlyToYearly(monthly);
  }

  const interval = intervalMap[timeframe] || '4h';
  const range = rangeFor(timeframe);
  const fullHistory = 'fullHistory' in range && range.fullHistory;

  if (fullHistory && (timeframe === '1d' || timeframe === '1w' || timeframe === '1M')) {
    return fetchFullHistory(symbol, interval);
  }

  const lim = Math.min(range.limit, LIMIT_PER_REQUEST);
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${range.startTime}&limit=${lim}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.ok) {
    const raw = await res.json();
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((c: any[]) => parseKline(c as number[]));
    }
  }
  const bybit = await fetchBybitKlines(symbol, interval, range.startTime, lim);
  if (bybit && bybit.length > 0) return bybit;
  throw new Error(`market: binance ${res.status}, bybit empty`);
}

