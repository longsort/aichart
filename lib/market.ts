import { Candle } from '@/types';
import { MARKET_BARS_3Y, visibleLimit } from './constants';

/**
 * 바이낸스 USDT 현물 K라인 시작(2017-08-17) — `fetchFullHistory` 기준.
 * (2009년 이전 스팟 데이터는 이 앱·거래소 API에 없음)
 */
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
/** 동일 심볼·간격 반복 요청 완화 — 서버 analyze가 다중 TF 조회 시 캐시 히트율 상승 */
const CANDLE_CACHE_TTL_MS = 45_000;
const FETCH_TIMEOUT_MS = 12_000;
const candleCache = new Map<string, { expiresAt: number; data: Candle[] }>();
const candleInFlight = new Map<string, Promise<Candle[]>>();

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000, '1M': 30 * 86_400_000,
};

function rangeFor(tf: string) {
  const now = Date.now();
  const n = Math.max(visibleLimit(tf), historicalFetchLimit(tf));
  const stepMs = INTERVAL_MS[tf];
  if (stepMs) return { startTime: now - n * stepMs, limit: n };
  return { startTime: BINANCE_LISTING_START_MS, limit: LIMIT_PER_REQUEST };
}

function historicalFetchLimit(tf: string): number {
  const map: Record<string, number> = {
    // minute TF: bounded for dev-server heap stability — 항상 visibleLimit 이상
    '1m': 2800,
    '3m': 1800,
    '5m': 1400,
    /** 약 6개월 — 페이지네이션 수집(analyze 표시 구간은 visibleLimit) */
    '15m': MARKET_BARS_3Y['15m'],
    '1h': MARKET_BARS_3Y['1h'],
    '4h': MARKET_BARS_3Y['4h'],
    // day/week/month also use bounded history window in dev/runtime
    '1d': 900,
    /** fetchFullHistory 실패 시 폴백: 가능한 한 긴 구간 */
    '1w': 520,
    '1M': 200,
    '1Y': 120,
  };
  return map[tf] ?? visibleLimit(tf);
}

function parseKline(c: number[]): Candle {
  const vol = Number(c[5]);
  const tb =
    c.length > 9 && Number.isFinite(Number(c[9]))
      ? Math.max(0, Number(c[9]))
      : undefined;
  const out: Candle = {
    time: Math.floor(Number(c[0]) / 1000),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: vol,
  };
  if (tb != null && vol > 0 && tb <= vol * 1.001) out.takerBuyBaseVolume = tb;
  return out;
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

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchPagedRange(symbol: string, interval: string, startMs: number, requested: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = startMs;
  const target = Math.max(1, requested);
  const stepMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
  while (out.length < target) {
    const lim = Math.min(LIMIT_PER_REQUEST, target - out.length);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&limit=${lim}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) break;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) break;
    const batch = raw.map((c: any[]) => parseKline(c as number[]));
    out.push(...batch);
    const lastOpenMs = Number((raw[raw.length - 1] as any[])[0] ?? 0);
    if (!Number.isFinite(lastOpenMs) || lastOpenMs <= 0) break;
    cursor = lastOpenMs + stepMs;
    if (raw.length < lim) break;
  }
  return out.slice(-target);
}

/**
 * 유사 패턴·통계용 — 차트용보다 긴 구간(최대 15m 3년분 ≈ 10.5만 봉)을 페이지로 수집.
 */
export async function fetchMarketCandlesExtended(symbol: string, timeframe: string, barCount: number): Promise<Candle[]> {
  const interval = intervalMap[timeframe] || '4h';
  const stepMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
  const n = Math.max(200, Math.min(110_000, Math.floor(barCount)));
  const startMs = Date.now() - Math.ceil(n * stepMs * 1.2);
  return fetchPagedRange(symbol, interval, startMs, n);
}

function aggregateMonthlyToYearly(monthly: Candle[]): Candle[] {
  const byYear = new Map<number, Candle[]>();
  for (const m of monthly) {
    const y = new Date(m.time * 1000).getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(m);
  }
  return Array.from(byYear.values()).map((arr) => {
    const allTb = arr.every((x) => typeof x.takerBuyBaseVolume === 'number' && Number.isFinite(x.takerBuyBaseVolume!));
    return {
      time: arr[0].time,
      open: arr[0].open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: arr[arr.length - 1].close,
      volume: arr.reduce((sum, x) => sum + x.volume, 0),
      ...(allTb ? { takerBuyBaseVolume: arr.reduce((sum, x) => sum + (x.takerBuyBaseVolume ?? 0), 0) } : {}),
    };
  });
}

export async function fetchMarketCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const key = `${symbol}|${timeframe}`;
  const now = Date.now();
  const cached = candleCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }
  const inFlight = candleInFlight.get(key);
  if (inFlight) {
    const data = await inFlight;
    return data;
  }

  const run = (async (): Promise<Candle[]> => {
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

    /** 월·주봉: 상장일~현재 전 구간(페이지네이션). 기존 range 단일 요청은 최신 쪽 봉만 쥐고 앞이 잘렸음 */
    if (timeframe === '1M' || timeframe === '1w') {
      const inv = intervalMap[timeframe];
      if (inv) {
        try {
          const full = await fetchFullHistory(symbol, inv);
          if (full.length > 0) return full;
        } catch {
          /* fall through: 단일/페이지 fetch */
        }
      }
    }

    const interval = intervalMap[timeframe] || '4h';
    const range = rangeFor(timeframe);
    if (range.limit > LIMIT_PER_REQUEST) {
      const paged = await fetchPagedRange(symbol, interval, range.startTime, range.limit);
      if (paged.length > 0) return paged;
    } else {
      const lim = Math.min(range.limit, LIMIT_PER_REQUEST);
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${range.startTime}&limit=${lim}`;
      const res = await fetchWithTimeout(url);
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
    const bybit = await fetchBybitKlines(symbol, interval, range.startTime, Math.min(range.limit, LIMIT_PER_REQUEST));
    if (bybit && bybit.length > 0) return bybit;
    throw new Error('market: paged fetch empty');
  })();

  candleInFlight.set(key, run);
  try {
    const data = await run;
    candleCache.set(key, { expiresAt: Date.now() + CANDLE_CACHE_TTL_MS, data });
    if (candleCache.size > 500) {
      for (const [k, v] of candleCache.entries()) {
        if (v.expiresAt <= Date.now()) candleCache.delete(k);
      }
    }
    return data;
  } finally {
    candleInFlight.delete(key);
  }
}

