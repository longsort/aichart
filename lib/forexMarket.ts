/**
 * 환율(FX) 캔들 — Yahoo Finance chart (USDKRW=X, CNYKRW=X 등).
 * 코인 검색과 동일하게 심볼만 고르면 통합분석 차트·분석에 연결.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe, visibleLimit } from '@/lib/constants';

export const FOREX_SYMBOLS = ['USDKRW', 'CNYKRW'] as const;
export type ForexSymbol = (typeof FOREX_SYMBOLS)[number];

const YAHOO_TICKER: Record<string, string> = {
  USDKRW: 'USDKRW=X',
  /** Yahoo CNYKRW=X 일봉이 거의 비어 있어 USDKRW/USDCNY 합성용 폴백 사용 */
  CNYKRW: 'CNYKRW=X',
  KRWUSD: 'KRW=X',
};

const USDKRW_FALLBACK = 'KRW=X';
const USDCNY_TICKER = 'USDCNY=X';

/** 검색용 메타 */
export const FOREX_SEARCH_ROWS: Array<{ symbol: string; base: string; label: string }> = [
  { symbol: 'USDKRW', base: 'USD/KRW', label: 'USD/KRW' },
  { symbol: 'CNYKRW', base: 'CNY/KRW', label: 'CNY/KRW' },
];

export function isForexSymbol(symbol: string | null | undefined): boolean {
  const s = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!s) return false;
  if (FOREX_SYMBOLS.includes(s as ForexSymbol)) return true;
  if (s in YAHOO_TICKER) return true;
  if (s.endsWith('KRW') && (s.startsWith('USD') || s.startsWith('CNY'))) return true;
  return false;
}

export function normalizeForexSymbol(symbol: string): string {
  const s = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (s === 'KRWUSD') return 'USDKRW';
  return s;
}

function yahooTicker(symbol: string): string | null {
  const s = normalizeForexSymbol(symbol);
  return YAHOO_TICKER[s] ?? null;
}

/** Yahoo interval + range */
function yahooQuery(tf: string): { interval: string; range: string; aggregateHours?: number } {
  const t = normalizeChartTimeframe(tf);
  switch (t) {
    case '1m':
      return { interval: '1m', range: '7d' };
    case '3m':
      return { interval: '5m', range: '60d' };
    case '5m':
      return { interval: '5m', range: '60d' };
    case '15m':
      return { interval: '15m', range: '60d' };
    case '1h':
      return { interval: '60m', range: '2y' };
    case '4h':
      return { interval: '60m', range: '2y', aggregateHours: 4 };
    case '1d':
      return { interval: '1d', range: '10y' };
    case '1w':
      return { interval: '1wk', range: '10y' };
    case '1M':
      return { interval: '1mo', range: 'max' };
    case '1Y':
      return { interval: '1mo', range: 'max' };
    default:
      return { interval: '60m', range: '2y', aggregateHours: 4 };
  }
}

function aggregateHours(candles: Candle[], hours: number): Candle[] {
  if (hours <= 1 || candles.length < 2) return candles;
  const bucketSec = hours * 3600;
  const map = new Map<number, Candle[]>();
  for (const c of candles) {
    const t = Number(c.time);
    if (!Number.isFinite(t)) continue;
    const key = Math.floor(t / bucketSec) * bucketSec;
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, arr]) => ({
      time: t,
      open: arr[0]!.open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: arr[arr.length - 1]!.close,
      volume: arr.reduce((s, x) => s + (x.volume || 0), 0),
    }));
}

type YahooChartResult = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
};

