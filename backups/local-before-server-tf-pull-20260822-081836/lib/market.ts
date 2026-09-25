import { Candle } from '@/types';
import {
  MARKET_BARS_3Y,
  isListingFullHistoryTf,
  normalizeChartTimeframe,
  visibleLimit,
} from './constants';
import { fetchForexCandles, isForexSymbol, normalizeForexSymbol } from '@/lib/forexMarket';

/** chart=2017~전량 표시 · analyze=짧은 work 윈도(버벅임 방지) */
export type FetchMarketCandlesMode = 'chart' | 'analyze';

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
/** 1d/1w/1M 전량 — 재페이지네이션을 자주 하지 않음 (폴링 버벅임 방지) */
const FULL_HISTORY_CACHE_TTL_MS = 12 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;
const candleCache = new Map<string, { expiresAt: number; data: Candle[] }>();
const candleInFlight = new Map<string, Promise<Candle[]>>();
/** 종가선·마감판 보조 TF 전용 — 전 구간 fetch와 분리 캐시 */
const TAIL_CACHE_TTL_MS = 35_000;
const candleTailCache = new Map<string, { expiresAt: number; data: Candle[] }>();
const candleTailInFlight = new Map<string, Promise<Candle[]>>();

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

/** analyze 전용 — visibleLimit 근처만 (전량 페이지네이션 금지) */
function rangeForAnalyze(tf: string) {
  const now = Date.now();
  const n = Math.max(80, Math.ceil(visibleLimit(tf) * 1.15));
  const stepMs = INTERVAL_MS[tf];
  if (stepMs) return { startTime: now - n * stepMs, limit: n };
  return { startTime: now - n * 86_400_000, limit: n };
}

function historicalFetchLimit(tf: string): number {
  const map: Record<string, number> = {
    // minute TF: 엔진·차트 충분 길이 (과도한 페이지네이션 축소)
    '1m': 1400,
    '3m': 1200,
    '5m': 1100,
    /** MARKET_BARS_3Y — 차트/market 상한(15m·1h는 성능 위해 수개월→약 7~8주분 수준) */
    '15m': Math.min(MARKET_BARS_3Y['15m'], 1400),
    '1h': Math.min(MARKET_BARS_3Y['1h'], 1100),
    '4h': Math.min(MARKET_BARS_3Y['4h'], 1000),
    /** fetchFullHistory 실패 시 폴백: 상장(2017)~현재에 가깝게 */
    '1d': 3600,
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

/** Binance 실패 시 Bybit로 동일 기간 페이지네이션 (전체 대체용 — Binance 봉과 섞지 말 것) */
async function fetchFullHistoryViaBybit(symbol: string, interval: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let startMs = BINANCE_LISTING_START_MS;
  const nowMs = Date.now();

  while (startMs < nowMs) {
    const batch = await fetchBybitKlines(symbol, interval, startMs, LIMIT_PER_REQUEST);
    if (!batch || batch.length === 0) break;
    for (const c of batch) {
      const last = all[all.length - 1];
      if (last && last.time === c.time) all[all.length - 1] = c;
      else all.push(c);
    }
    /** 달력 월·주 — 고정 30일/7일 step 금지(봉 누락). 마지막 open+1ms */
    const lastOpenMs = batch[batch.length - 1].time * 1000;
    const next = lastOpenMs + 1;
    if (next <= startMs) break;
    startMs = next;
    if (batch.length < LIMIT_PER_REQUEST) break;
  }

  return all;
}

/** 1d/1w/1M: 상장일(2017)부터 오늘까지 전부 페이지네이션으로 수집 */
async function fetchFullHistory(symbol: string, interval: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let startMs = BINANCE_LISTING_START_MS;
  const nowMs = Date.now();

  while (startMs < nowMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&limit=${LIMIT_PER_REQUEST}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      /** 부분 Binance + Bybit 혼입 금지 — OHLC가 거래소(바이낸스)와 달라짐 */
      if (all.length > 0) return all;
      return fetchFullHistoryViaBybit(symbol, interval);
    }
    const raw = await res.json() as number[][];
    if (!Array.isArray(raw) || raw.length === 0) break;
    const batch = raw.map(parseKline);
    for (const c of batch) {
      const last = all[all.length - 1];
      if (last && last.time === c.time) all[all.length - 1] = c;
      else all.push(c);
    }
    const lastOpenMs = raw[raw.length - 1][0] as number;
    /** 월봉은 달력월이라 +30일이 다음 달을 건너뜀 → 항상 open+1ms */
    const next = lastOpenMs + 1;
    if (next <= startMs) break;
    startMs = next;
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
    for (const c of batch) {
      const last = out[out.length - 1];
      if (last && last.time === c.time) out[out.length - 1] = c;
      else out.push(c);
    }
    const lastOpenMs = Number((raw[raw.length - 1] as any[])[0] ?? 0);
    if (!Number.isFinite(lastOpenMs) || lastOpenMs <= 0) break;
    /** 1w/1M은 고정 step이 거래소 봉과 어긋남 — +1ms. 그 외는 step 유지 */
    cursor = interval === '1w' || interval === '1M' ? lastOpenMs + 1 : lastOpenMs + stepMs;
    if (raw.length < lim) break;
  }
  return out.slice(-target);
}

/** 최신 N봉 — 페이지네이션 끝이 밀렸을 때 tail 보강 (바이낸스만 — Bybit OHLC 혼입 금지) */
async function fetchLatestKlinesTail(symbol: string, binanceInterval: string, limit: number): Promise<Candle[]> {
  const lim = Math.min(LIMIT_PER_REQUEST, Math.max(10, limit));
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${lim}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return [];
    }
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((c: number[]) => parseKline(c));
  } catch {
    return [];
  }
}

