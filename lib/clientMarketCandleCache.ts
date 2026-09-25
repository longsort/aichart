/**
 * 브라우저 공유 마켓 캔들 캐시 — TF 전환 시 ChartView·prefetch가 같은 in-flight를 쓰고
 * 직전 응답을 즉시 화면에 붙인다 (빈 차트 깜빡임·중복 fetch 완화).
 *
 * TV/거래소형: 1m~1M 전부 recent 즉시 → full 백그라운드 (기능·전량 유지, 전환 체감 가속).
 * TTL 만료 시에도 stale-while-revalidate — 화면은 즉시, 갱신은 뒤.
 */
import type { Candle } from '@/types';
import { isListingFullHistoryTf, normalizeChartTimeframe } from '@/lib/constants';
import { MERGED_DESK_CHART_TIMEFRAMES } from '@/lib/mergedDesk4hReference';

export type ClientMarketSource = 'binance' | 'bitget';

/** 차트 TF 명목 봉 간격(초) — 1d/1w/1M 구분 검증용 */
export function chartTfStepSec(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  if (t === '1m') return 60;
  if (t === '3m') return 180;
  if (t === '5m') return 300;
  if (t === '15m') return 900;
  if (t === '30m') return 1800;
  if (t === '1h') return 3600;
  if (t === '2h') return 7200;
  if (t === '4h') return 14400;
  if (t === '6h') return 21600;
  if (t === '8h') return 28800;
  if (t === '12h') return 43200;
  if (t === '1d') return 86400;
  if (t === '1w') return 604800;
  if (t === '1M') return 30 * 86400;
  return 3600;
}

/**
 * 시리즈가 해당 TF 봉인지(중앙 step).
 * 일봉 잔상만 강하게 거절 — 주·월 갭(휴장·결측)은 허용 (예전 동작 복구).
 * Bitget HTF·희소 갭은 느슨하게 — TF 전환 시 전량 로드가 빈 화면으로 떨어지지 않게.
 */
export function candlesMatchChartTimeframe(candles: Candle[] | null | undefined, tf: string): boolean {
  if (!candles || candles.length < 3) return false;
  const t = normalizeChartTimeframe(tf);
  const expect = chartTfStepSec(t);
  const n = candles.length;
  const samples: number[] = [];
  const from = Math.max(1, n - 36);
  for (let i = from; i < n; i++) {
    const d = Number(candles[i]!.time) - Number(candles[i - 1]!.time);
    if (d > 0) samples.push(d);
  }
  if (!samples.length) return false;
  samples.sort((a, b) => a - b);
  const med = samples[Math.floor(samples.length / 2)]!;
  const day = 86400;
  /** 월봉: 20~40일대 — 일·주 잔상만 거절 */
  if (t === '1M') {
    return med >= 16 * day && med <= 50 * day;
  }
  /** 주봉 */
  if (t === '1w') {
    return med >= 4 * day && med <= 18 * day;
  }
  /** 일봉 */
  if (t === '1d') {
    return med >= Math.floor(0.55 * day) && med <= Math.floor(3.2 * day);
  }
  /** 4h — 주말·결측 갭 */
  if (t === '4h') {
    return med >= expect * 0.55 && med <= expect * 2.2;
  }
  const lo = expect * 0.65;
  const hi = expect * 1.55;
  return med >= lo && med <= hi;
}

/**
 * TF 전환용 — 엄격 매치 실패해도 완전 거절하지 않을 때(빈 차트 방지).
 * 명백한 다른 TF(예: 일봉을 1m에)만 false.
 */
export function candlesPlausibleForChartTf(
  candles: Candle[] | null | undefined,
  tf: string
): boolean {
  if (!candles || candles.length < 2) return false;
  if (candles.length < 8) return true;
  if (candlesMatchChartTimeframe(candles, tf)) return true;
  const t = normalizeChartTimeframe(tf);
  const expect = chartTfStepSec(t);
  const n = candles.length;
  const d =
    Number(candles[n - 1]!.time) - Number(candles[Math.max(0, n - 8)]!.time);
  if (!(d > 0)) return false;
  const avg = d / Math.min(7, n - 1);
  /** 기대 step의 0.25~4배면 일단 수용(갭·거래소 위상) */
  return avg >= expect * 0.25 && avg <= expect * 4.5;
}

