/**
 * MarketDataBus — Bitget/live·클라이언트 OHLCV 공유.
 * Engine·ChartView·analyze가 동일 key로 구독 → REST 중복 감소.
 * Raw 날조 없음. 없으면 availability false / 데이터 없음.
 */

export type MarketBusKey = string;

/** 레인: 서버 live 스냅샷 · 클라이언트 캔들 depth · mark/index */
export type MarketBusLane =
  | 'live'
  | 'client-ohlcv'
  | 'client-ohlcv-recent'
  | 'client-ohlcv-full'
  | 'mark'
  | 'index'
  | 'trades'
  | 'orderbook'
  | 'oi'
  | 'funding'
  | 'liquidation';

const DEFAULT_TTL_MS = Number(process.env.EAGLE1_MARKET_BUS_TTL_MS || 2_500);
const CLIENT_OHLCV_TTL_MS = Number(process.env.EAGLE1_CLIENT_OHLCV_BUS_TTL_MS || 1_800);

type CacheRow<T> = {
  at: number;
  data: T;
};

const inflight = new Map<MarketBusKey, Promise<unknown>>();
const cache = new Map<MarketBusKey, CacheRow<unknown>>();
let fetchCount = 0;
let hitCount = 0;

export function marketBusKey(
  symbol: string,
  timeframe: string,
  lane: MarketBusLane | string = 'live'
): MarketBusKey {
  return `${lane}|${String(symbol || 'BTCUSDT').toUpperCase()}|${String(timeframe || '15m')}`;
}

/** ChartView/prefetch용 — source 포함 */
export function marketBusCandleKey(
  symbol: string,
  timeframe: string,
  source: 'binance' | 'bitget',
  depth: 'default' | 'recent' | 'full' = 'default'
): MarketBusKey {
  const lane: MarketBusLane =
    depth === 'recent' ? 'client-ohlcv-recent' : depth === 'full' ? 'client-ohlcv-full' : 'client-ohlcv';
  return marketBusKey(`${source}:${symbol}`, timeframe, lane);
}

export function marketBusStats(): {
  fetches: number;
  hits: number;
  inflight: number;
  cached: number;
  hitRatio: number;
} {
  const total = fetchCount + hitCount;
  return {
    fetches: fetchCount,
    hits: hitCount,
    inflight: inflight.size,
    cached: cache.size,
    hitRatio: total > 0 ? hitCount / total : 0,
  };
}

export function clearMarketBus(prefix?: string): void {
  if (!prefix) {
    inflight.clear();
    cache.clear();
    fetchCount = 0;
    hitCount = 0;
    return;
  }
  for (const k of [...inflight.keys()]) {
    if (k.startsWith(prefix)) inflight.delete(k);
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/**
 * 동일 key 동시 요청은 한 번만 loader 실행.
 * TTL 안이면 캐시 반환 (가짜 데이터 생성 없음).
 */
export async function subscribeMarketBus<T>(
  key: MarketBusKey,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheRow<T> | undefined;
  if (hit && now - hit.at <= ttlMs) {
    hitCount += 1;
    return hit.data;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    hitCount += 1;
    return pending;
  }

  fetchCount += 1;
  const run = loader()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, run);
  return run;
}

/** 클라이언트 OHLCV — ChartView·prefetch 공용 */
export async function subscribeMarketBusCandles<T>(
  opts: {
    symbol: string;
    timeframe: string;
    source: 'binance' | 'bitget';
    depth?: 'default' | 'recent' | 'full';
    ttlMs?: number;
  },
  loader: () => Promise<T>
): Promise<T> {
  const depth = opts.depth ?? 'default';
  const key = marketBusCandleKey(opts.symbol, opts.timeframe, opts.source, depth);
  const ttl =
    opts.ttlMs ??
    (depth === 'recent' ? Math.min(CLIENT_OHLCV_TTL_MS, 1_200) : CLIENT_OHLCV_TTL_MS);
  return subscribeMarketBus(key, loader, ttl);
}

/** 동시 구독 시 fetch 1회인지 검증용 */
export async function marketBusConcurrentSelftest(): Promise<{ ok: boolean; note: string }> {
  clearMarketBus();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { n: loads };
  };
  const key = marketBusKey('BTCUSDT', '15m', 'live');
  const [a, b, c] = await Promise.all([
    subscribeMarketBus(key, loader, 5_000),
    subscribeMarketBus(key, loader, 5_000),
    subscribeMarketBus(key, loader, 5_000),
  ]);
  const stats = marketBusStats();
  const ok = loads === 1 && a.n === 1 && b.n === 1 && c.n === 1 && stats.fetches === 1 && stats.hits >= 2;
  return {
    ok,
    note: ok
      ? `Bus 동시구독 OK · loads=${loads} fetches=${stats.fetches} hits=${stats.hits}`
      : `Bus FAIL · loads=${loads} fetches=${stats.fetches} hits=${stats.hits}`,
  };
}