function mergeCandlesByTime(primary: Candle[], extra: Candle[]): Candle[] {
  const m = new Map<number, Candle>();
  for (const c of primary) {
    const t = Number(c.time);
    if (Number.isFinite(t) && t > 0) m.set(t, c);
  }
  for (const c of extra) {
    const t = Number(c.time);
    if (!Number.isFinite(t) || t <= 0) continue;
    m.set(t, c);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/** 마지막 봉이 2.5봉 이상 밀리면 최신 tail 재조회 후 병합 */
async function ensureMarketCandlesThroughNow(
  symbol: string,
  timeframe: string,
  rows: Candle[],
  /** true면 전량 히스토리 길이를 유지(잘라내지 않음) */
  keepFullLength = false
): Promise<Candle[]> {
  if (!rows.length) return rows;
  const tf = normalizeChartTimeframe(timeframe);
  const inv = intervalMap[tf] || '4h';
  const stepMs = INTERVAL_MS[inv] ?? INTERVAL_MS['1h'];
  const lastMs = Number(rows[rows.length - 1]?.time) * 1000;
  if (!Number.isFinite(lastMs) || Date.now() - lastMs <= stepMs * 2.5) return rows;
  const tail = await fetchLatestKlinesTail(symbol, inv, 120);
  if (!tail.length) return rows;
  const merged = mergeCandlesByTime(rows, tail);
  if (keepFullLength || isListingFullHistoryTf(tf)) {
    return merged;
  }
  const cap = Math.max(rows.length, rangeFor(timeframe).limit);
  return merged.slice(-cap);
}

async function fetchBoundedRange(
  symbol: string,
  tf: string,
  range: { startTime: number; limit: number }
): Promise<Candle[]> {
  const interval = intervalMap[tf] || '4h';
  if (range.limit > LIMIT_PER_REQUEST) {
    const paged = await fetchPagedRange(symbol, interval, range.startTime, range.limit);
    if (paged.length > 0) return ensureMarketCandlesThroughNow(symbol, tf, paged);
  } else {
    const lim = Math.min(range.limit, LIMIT_PER_REQUEST);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${range.startTime}&limit=${lim}`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        return ensureMarketCandlesThroughNow(
          symbol,
          tf,
          raw.map((c: any[]) => parseKline(c as number[]))
        );
      }
    }
    const bybit = await fetchBybitKlines(symbol, interval, range.startTime, lim);
    if (bybit && bybit.length > 0) return ensureMarketCandlesThroughNow(symbol, tf, bybit);
    throw new Error(`market: binance ${res.status}, bybit empty`);
  }
  const bybit = await fetchBybitKlines(
    symbol,
    interval,
    range.startTime,
    Math.min(range.limit, LIMIT_PER_REQUEST)
  );
  if (bybit && bybit.length > 0) return ensureMarketCandlesThroughNow(symbol, tf, bybit);
  throw new Error('market: paged fetch empty');
}

/**
 * `/api/analyze` 보조 TF용 — 종가 레벨·마감판은 최근 확정 종가만 필요하므로 짧은 구간만 요청.
 * `fetchMarketCandles`의 1w/1M 전량 페이지네이션을 타지 않아 TF 전환 체감이 크게 줄어듦.
 */
export async function fetchMarketCandlesTail(symbol: string, timeframe: string, tailBars: number): Promise<Candle[]> {
  const tf = normalizeChartTimeframe(String(timeframe || ''));
  const cap = Math.max(6, Math.min(200, Math.floor(Number(tailBars) || 32)));
  const key = `${symbol}|${tf}|tail${cap}`;
  const now = Date.now();
  const hit = candleTailCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;

  const inf = candleTailInFlight.get(key);
  if (inf) return inf;

  const run = (async (): Promise<Candle[]> => {
    if (isForexSymbol(symbol)) {
      const full = await fetchForexCandles(normalizeForexSymbol(symbol), tf);
      return full.slice(-cap);
    }
    if (tf === '1Y') {
      const full = await fetchMarketCandles(symbol, '1Y');
      return full.slice(-cap);
    }
    const interval = intervalMap[tf] || '4h';
    const stepMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1h'];
    const startMs = Date.now() - Math.ceil(cap * stepMs * 1.22);
    let rows = await fetchPagedRange(symbol, interval, startMs, cap);
    if (!rows.length) {
      const lim = Math.min(cap, LIMIT_PER_REQUEST);
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${lim}`;
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          rows = raw.map((c: number[]) => parseKline(c));
        }
      }
      if (!rows.length) {
        const bybit = await fetchBybitKlines(symbol, interval, Date.now() - cap * stepMs, lim);
        if (bybit?.length) rows = bybit.slice(-cap);
      }
    }
    return rows.slice(-cap);
  })();

  candleTailInFlight.set(key, run);
  try {
    const data = await run;
    candleTailCache.set(key, { expiresAt: Date.now() + TAIL_CACHE_TTL_MS, data });
    if (candleTailCache.size > 400) {
      const t = Date.now();
      for (const [k, v] of candleTailCache.entries()) {
        if (v.expiresAt <= t) candleTailCache.delete(k);
      }
    }
    return data;
  } finally {
    candleTailInFlight.delete(key);
  }
}

