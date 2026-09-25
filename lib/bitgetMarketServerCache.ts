/**
 * Bitget 차트 캔들 서버 메모리 캐시 — 동일 심볼·TF 반복 요청을 즉시 반환.
 * 기능·전량 히스토리는 유지, 거래소 왕복만 줄임 (SWR).
 */
import type { Candle } from '@/types';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';

type Payload = { candles: Candle[]; source: 'bitget-merged' | 'bitget-api' | 'bitget-csv' };

type Entry = { at: number; payload: Payload };

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<Payload>>();

const TTL_RECENT_MS = 18_000;
const TTL_FULL_MS = 75_000;
const MAX_KEYS = 240;

function cacheKey(symbol: string, timeframe: string, recentOnly: boolean): string {
  return `${String(symbol || '').toUpperCase()}|${timeframe}|${recentOnly ? 'r' : 'f'}`;
}

function ttlMs(recentOnly: boolean): number {
  return recentOnly ? TTL_RECENT_MS : TTL_FULL_MS;
}

function touch(key: string, payload: Payload): void {
  mem.set(key, { at: Date.now(), payload });
  if (mem.size <= MAX_KEYS) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [k, v] of mem) {
    if (v.at < oldestAt) {
      oldestAt = v.at;
      oldestKey = k;
    }
  }
  if (oldestKey) mem.delete(oldestKey);
}

export function peekBitgetFuturesChartCandlesCached(
  symbol: string,
  timeframe: string,
  opts?: { recentOnly?: boolean }
): Payload | null {
  const recentOnly = opts?.recentOnly === true;
  const key = cacheKey(symbol, timeframe, recentOnly);
  const hit = mem.get(key);
  if (hit?.payload.candles.length >= 8) return hit.payload;
  if (!recentOnly) {
    const recent = mem.get(cacheKey(symbol, timeframe, true));
    if (recent?.payload.candles.length >= 8) return recent.payload;
  }
  return null;
}

export async function loadBitgetFuturesChartCandlesCached(
  symbol: string,
  timeframe: string,
  opts?: { recentOnly?: boolean }
): Promise<Payload> {
  const recentOnly = opts?.recentOnly === true;
  const key = cacheKey(symbol, timeframe, recentOnly);
  const hit = mem.get(key);
  const ttl = ttlMs(recentOnly);
  const now = Date.now();

  if (hit?.payload.candles.length >= 8) {
    if (now - hit.at < ttl) return hit.payload;
    /** stale-while-revalidate — 화면은 즉시, 갱신은 뒤 */
    if (!inflight.has(key)) {
      const p = loadBitgetFuturesChartCandles(symbol, timeframe, opts)
        .then((payload) => {
          touch(key, payload);
          inflight.delete(key);
          return payload;
        })
        .catch((e) => {
          inflight.delete(key);
          throw e;
        });
      inflight.set(key, p);
    }
    return hit.payload;
  }

  let p = inflight.get(key);
  if (!p) {
    p = loadBitgetFuturesChartCandles(symbol, timeframe, opts)
      .then((payload) => {
        touch(key, payload);
        inflight.delete(key);
        return payload;
      })
      .catch((e) => {
        inflight.delete(key);
        throw e;
      });
    inflight.set(key, p);
  }
  return p;
}
