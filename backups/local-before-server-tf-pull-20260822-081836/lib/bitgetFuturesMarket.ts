import { BITGET_BASE } from '@/lib/exchangeConfig';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import type { Candle } from '@/types';

const PRODUCT_TYPE = 'usdt-futures';
const MAX_LIMIT = 360;
/** 페이지 간격 — TF 전환 체감용 (API 한도 내) */
const REQ_GAP_MS = 40;

/** 전량 히스토리 동시 1개만 — recent/analyze가 60s 대기로 막히지 않게 */
let fullHistoryTail: Promise<unknown> = Promise.resolve();

function enqueueFullHistory<T>(fn: () => Promise<T>): Promise<T> {
  const run = fullHistoryTail.then(fn, fn);
  fullHistoryTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Bitget BTCUSDT USDT-M 무기한 상장(2019-09) — 이 시점부터 페이지네이션 */
export const BITGET_BTCUSDT_PERP_LISTING_MS = Date.parse('2019-09-01T00:00:00.000Z');

export { isBitgetPerpChartSymbol };

export function chartTfToBitgetGranularity(tf: string): string {
  const n = normalizeChartTimeframe(tf);
  const map: Record<string, string> = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H',
    '4h': '4H',
    '12h': '12H',
    '12H': '12H',
    '1d': '1D',
    '1w': '1W',
    '1M': '1M',
  };
  return map[n] ?? '15m';
}

function parseBitgetCandleRow(row: unknown[]): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const tsMs = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);
  if (![tsMs, open, high, low, close, volume].every(Number.isFinite)) return null;
  return {
    time: Math.floor(tsMs / 1000),
    open,
    high,
    low,
    close,
    volume,
  };
}