/**
 * 유사 패턴·통계용 — 차트용보다 긴 구간(최대 15m 3년분 ≈ 10.5만 봉)을 페이지로 수집.
 */
export async function fetchMarketCandlesExtended(symbol: string, timeframe: string, barCount: number): Promise<Candle[]> {
  if (isForexSymbol(symbol)) {
    return fetchForexCandles(normalizeForexSymbol(symbol), timeframe);
  }
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

export async function fetchMarketCandles(
  symbol: string,
  timeframe: string,
  mode: FetchMarketCandlesMode = 'chart'
): Promise<Candle[]> {
  const tf = normalizeChartTimeframe(String(timeframe || '')) || String(timeframe || '4h');
  /** v2 — 1w/1M 페이지 step·Bybit 혼입 수정분 캐시 분리 */
  const key = `v2|${symbol}|${tf}|${mode}`;
  const now = Date.now();
  const ttl =
    mode === 'chart' && isListingFullHistoryTf(tf) ? FULL_HISTORY_CACHE_TTL_MS : CANDLE_CACHE_TTL_MS;
  const cached = candleCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  /**
   * 전량 차트: TTL 만료여도 캐시가 있으면 tail만 갱신해 반환 (재페이지네이션 금지).
   * 삭제 없음 — 히스토리 유지 + 최신 봉만 붙임.
   */
  if (
    mode === 'chart' &&
    isListingFullHistoryTf(tf) &&
    cached?.data?.length &&
    now - (cached.expiresAt - ttl) < FULL_HISTORY_CACHE_TTL_MS * 3
  ) {
    const refreshed = await ensureMarketCandlesThroughNow(symbol, tf, cached.data, true);
    candleCache.set(key, { expiresAt: now + ttl, data: refreshed });
    return refreshed;
  }

  const inFlight = candleInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const run = (async (): Promise<Candle[]> => {
    if (isForexSymbol(symbol)) {
      return fetchForexCandles(normalizeForexSymbol(symbol), tf);
    }
    if (tf === '1Y') {
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

    /** analyze: 짧은 구간만 — 1d/1w/1M 전량 페이지네이션을 타지 않음 */
    if (mode === 'analyze') {
      return fetchBoundedRange(symbol, tf, rangeForAnalyze(tf));
    }

    /** chart 일·주·월: 상장일(2017-08-17)~현재 전 구간 */
    if (isListingFullHistoryTf(tf)) {
      const inv = intervalMap[tf];
      if (inv) {
        try {
          const full = await fetchFullHistory(symbol, inv);
          if (full.length > 0) return ensureMarketCandlesThroughNow(symbol, tf, full, true);
        } catch {
          /* fall through */
        }
      }
    }

    return fetchBoundedRange(symbol, tf, rangeFor(tf));
  })();

  candleInFlight.set(key, run);
  try {
    const data = await run;
    candleCache.set(key, { expiresAt: Date.now() + ttl, data });
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

