import { BITGET_BASE } from '@/lib/exchangeConfig';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import type { Candle } from '@/types';

const PRODUCT_TYPE = 'usdt-futures';
const MAX_LIMIT = 360;
/** 페이지 간격 — TF 전환 체감용 (API 한도 내) */
const REQ_GAP_MS = 40;

/** 전량 히스토리 동시 1개만 — recent/tip이 429·대기로 막히지 않게 (예전 정상 경로) */
let fullHistoryTail: Promise<unknown> = Promise.resolve();

function enqueueFullHistory<T>(fn: () => Promise<T>): Promise<T> {
  const run = fullHistoryTail.then(fn, fn);
  fullHistoryTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Bitget USDT-M 상장 근사 — BTC는 2019-09, 그 외는 최근 5년(빈 페이지 낭비 완화) */
export const BITGET_BTCUSDT_PERP_LISTING_MS = Date.parse('2019-09-01T00:00:00.000Z');
const BITGET_ALT_PERP_LOOKBACK_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;

export function bitgetPerpListingStartMs(symbol: string): number {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  if (sym.startsWith('BTC')) return BITGET_BTCUSDT_PERP_LISTING_MS;
  const altStart = Date.now() - BITGET_ALT_PERP_LOOKBACK_MS;
  return Math.max(BITGET_BTCUSDT_PERP_LISTING_MS, altStart);
}

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
  const quoteVolume = row.length >= 7 && Number.isFinite(Number(row[6])) ? Number(row[6]) : undefined;
  return {
    time: Math.floor(tsMs / 1000),
    open,
    high,
    low,
    close,
    volume,
    ...(quoteVolume != null ? { quoteVolume } : {}),
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
  const res = await fetch(u.toString(), {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
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

async function fetchBitgetMixHistoryChunk(params: {
  symbol: string;
  granularity: string;
  startTime: number;
  endTime: number;
  limit: number;
}): Promise<unknown[][]> {
  const u = new URL(`${BITGET_BASE}/api/v2/mix/market/history-candles`);
  u.searchParams.set('symbol', params.symbol);
  u.searchParams.set('productType', PRODUCT_TYPE);
  u.searchParams.set('granularity', params.granularity);
  /** history-candles: limit 360은 HTTP 400. 200까지 확인됨. */
  u.searchParams.set('limit', String(Math.min(200, Math.max(1, params.limit))));
  u.searchParams.set('endTime', String(params.endTime));
  void params.startTime;
  const res = await fetch(u.toString(), { cache: 'no-store' });
  const text = await res.text();
  let j: { code?: string; msg?: string; data?: unknown };
  try {
    j = JSON.parse(text) as { code?: string; msg?: string; data?: unknown };
  } catch {
    throw new Error(`Bitget history non-JSON: ${text.slice(0, 120)}`);
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
  return enqueueFullHistory(() =>
    fetchBitgetFuturesCandlesFullHistoryInner(symbol, timeframe, maxBars)
  );
}

async function fetchBitgetFuturesCandlesFullHistoryInner(
  symbol: string,
  timeframe: string,
  maxBars?: number
): Promise<Candle[]> {
  const requested = Math.floor(maxBars ?? chartBarCapForBitget(timeframe));
  /** 차트 기본 ≤4000 · 리플레이 등 명시 maxBars>4000 이면 최대 22만봉 */
  const hardMax = requested > 4000 ? 220_000 : 4000;
  const cap = Math.max(80, Math.min(hardMax, requested));
  if (isBitgetHtfListingTf(timeframe)) {
    return fetchBitgetHtfByBars(symbol, timeframe, cap);
  }
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const granularity = chartTfToBitgetGranularity(timeframe);
  const startMs = bitgetPerpListingStartMs(sym);
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
      let rows: unknown[][] = [];
      try {
        rows = await fetchBitgetMixChunk({
          symbol: sym,
          granularity,
          startTime: beginBoundary,
          endTime: pageEnd,
          limit: Math.min(MAX_LIMIT, cap - out.length),
        });
      } catch {
        /** 429 등 — 창 스킵 후 부분 결과 유지 (빈 차트 방지) */
        break;
      }
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

function htfBarStepMs(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  if (t === '1w') return 7 * 86_400_000;
  if (t === '1M') return 31 * 86_400_000;
  if (t === '1d') return 86_400_000;
  if (t === '4h') return 4 * 3_600_000;
  if (t === '1h') return 3_600_000;
  if (t === '15m') return 900_000;
  if (t === '5m') return 300_000;
  if (t === '3m') return 180_000;
  if (t === '1m') return 60_000;
  return 3_600_000;
}

function isBitgetHtfListingTf(tf: string): boolean {
  const n = normalizeChartTimeframe(tf);
  return n === '1d' || n === '1w' || n === '1M';
}

/**
 * 1d/1w/1M — 90일 창을 돌리지 않는다.
 * Bitget mix candles는 구간 안 최근 limit봉을 주므로, 가장 오래된 봉 바로 앞만 이어서 받는다.
 * 월봉 200개 = 보통 1회, 주봉 520 = 2회, 일봉 3600 ≈ 10회.
 */
async function fetchBitgetHtfByBars(
  symbol: string,
  timeframe: string,
  maxBars: number
): Promise<Candle[]> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const granularity = chartTfToBitgetGranularity(timeframe);
  const cap = Math.max(80, Math.min(4000, Math.floor(maxBars)));
  const listingMs = bitgetPerpListingStartMs(sym);
  const seen = new Set<number>();
  const out: Candle[] = [];
  let pageEnd = Date.now();
  let emptyStreak = 0;
  let first = true;

  while (out.length < cap && pageEnd > listingMs && emptyStreak < 4) {
    let rows: unknown[][] = [];
    try {
      rows = await fetchBitgetMixChunk({
        symbol: sym,
        granularity,
        startTime: listingMs,
        endTime: pageEnd,
        limit: Math.min(MAX_LIMIT, cap - out.length),
      });
    } catch {
      break;
    }
    if (!first) await sleep(REQ_GAP_MS);
    first = false;

    if (!rows.length) {
      emptyStreak++;
      pageEnd -= htfBarStepMs(timeframe) * Math.min(MAX_LIMIT, 80);
      continue;
    }
    emptyStreak = 0;
    let oldestMs = Infinity;
    let added = 0;
    for (const row of rows) {
      const c = parseBitgetCandleRow(row);
      if (!c) continue;
      const tsMs = c.time * 1000;
      if (tsMs < listingMs || tsMs > pageEnd) continue;
      if (seen.has(c.time)) continue;
      seen.add(c.time);
      out.push(c);
      added++;
      if (tsMs < oldestMs) oldestMs = tsMs;
      if (out.length >= cap) break;
    }
    if (added === 0 || !Number.isFinite(oldestMs)) break;
    const nextEnd = oldestMs - 1;
    if (nextEnd >= pageEnd || nextEnd < listingMs) break;
    pageEnd = nextEnd;
  }

  out.sort((a, b) => a.time - b.time);
  return out.slice(-cap);
}

/** 최근 N봉 — Bitget mix candles (volume_base = TV volume). HTF도 full 전량 금지. */
export async function fetchBitgetFuturesCandlesRecent(
  symbol: string,
  timeframe: string,
  maxBars: number
): Promise<Candle[]> {
  const tf = normalizeChartTimeframe(timeframe);
  const cap = Math.max(80, Math.min(4000, Math.floor(maxBars)));
  if (isBitgetHtfListingTf(tf)) {
    return fetchBitgetHtfByBars(symbol, tf, cap);
  }
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const granularity = chartTfToBitgetGranularity(timeframe);
  const endMs = Date.now();
  const dayMs = 86_400_000;
  const windowMs = 90 * dayMs;
  const listingMs = bitgetPerpListingStartMs(sym);
  /** 1d/1w/1M: 필요 봉 수만큼만 과거로 — 상장일까지 full 돌리지 않음 (예전 전환 속도) */
  const needMs = Math.ceil(cap * htfBarStepMs(tf) * 1.4) + windowMs;
  const startMs = Math.max(listingMs, endMs - needMs);

  const seen = new Set<number>();
  const out: Candle[] = [];
  let pageEnd = endMs;
  let emptyStreak = 0;

  while (out.length < cap && pageEnd > startMs && emptyStreak < 6) {
    const beginBoundary = Math.max(startMs, pageEnd - windowMs);
    let added = 0;
    let oldest = Infinity;

    let rows: unknown[][] = [];
    try {
      rows = await fetchBitgetMixChunk({
        symbol: sym,
        granularity,
        startTime: beginBoundary,
        endTime: pageEnd,
        limit: Math.min(MAX_LIMIT, cap - out.length),
      });
    } catch {
      break;
    }
    if (out.length > 0) await sleep(REQ_GAP_MS);

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

export let lastBetweenProbe: Record<string, unknown> = {};

/**
 * history-candles limit≈360 이라 90일 창을 쓰면 15m/5m가 대부분 비어 저장된다.
 * TF 1봉 간격 × 280개만 한 페이지로 당긴다.
 */
function mixHistoryWindowMs(granularity: string): number {
  const step: Record<string, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '1H': 3_600_000,
    '4H': 14_400_000,
    '1D': 86_400_000,
    '1W': 7 * 86_400_000,
    '1M': 31 * 86_400_000,
  };
  const s = step[String(granularity)] ?? 900_000;
  /** history-candles limit 200 — 한 페이지를 그 이하로 */
  return Math.min(90 * 86_400_000, s * 180);
}

/** 지정 구간만 페이지 — 품질 복구·증분 수집. 전량 재다운로드 금지. */
export async function fetchBitgetFuturesCandlesBetween(
  symbol: string,
  timeframe: string,
  startMs: number,
  endMs: number
): Promise<Candle[]> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const granularity = chartTfToBitgetGranularity(timeframe);
  const listingMs = bitgetPerpListingStartMs(sym);
  const from = Math.max(listingMs, Math.min(startMs, endMs));
  const to = Math.max(from + 1, endMs);
  const windowMs = mixHistoryWindowMs(granularity);
  const seen = new Set<number>();
  const out: Candle[] = [];
  let pageEnd = to;
  let emptyStreak = 0;
  while (pageEnd > from && emptyStreak < 24 && out.length < 400_000) {
    const beginBoundary = Math.max(from, pageEnd - windowMs);
    let added = 0;
    let oldest = Infinity;
    let rows: unknown[][] = [];
    try {
      rows = await fetchBitgetMixHistoryChunk({
        symbol: sym,
        granularity,
        startTime: beginBoundary,
        endTime: pageEnd,
        limit: MAX_LIMIT,
      });
      if (!rows.length) {
        rows = await fetchBitgetMixChunk({
          symbol: sym,
          granularity,
          startTime: beginBoundary,
          endTime: pageEnd,
          limit: MAX_LIMIT,
        });
      }
    } catch {
      rows = [];
    }
    await sleep(REQ_GAP_MS);
    if (out.length === 0) {
      lastBetweenProbe = {
        from,
        to,
        pageEnd,
        beginBoundary,
        rowsLen: rows.length,
        row0: rows[0] ?? null,
        parsed: rows[0] ? parseBitgetCandleRow(rows[0] as unknown[]) : null,
      };
    }
    for (const row of rows) {
      const c = parseBitgetCandleRow(row);
      if (!c) continue;
      const ms = c.time > 10_000_000_000 ? c.time : c.time * 1000;
      if (ms < from || ms > to) continue;
      if (seen.has(c.time)) continue;
      seen.add(c.time);
      out.push(c);
      added++;
      if (ms < oldest) oldest = ms;
    }
    if (added === 0) {
      emptyStreak++;
      pageEnd = beginBoundary - 1;
      continue;
    }
    emptyStreak = 0;
    pageEnd = Number.isFinite(oldest) ? oldest - 1 : beginBoundary - 1;
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function mergeCandlesByTime(base: Candle[], tail: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of base) map.set(c.time, c);
  for (const c of tail) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function chartBarCapForBitget(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1m') return 3500;
  if (tf === '3m' || tf === '5m') return 2800;
  if (tf === '15m') return 3200;
  if (tf === '1h') return 2500;
  if (tf === '4h') return 2200;
  /** Bitget 상장(2019~) 전량 — 현물 2017 구간은 Bitget API에 없음 */
  if (tf === '1d') return 3600;
  if (tf === '1w') return 520;
  if (tf === '1M') return 200;
  return 2000;
}

/**
 * 통합·분석 / 마감·안착 차트용 — CSV(있으면) + Bitget API.
 * 1d/1w/1M: 상장일부터 페이지네이션 전량.
 * recentOnly: 짧은 구간만 (클라이언트 즉시 표시용 — 기능 삭제 아님).
 * recentOnly는 짧은 TTL 캐시로 스캔 폭주 시 Bitget·서버 부하 완화.
 */
const recentCandleCache = new Map<
  string,
  { at: number; payload: { candles: Candle[]; source: 'bitget-merged' | 'bitget-api' | 'bitget-csv' } }
>();
/** 동시 다수 유저가 같은 심볼·TF를 칠 때 Bitget 1회만 */
const recentCandleInflight = new Map<
  string,
  Promise<{ candles: Candle[]; source: 'bitget-merged' | 'bitget-api' | 'bitget-csv' }>
>();
const RECENT_CANDLE_TTL_MS = Math.max(
  3_000,
  Math.min(30_000, Number(process.env.BITGET_RECENT_CANDLE_TTL_MS || 10_000) || 10_000)
);

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
    const cacheKey = `${sym}|${tf}|recent`;
    const hit = recentCandleCache.get(cacheKey);
    if (hit && Date.now() - hit.at < RECENT_CANDLE_TTL_MS) {
      return hit.payload;
    }
    const pending = recentCandleInflight.get(cacheKey);
    if (pending) return pending;

    const loadRecent = async (): Promise<{
      candles: Candle[];
      source: 'bitget-merged' | 'bitget-api' | 'bitget-csv';
    }> => {
      const recentCap =
        tf === '1d' ? 720 : tf === '1w' ? 400 : tf === '1M' ? 160 : Math.min(cap, 800);
      let live: Candle[] = [];
      try {
        live = await fetchBitgetFuturesCandlesRecent(sym, timeframe, recentCap);
      } catch {
        live = [];
      }
      let payload: {
        candles: Candle[];
        source: 'bitget-merged' | 'bitget-api' | 'bitget-csv';
      } | null = null;
      if (live.length >= 8) {
        payload = { candles: live.slice(-recentCap), source: 'bitget-api' };
      } else {
        try {
          const csv = await readBitgetFuturesCsv(sym, timeframe);
          if (csv.length >= 8) {
            const merged = live.length ? mergeCandlesByTime(csv, live) : csv;
            payload = {
              candles: merged.slice(-recentCap),
              source: live.length ? 'bitget-merged' : 'bitget-csv',
            };
          }
        } catch {
          /* CSV 없으면 API만 */
        }
        if (!payload && live.length > 0) {
          payload = { candles: live, source: 'bitget-api' };
        }
      }
      if (payload) {
        recentCandleCache.set(cacheKey, { at: Date.now(), payload });
        if (recentCandleCache.size > 80) {
          const oldest = [...recentCandleCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) recentCandleCache.delete(oldest[0]);
        }
        return payload;
      }
      return { candles: [], source: 'bitget-api' };
    };

    const p = loadRecent().finally(() => {
      recentCandleInflight.delete(cacheKey);
    });
    recentCandleInflight.set(cacheKey, p);
    return p;
  }

  if (useFullHistory && !opts?.recentOnly) {
    let csv: Candle[] = [];
    try {
      csv = await readBitgetFuturesCsv(sym, timeframe);
    } catch {
      csv = [];
    }
    const liveTip = await fetchBitgetFuturesCandlesRecent(sym, timeframe, Math.min(cap, 500));
    if (csv.length >= 80 && liveTip.length >= 8) {
      return { candles: mergeCandlesByTime(csv, liveTip).slice(-cap), source: 'bitget-merged' };
    }
    const full = await fetchBitgetFuturesCandlesFullHistory(sym, timeframe, cap);
    if (full.length >= 20) {
      return { candles: full, source: 'bitget-api' };
    }
  }

  /**
   * 1w/1M: CSV+API 머지 금지 — 시가 버킷(16:00 UTC)은 같아도 종가가 어긋나면
   * 거래소 차트와 다른 봉이 됨. API 우선, 없을 때만 CSV.
   */
  let live: Candle[] = [];
  try {
    live = await fetchBitgetFuturesCandlesRecent(sym, timeframe, cap);
  } catch {
    live = [];
  }
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
  throw new Error(`Bitget ${sym}.P 캔들 없음`);
}