async function fetchYahooChart(ticker: string, interval: string, range: string): Promise<Candle[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ailongshort/1.0)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`forex yahoo ${res.status}`);
  }
  const j = (await res.json()) as YahooChartResult;
  if (j.chart?.error?.description) {
    throw new Error(`forex yahoo: ${j.chart.error.description}`);
  }
  const result = j.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  if (!ts.length || !q) return [];

  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = Number(q.open?.[i]);
    const high = Number(q.high?.[i]);
    const low = Number(q.low?.[i]);
    const close = Number(q.close?.[i]);
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue;
    out.push({
      time: Number(ts[i]),
      open,
      high,
      low,
      close,
      volume: Number(q.volume?.[i] ?? 0) || 0,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** OHLC 비율: a / b (교차환율 합성) */
function divideCandles(a: Candle[], b: Candle[]): Candle[] {
  const bMap = new Map(b.map((c) => [c.time, c]));
  const out: Candle[] = [];
  for (const ca of a) {
    const cb = bMap.get(ca.time);
    if (!cb) continue;
    const o = ca.open / cb.open;
    const h = ca.high / cb.high;
    const l = ca.low / cb.low;
    const c = ca.close / cb.close;
    if (![o, h, l, c].every((v) => Number.isFinite(v) && v > 0)) continue;
    const hi = Math.max(o, h, l, c);
    const lo = Math.min(o, h, l, c);
    out.push({
      time: ca.time,
      open: o,
      high: hi,
      low: lo,
      close: c,
      volume: 0,
    });
  }
  return out;
}

async function fetchYahooSeries(ticker: string, timeframe: string): Promise<Candle[]> {
  const q = yahooQuery(timeframe);
  let rows = await fetchYahooChart(ticker, q.interval, q.range);
  if (q.aggregateHours && q.aggregateHours > 1) {
    rows = aggregateHours(rows, q.aggregateHours);
  }
  if (normalizeChartTimeframe(timeframe) === '1Y' && rows.length) {
    const byYear = new Map<number, Candle[]>();
    for (const c of rows) {
      const y = new Date(c.time * 1000).getUTCFullYear();
      const arr = byYear.get(y) ?? [];
      arr.push(c);
      byYear.set(y, arr);
    }
    rows = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, arr]) => ({
        time: arr[0]!.time,
        open: arr[0]!.open,
        high: Math.max(...arr.map((x) => x.high)),
        low: Math.min(...arr.map((x) => x.low)),
        close: arr[arr.length - 1]!.close,
        volume: arr.reduce((s, x) => s + (x.volume || 0), 0),
      }));
  }
  return rows;
}

async function fetchUsdKrwCandles(timeframe: string): Promise<Candle[]> {
  let rows = await fetchYahooSeries(YAHOO_TICKER.USDKRW, timeframe);
  if (rows.length < 8) {
    rows = await fetchYahooSeries(USDKRW_FALLBACK, timeframe);
  }
  return rows;
}

/** CNY/KRW ≈ (USD/KRW) / (USD/CNY) — Yahoo 직티커가 비어 있을 때 */
async function fetchCnyKrwCandles(timeframe: string): Promise<Candle[]> {
  const direct = await fetchYahooSeries(YAHOO_TICKER.CNYKRW, timeframe);
  if (direct.length >= 40) return direct;
  const [usdKrw, usdCny] = await Promise.all([
    fetchUsdKrwCandles(timeframe),
    fetchYahooSeries(USDCNY_TICKER, timeframe),
  ]);
  const syn = divideCandles(usdKrw, usdCny);
  if (syn.length) return syn;
  if (direct.length) return direct;
  throw new Error('forex: CNYKRW empty (direct + synth)');
}

/**
 * FX 캔들 로드. 실패 시 빈 배열이 아니라 throw (market 라우터가 에러 전달).
 */
export async function fetchForexCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const s = normalizeForexSymbol(symbol);
  if (!yahooTicker(s) && !FOREX_SYMBOLS.includes(s as ForexSymbol)) {
    throw new Error(`forex: unsupported symbol ${symbol}`);
  }
  let rows: Candle[];
  if (s === 'CNYKRW') {
    rows = await fetchCnyKrwCandles(timeframe);
  } else if (s === 'USDKRW') {
    rows = await fetchUsdKrwCandles(timeframe);
  } else {
    const ticker = yahooTicker(s);
    if (!ticker) throw new Error(`forex: unsupported symbol ${symbol}`);
    rows = await fetchYahooSeries(ticker, timeframe);
  }
  const lim = Math.max(visibleLimit(timeframe), 80);
  if (!rows.length) throw new Error(`forex: empty candles for ${symbol}`);
  return rows.slice(-lim);
}

/** 심볼 검색 히트 */
export function matchForexSearch(qRaw: string, limit = 10): Array<{ symbol: string; base: string }> {
  const raw = String(qRaw || '').trim();
  const rawLower = raw.toLowerCase();
  if (
    rawLower.includes('환율') ||
    rawLower.includes('달러') ||
    rawLower.includes('위안') ||
    rawLower.includes('forex') ||
    rawLower === 'fx'
  ) {
    return FOREX_SEARCH_ROWS.slice(0, limit).map((r) => ({ symbol: r.symbol, base: r.base }));
  }
  const q = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!q) return [];
  const out: Array<{ symbol: string; base: string }> = [];
  for (const row of FOREX_SEARCH_ROWS) {
    const label = row.label.replace('/', '');
    const baseTok = row.base.replace('/', '');
    if (
      row.symbol.includes(q) ||
      baseTok.includes(q) ||
      label.includes(q) ||
      (q.includes('USD') && row.symbol.includes('USD')) ||
      (q.includes('CNY') && row.symbol.includes('CNY')) ||
      (q.includes('KRW') && row.symbol.includes('KRW'))
    ) {
      out.push({ symbol: row.symbol, base: row.base });
      if (out.length >= limit) break;
    }
  }
  return out;
}