type CacheEntry = {
  candles: Candle[];
  fetchedAt: number;
  /** full = 전량 히스토리 · recent = 짧은 즉시 구간 */
  depth: 'full' | 'recent';
};

type InflightWaiter = {
  onPartial?: (candles: Candle[]) => void;
};

/** 분·시 TF — TF 전환 체감용 (서버 왕복 줄임) */
const TTL_MS = 5 * 60_000;
/** 1d/1w/1M 전량 */
const FULL_HTF_TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 64;
const dataCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Candle[]>>();
/** 동일 key in-flight에 붙은 대기자 — prefetch가 먼저 열어도 ChartView onPartial 전달 */
const inflightWaiters = new Map<string, Set<InflightWaiter>>();
/** full/SWR 완료까지 유지 (fetch await 후에도 ChartView idle 적용) */
const upgradeListeners = new Map<string, Set<(candles: Candle[]) => void>>();
const bgUpgrade = new Set<string>();

/** v3 — 주·월봉 혼입 수정 후 */
export function clientMarketCacheKey(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource = 'binance'
): string {
  return `v3|${source}|${symbol}|${timeframe}`;
}

function entryTtlMs(timeframe: string, depth: 'full' | 'recent'): number {
  if (depth === 'full' && isListingFullHistoryTf(timeframe)) return FULL_HTF_TTL_MS;
  return TTL_MS;
}

function addPartialWaiter(key: string, waiter: InflightWaiter): () => void {
  let set = inflightWaiters.get(key);
  if (!set) {
    set = new Set();
    inflightWaiters.set(key, set);
  }
  set.add(waiter);
  return () => {
    set!.delete(waiter);
    if (!set!.size) inflightWaiters.delete(key);
  };
}

function addUpgradeListener(key: string, cb?: (candles: Candle[]) => void): void {
  if (!cb) return;
  let set = upgradeListeners.get(key);
  if (!set) {
    set = new Set();
    upgradeListeners.set(key, set);
  }
  set.add(cb);
}

function notifyPartial(key: string, candles: Candle[]): void {
  const set = inflightWaiters.get(key);
  if (!set) return;
  for (const w of set) w.onPartial?.(candles);
}

function notifyUpgrade(key: string, candles: Candle[]): void {
  const set = upgradeListeners.get(key);
  if (!set?.size) return;
  upgradeListeners.delete(key);
  for (const cb of set) {
    try {
      cb(candles);
    } catch {
      /* 차트 unmount 등 */
    }
  }
}

export function peekClientMarketCandles(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource = 'binance',
  allowStale = false
): Candle[] | null {
  const key = clientMarketCacheKey(symbol, timeframe, source);
  const hit = dataCache.get(key);
  if (!hit?.candles.length) return null;
  const ttl = entryTtlMs(timeframe, hit.depth);
  if (Date.now() - hit.fetchedAt > ttl) {
    return allowStale ? hit.candles : null;
  }
  return hit.candles;
}

/** 깊이 포함 peek — ChartView 즉시 페인트용 */
export function peekClientMarketCandleEntry(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource = 'binance'
): CacheEntry | null {
  const key = clientMarketCacheKey(symbol, timeframe, source);
  return dataCache.get(key) ?? null;
}

export function putClientMarketCandles(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  source: ClientMarketSource = 'binance',
  depth: 'full' | 'recent' = 'full'
): void {
  if (!candles.length) return;
  const key = clientMarketCacheKey(symbol, timeframe, source);
  const prev = dataCache.get(key);
  /** 이미 전량이 있으면 더 짧은 recent로 덮지 않음 */
  if (prev?.depth === 'full' && depth === 'recent' && prev.candles.length >= candles.length) {
    return;
  }
  dataCache.set(key, { candles, fetchedAt: Date.now(), depth });
  if (dataCache.size > MAX_ENTRIES) {
    const oldest = dataCache.keys().next().value;
    if (oldest) dataCache.delete(oldest);
  }
}