async function fetchBitgetMixChunk(params: {
  symbol: string;
  granularity: string;
  startTime: number;
  endTime: number;
  limit: number;
}): Promise<unknown[][]> {
  const u = new URL(`${BITGET_BASE}/api/v2/mix/market/candles`);
  u.searchParams.set('symbol', params.symbol);
  u.searchParams.set('productType', PRODUCT_TYPE);
  u.searchParams.set('granularity', params.granularity);
  u.searchParams.set('limit', String(Math.min(MAX_LIMIT, Math.max(1, params.limit))));
  u.searchParams.set('startTime', String(params.startTime));
  u.searchParams.set('endTime', String(params.endTime));
  const res = await fetch(u.toString(), { cache: 'no-store' });
  const text = await res.text();
  let j: { code?: string; msg?: string; data?: unknown };
  try {
    j = JSON.parse(text) as { code?: string; msg?: string; data?: unknown };
  } catch {
    throw new Error(`Bitget non-JSON: ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`Bitget HTTP ${res.status}: ${j?.msg || text.slice(0, 120)}`);
  if (j.code !== '00000' && j.code !== '0') {
    throw new Error(`Bitget ${j.code}: ${j.msg || 'error'}`);
  }
  return Array.isArray(j.data) ? (j.data as unknown[][]) : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 상장일~현재 — 90일 창을 과거로 이동하며 전량 수집 (download-bitget-futures-candles.mjs와 동일) */
export async function fetchBitgetFuturesCandlesFullHistory(
  symbol: string,
  timeframe: string,
  maxBars?: number
): Promise<Candle[]> {
  return enqueueFullHistory(() => fetchBitgetFuturesCandlesFullHistoryInner(symbol, timeframe, maxBars));
}

async function fetchBitgetFuturesCandlesFullHistoryInner(
  symbol: string,
  timeframe: string,
  maxBars?: number
): Promise<Candle[]> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const granularity = chartTfToBitgetGranularity(timeframe);
  const cap = Math.max(80, Math.min(4000, Math.floor(maxBars ?? chartBarCapForBitget(timeframe))));
  const startMs = BITGET_BTCUSDT_PERP_LISTING_MS;
  const endMs = Date.now();
  const windowMs = 90 * 86_400_000;

  const seen = new Set<number>();
  const out: Candle[] = [];
  let endBoundary = endMs;
  let emptyWinStreak = 0;

  while (endBoundary > startMs && out.length < cap && emptyWinStreak < 8) {
    const totalAtWindowStart = out.length;
    const beginBoundary = Math.max(startMs, endBoundary - windowMs);
    let pageEnd = endBoundary;

    while (pageEnd > beginBoundary && out.length < cap) {
      const rows = await fetchBitgetMixChunk({
        symbol: sym,
        granularity,
        startTime: beginBoundary,
        endTime: pageEnd,
        limit: Math.min(MAX_LIMIT, cap - out.length),
      });
      await sleep(REQ_GAP_MS);

      if (!rows.length) break;

      let oldestInPage = Infinity;
      let addedThisPage = 0;
      for (const row of rows) {
        const c = parseBitgetCandleRow(row);
        if (!c) continue;
        const tsMs = c.time * 1000;
        if (tsMs < beginBoundary || tsMs > endBoundary) continue;
        if (seen.has(c.time)) continue;
        seen.add(c.time);
        out.push(c);
        addedThisPage++;
        if (tsMs < oldestInPage) oldestInPage = tsMs;
        if (out.length >= cap) break;
      }

      if (!Number.isFinite(oldestInPage) || addedThisPage === 0) break;
      if (oldestInPage <= beginBoundary) break;
      const nextPageEnd = oldestInPage - 1;
      if (nextPageEnd < beginBoundary || nextPageEnd >= pageEnd) break;
      pageEnd = nextPageEnd;
    }

    if (out.length === totalAtWindowStart) {
      emptyWinStreak++;
    } else {
      emptyWinStreak = 0;
    }
    endBoundary = beginBoundary - 1;
  }

  out.sort((a, b) => a.time - b.time);
  return out.slice(-cap);
}

/** 최근 N봉 — Bitget mix candles (volume_base = TV volume) */
export async function fetchBitgetFuturesCandlesRecent(
  symbol: string,
  timeframe: string,
  maxBars: number
): Promise<Candle[]> {
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1d' || tf === '1w' || tf === '1M') {
    return fetchBitgetFuturesCandlesFullHistory(symbol, timeframe, maxBars);
  }

  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const granularity = chartTfToBitgetGranularity(timeframe);
  const cap = Math.max(80, Math.min(4000, Math.floor(maxBars)));
  const endMs = Date.now();
  const dayMs = 86_400_000;
  const windowMs = 90 * dayMs;
  const startMs = BITGET_BTCUSDT_PERP_LISTING_MS;

  const seen = new Set<number>();
  const out: Candle[] = [];
  let pageEnd = endMs;
  let emptyStreak = 0;

  while (out.length < cap && pageEnd > startMs && emptyStreak < 6) {
    const beginBoundary = Math.max(startMs, pageEnd - windowMs);
    let added = 0;
    let oldest = Infinity;

    const rows = await fetchBitgetMixChunk({
      symbol: sym,
      granularity,
      startTime: beginBoundary,
      endTime: pageEnd,
      limit: Math.min(MAX_LIMIT, cap - out.length),
    });
    await sleep(REQ_GAP_MS);

    for (const row of rows) {
      const c = parseBitgetCandleRow(row);
      if (!c) continue;
      if (seen.has(c.time)) continue;
      seen.add(c.time);
      out.push(c);
      added++;
      if (c.time * 1000 < oldest) oldest = c.time * 1000;
      if (out.length >= cap) break;
    }

    if (added === 0) {
      emptyStreak++;
      pageEnd = beginBoundary - 1;
      continue;
    }
    emptyStreak = 0;
    if (!Number.isFinite(oldest) || oldest <= beginBoundary) {
      pageEnd = beginBoundary - 1;
      continue;
    }
    pageEnd = oldest - 1;
  }

  out.sort((a, b) => a.time - b.time);
  return out.slice(-cap);
}

function mergeCandlesByTime(base: Candle[], tail: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of base) map.set(c.time, c);
  for (const c of tail) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function chartBarCapForBitget(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  /** 엔진 work(~480) 이상 · 과도한 페이지네이션 축소 (기능 삭제 아님) */
  if (tf === '1m') return 1400;
  if (tf === '3m' || tf === '5m') return 1200;
  if (tf === '15m') return 1400;
  if (tf === '1h') return 1100;
  if (tf === '4h') return 1000;
  /** Bitget 상장(2019~) 전량 — 현물 2017 구간은 Bitget API에 없음 */
  if (tf === '1d') return 3600;
  if (tf === '1w') return 520;
  if (tf === '1M') return 200;
  return 1200;
}

/**
 * 통합·분석 / 마감·안착 차트용 — CSV(있으면) + Bitget API.
 * 1d/1w/1M: 상장일부터 페이지네이션 전량.
 * recentOnly: 짧은 구간만 (클라이언트 즉시 표시용 — 기능 삭제 아님).
 */
export async function loadBitgetFuturesChartCandles(
  symbol: string,
  timeframe: string,
  opts?: { recentOnly?: boolean }
): Promise<{ candles: Candle[]; source: 'bitget-merged' | 'bitget-api' | 'bitget-csv' }> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const tf = normalizeChartTimeframe(timeframe);
  const cap = chartBarCapForBitget(timeframe);
  const useFullHistory = tf === '1d' || tf === '1w' || tf === '1M';

  if (opts?.recentOnly) {
    /** 엔진 cap(≤480) + 여유 — 전량 대기 없이 즉시 작도 가능 */
    const recentCap =
      tf === '1d' ? 720 : tf === '1w' ? 400 : tf === '1M' ? 160 : Math.min(cap, 960);
    const live = await fetchBitgetFuturesCandlesRecent(sym, timeframe, recentCap);
    if (live.length >= 8) {
      return { candles: live.slice(-recentCap), source: 'bitget-api' };
    }
  }

  if (useFullHistory && !opts?.recentOnly) {
    const full = await fetchBitgetFuturesCandlesFullHistory(sym, timeframe, cap);
    if (full.length >= 20) {
      return { candles: full, source: 'bitget-api' };
    }
  }

  /**
   * 1w/1M: CSV+API 머지 금지 — 시가 버킷(16:00 UTC)은 같아도 종가가 어긋나면
   * 거래소 차트와 다른 봉이 됨. API 우선, 없을 때만 CSV.
   */
  const live = await fetchBitgetFuturesCandlesRecent(sym, timeframe, cap);
  if (useFullHistory) {
    if (live.length >= 8) {
      return { candles: live.slice(-cap), source: 'bitget-api' };
    }
    let csv: Candle[] = [];
    try {
      csv = await readBitgetFuturesCsv(sym, timeframe);
    } catch {
      csv = [];
    }
    if (csv.length >= 40) {
      return { candles: csv.slice(-cap), source: 'bitget-csv' };
    }
  } else {
    let csv: Candle[] = [];
    try {
      csv = await readBitgetFuturesCsv(sym, timeframe);
    } catch {
      csv = [];
    }
    if (csv.length >= 40 && live.length >= 1) {
      return { candles: mergeCandlesByTime(csv, live).slice(-cap), source: 'bitget-merged' };
    }
    if (live.length >= 40) {
      return { candles: live.slice(-cap), source: 'bitget-api' };
    }
    if (csv.length >= 40) {
      return { candles: csv.slice(-cap), source: 'bitget-csv' };
    }
  }
  if (live.length > 0) {
    return { candles: live, source: 'bitget-api' };
  }
  throw new Error('Bitget BTCUSDT.P 캔들 없음');
}