function marketUrl(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource,
  depth?: 'recent' | 'full'
): string {
  const base = source === 'bitget' ? '/api/market-bitget' : '/api/market';
  const q = new URLSearchParams({
    symbol,
    timeframe,
  });
  if (depth) q.set('depth', depth);
  return `${base}?${q.toString()}`;
}

async function fetchMarketJsonOnce(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource,
  depth?: 'recent' | 'full',
  signal?: AbortSignal
): Promise<Candle[]> {
  const res = await fetch(marketUrl(symbol, timeframe, source, depth), {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw new Error(`market ${res.status}`);
  const payload = (await res.json()) as { ok?: boolean; candles?: Candle[]; error?: string };
  if (!payload.ok || !Array.isArray(payload.candles)) {
    throw new Error(payload.error || 'market fetch failed');
  }
  return payload.candles;
}

/**
 * Bitget 우선 요청 — 알트/심볼 미지원·빈 응답이면 /api/market(바이낸스·환율) 폴백.
 * 환율(USDKRW/CNYKRW)은 호출측에서 source=binance 로 오면 여기로 바로 감.
 */
async function fetchMarketJson(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource,
  depth?: 'recent' | 'full',
  signal?: AbortSignal
): Promise<Candle[]> {
  try {
    const primary = await fetchMarketJsonOnce(symbol, timeframe, source, depth, signal);
    if (primary.length >= 8 || source !== 'bitget') return primary;
  } catch (e) {
    if (source !== 'bitget') throw e;
  }
  if (source === 'bitget') {
    return fetchMarketJsonOnce(symbol, timeframe, 'binance', depth, signal);
  }
  return [];
}

function mergeByTime(a: Candle[], b: Candle[]): Candle[] {
  const m = new Map<number, Candle>();
  for (const c of a) m.set(Number(c.time), c);
  for (const c of b) m.set(Number(c.time), c);
  return [...m.values()].sort((x, y) => x.time - y.time);
}

/**
 * 실시간 팁 — 최근 봉만 받아 기존 full 캐시에 병합(HTF 차트 길이 유지).
 * 거래소 마지막 봉 OHLC를 폴링으로 보정할 때 사용.
 */
export async function refreshClientMarketCandleTip(opts: {
  symbol: string;
  timeframe: string;
  source?: ClientMarketSource;
  signal?: AbortSignal;
  /** 팁으로 가져올 최근 봉 수 (API depth=recent 사용) */
  tipBars?: number;
}): Promise<Candle[] | null> {
  const source = opts.source ?? 'binance';
  const tf = normalizeChartTimeframe(opts.timeframe) || opts.timeframe;
  const key = clientMarketCacheKey(opts.symbol, tf, source);
  const prev = dataCache.get(key)?.candles ?? [];

  try {
    /** 항상 recent — 전량 재다운로드 금지, last bars만 병합 */
    const tip = await fetchMarketJson(opts.symbol, tf, source, 'recent', opts.signal);
    if (!tip.length) return prev.length ? prev : null;
    const merged = prev.length ? mergeByTime(prev, tip) : tip;
    /** 이미 full이 있으면 depth 유지(히스토리 길이 보존) */
    const prevDepth = dataCache.get(key)?.depth ?? 'full';
    putClientMarketCandles(
      opts.symbol,
      tf,
      merged,
      source,
      prevDepth === 'full' || merged.length >= (prev.length || 0) ? 'full' : prevDepth
    );
    return merged;
  } catch {
    return prev.length ? prev : null;
  }
}

function scheduleHtfFullUpgrade(
  symbol: string,
  tf: string,
  source: ClientMarketSource,
  cacheKey: string
): void {
  if (bgUpgrade.has(cacheKey)) return;
  bgUpgrade.add(cacheKey);
  void (async () => {
    try {
      const full = await fetchMarketJson(symbol, tf, source, 'full');
      const cached = dataCache.get(cacheKey);
      if (full.length >= (cached?.candles.length ?? 0) * 0.5) {
        putClientMarketCandles(symbol, tf, full, source, 'full');
        notifyUpgrade(cacheKey, full);
      } else if (cached?.candles.length) {
        const merged = mergeByTime(cached.candles, full);
        putClientMarketCandles(symbol, tf, merged, source, 'full');
        notifyUpgrade(cacheKey, merged);
      }
    } catch {
      /* recent 유지 */
    } finally {
      bgUpgrade.delete(cacheKey);
    }
  })();
}

function scheduleBackgroundRefresh(
  symbol: string,
  tf: string,
  source: ClientMarketSource,
  htf: boolean,
  cacheKey: string
): void {
  const bgKey = cacheKey + '|bg';
  if (bgUpgrade.has(bgKey)) return;
  bgUpgrade.add(bgKey);
  void (async () => {
    try {
      if (htf) {
        const full = await fetchMarketJson(symbol, tf, source, 'full');
        putClientMarketCandles(symbol, tf, full, source, 'full');
        notifyUpgrade(cacheKey, full);
      } else {
        const candles = await fetchMarketJson(symbol, tf, source);
        putClientMarketCandles(symbol, tf, candles, source, 'full');
        notifyUpgrade(cacheKey, candles);
      }
    } catch {
      /* stale 유지 */
    } finally {
      bgUpgrade.delete(bgKey);
    }
  })();
}

/**
 * 동일 (symbol,tf,source) in-flight 병합 + TTL 캐시 + SWR.
 * onPartial: recent 즉시 · onUpgrade: full/백그라운드 갱신.
 * maxAgeMs: 실시간 폴링용 — 캐시가 이보다 오래되면 네트워크 재조회(TTL 무시).
 */
export async function fetchClientMarketCandles(opts: {
  symbol: string;
  timeframe: string;
  source?: ClientMarketSource;
  signal?: AbortSignal;
  onPartial?: (candles: Candle[]) => void;
  /** full·SWR 갱신 완료 시 (차트 idle 적용용) */
  onUpgrade?: (candles: Candle[]) => void;
  /** 실시간 폴링: 캐시 age가 이 값(ms) 초과면 강제 fetch */
  maxAgeMs?: number;
  /** true면 recent만 — 이웃 TF가 full로 대역 점유하지 않음 (HTF·LTF 공통) */
  skipHtfFullUpgrade?: boolean;
  /** alias — skipHtfFullUpgrade 와 동일 */
  skipFullUpgrade?: boolean;
}): Promise<Candle[]> {
  const source = opts.source ?? 'binance';
  const tf = normalizeChartTimeframe(opts.timeframe) || opts.timeframe;
  const key = clientMarketCacheKey(opts.symbol, tf, source);
  const htf = isListingFullHistoryTf(tf);
  const skipFull =
    opts.skipFullUpgrade === true || opts.skipHtfFullUpgrade === true;
  const removePartial = addPartialWaiter(key, { onPartial: opts.onPartial });
  const liveMaxAge = typeof opts.maxAgeMs === 'number' && opts.maxAgeMs >= 0 ? opts.maxAgeMs : null;

  try {
    const hit = dataCache.get(key);

    /** 실시간 폴링 — 신선하면 캐시, 아니면 아래로 내려가 네트워크 */
    if (liveMaxAge != null && hit?.candles.length) {
      if (Date.now() - hit.fetchedAt <= liveMaxAge) {
        return hit.candles;
      }
      /* fall through: force network */
    } else if (hit?.candles.length) {
      const fresh = Date.now() - hit.fetchedAt <= entryTtlMs(tf, hit.depth);

      if (hit.depth === 'full') {
        if (!fresh) {
          addUpgradeListener(key, opts.onUpgrade);
          scheduleBackgroundRefresh(opts.symbol, tf, source, htf, key);
        }
        return hit.candles;
      }

      /** recent만 있음 → 즉시 반환, full은 백그라운드 (1m~1M 공통 · TV형) */
      opts.onPartial?.(hit.candles);
      if (!skipFull) {
        addUpgradeListener(key, opts.onUpgrade);
        if (htf) {
          scheduleHtfFullUpgrade(opts.symbol, tf, source, key);
        } else {
          scheduleBackgroundRefresh(opts.symbol, tf, source, false, key);
        }
      }
      return hit.candles;
    }

    if (!skipFull) addUpgradeListener(key, opts.onUpgrade);

    let pending = inflight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          /** 1) recent 즉시 — full 대기 안 함 (분·시·일·주·월 공통) */
          const recent = await fetchMarketJson(opts.symbol, tf, source, 'recent');
          putClientMarketCandles(opts.symbol, tf, recent, source, 'recent');
          notifyPartial(key, recent);
          if (!skipFull) {
            if (htf) {
              scheduleHtfFullUpgrade(opts.symbol, tf, source, key);
            } else {
              scheduleBackgroundRefresh(opts.symbol, tf, source, false, key);
            }
          }
          return recent;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, pending);
    }

    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (opts.signal) {
      return await new Promise<Candle[]>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        opts.signal!.addEventListener('abort', onAbort, { once: true });
        pending!.then(
          (v) => {
            opts.signal!.removeEventListener('abort', onAbort);
            if (opts.signal!.aborted) reject(new DOMException('Aborted', 'AbortError'));
            else resolve(v);
          },
          (e) => {
            opts.signal!.removeEventListener('abort', onAbort);
            reject(e);
          }
        );
      });
    }
    return pending;
  } finally {
    queueMicrotask(removePartial);
  }
}

/** 서버 워밍만 — 응답 무시, 캐시 채움 */
export function prefetchClientMarketCandles(
  symbol: string,
  timeframe: string,
  source: ClientMarketSource = 'binance',
  opts?: { skipHtfFullUpgrade?: boolean; skipFullUpgrade?: boolean }
): void {
  if (typeof window === 'undefined') return;
  if (peekClientMarketCandles(symbol, timeframe, source, true)?.length) {
    const hit = dataCache.get(clientMarketCacheKey(symbol, timeframe, source));
    if (hit && Date.now() - hit.fetchedAt <= entryTtlMs(timeframe, hit.depth)) return;
    /** stale면 백그라운드만 */
  }
  void fetchClientMarketCandles({
    symbol,
    timeframe,
    source,
    skipHtfFullUpgrade: opts?.skipHtfFullUpgrade === true,
    skipFullUpgrade: opts?.skipFullUpgrade === true || opts?.skipHtfFullUpgrade === true,
  }).catch(() => {});
}

/**
 * 통합·분석 전 TF(1m~1M) 캐시 워밍 — TV형 즉시 전환용.
 * 현재 TF → 이웃 → HTF → 나머지. 비활성은 recent만(대역 보호).
 */
export function prefetchMergedDeskAllMarketTfs(
  symbol: string,
  source: ClientMarketSource = 'binance',
  priorityTf?: string
): void {
  if (typeof window === 'undefined') return;
  const pri = priorityTf ? normalizeChartTimeframe(priorityTf) : '';
  const all = [...MERGED_DESK_CHART_TIMEFRAMES];
  const htfSet = new Set(['1d', '1w', '1M']);
  const priIdx = pri ? all.indexOf(pri as (typeof all)[number]) : -1;
  const neighbor = new Set<string>();
  if (pri) neighbor.add(pri);
  if (priIdx >= 0) {
    if (priIdx > 0) neighbor.add(all[priIdx - 1]!);
    if (priIdx < all.length - 1) neighbor.add(all[priIdx + 1]!);
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (tf: string) => {
    if (!tf || seen.has(tf) || !all.includes(tf as (typeof all)[number])) return;
    seen.add(tf);
    ordered.push(tf);
  };
  push(pri);
  for (const tf of neighbor) push(tf);
  for (const tf of ['1d', '1w', '1M']) push(tf);
  for (const tf of all) push(tf);

  ordered.forEach((tf, i) => {
    const isPri = tf === pri;
    const isNear = neighbor.has(tf);
    /** 접속 직후 전 TF 폭주 완화 — 우선 TF만 즉시, 나머지는 길게 분산 */
    const delay = isPri ? 0 : isNear ? 180 + i * 140 : 900 + i * 320;
    window.setTimeout(() => {
      prefetchClientMarketCandles(symbol, tf, source, {
        /** 활성 TF만 full 업그레이드 — 나머지 recent로 전환 체감 */
        skipFullUpgrade: !isPri,
        skipHtfFullUpgrade: !isPri,
      });
    }, delay);
  });
}
