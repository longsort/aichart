/**
 * PHASE 17 — Historical Zone cache (in-memory LRU).
 * Recompute gate: new closed bar · TF/symbol change · force.
 * Merges with freezeStore / zoneFreeze / endExclusive causality — does not replace engines.
 * No disk I/O · no fake data.
 */

import { EAGLE1_ENGINE_VERSION } from './rawTypes';

export type HistoricalZoneCacheKey = {
  symbol: string;
  timeframe: string;
  /** last closed bar time (unix sec) — NOT forming bar */
  closedBarTime: number;
  engineVersion: string;
};

export type HistoricalZoneCacheEntry = {
  key: HistoricalZoneCacheKey;
  /** fingerprint of frozen zone bounds */
  zoneFingerprint: string;
  coreSupportMid: number | null;
  coreResistMid: number | null;
  computed_at: number;
};

const MAX_ENTRIES = 32;
const store = new Map<string, HistoricalZoneCacheEntry>();

function normalizeSym(s: string): string {
  return String(s || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
}

function normalizeTf(tf: string): string {
  return String(tf || '').trim() || '1H';
}

export function historicalZoneCacheKeyEquals(
  a: HistoricalZoneCacheKey | null | undefined,
  b: HistoricalZoneCacheKey | null | undefined
): boolean {
  if (!a || !b) return false;
  return (
    normalizeSym(a.symbol) === normalizeSym(b.symbol) &&
    normalizeTf(a.timeframe) === normalizeTf(b.timeframe) &&
    Number(a.closedBarTime) === Number(b.closedBarTime) &&
    String(a.engineVersion) === String(b.engineVersion)
  );
}

function keyId(k: HistoricalZoneCacheKey): string {
  return `${normalizeSym(k.symbol)}|${normalizeTf(k.timeframe)}|${Number(k.closedBarTime)}|${k.engineVersion}`;
}

/**
 * Last closed bar unix sec.
 * - endExclusive provided → candles[endExclusive - 1]
 * - treatLastAsForming (live) → candles[n - 2] when n >= 2
 * - else → last candle time
 */
export function closedBarTimeFromCandles(
  candles: Array<{ time?: number }> | null | undefined,
  opts?: { endExclusive?: number; treatLastAsForming?: boolean }
): number {
  const list = Array.isArray(candles) ? candles : [];
  if (!list.length) return 0;
  let idx: number;
  if (opts?.endExclusive != null && Number.isFinite(opts.endExclusive)) {
    idx = Math.min(list.length, Math.max(0, Math.floor(opts.endExclusive))) - 1;
  } else if (opts?.treatLastAsForming && list.length >= 2) {
    idx = list.length - 2;
  } else {
    idx = list.length - 1;
  }
  if (idx < 0) return 0;
  const t = Number(list[idx]?.time);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

export function buildHistoricalZoneCacheKey(params: {
  symbol?: string;
  timeframe: string;
  closedBarTime: number;
  engineVersion?: string;
}): HistoricalZoneCacheKey {
  return {
    symbol: normalizeSym(params.symbol || 'BTCUSDT'),
    timeframe: normalizeTf(params.timeframe),
    closedBarTime: Number(params.closedBarTime) || 0,
    engineVersion: params.engineVersion || EAGLE1_ENGINE_VERSION,
  };
}

/** Stable fingerprint of frozen zone price bounds (no fake prices). */
export function fingerprintFrozenZoneBounds(
  zones: Array<{ lower?: number; upper?: number; midpoint?: number; frozen?: boolean; zone_id?: string }> | null | undefined
): string {
  const rows = (zones ?? [])
    .filter((z) => z && z.frozen)
    .map((z) => {
      const lo = Number(z.lower);
      const hi = Number(z.upper);
      const mid = Number(z.midpoint);
      const id = String(z.zone_id || '');
      return `${id}:${Number.isFinite(lo) ? lo.toFixed(2) : '?'}-${Number.isFinite(hi) ? hi.toFixed(2) : '?'}:${Number.isFinite(mid) ? mid.toFixed(2) : '?'}`;
    })
    .sort();
  if (!rows.length) return 'empty';
  let h = 2166136261;
  const blob = rows.join('|');
  for (let i = 0; i < blob.length; i++) {
    h ^= blob.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `z${(h >>> 0).toString(16)}:${rows.length}`;
}

export function getHistoricalZoneCache(key: HistoricalZoneCacheKey): HistoricalZoneCacheEntry | null {
  const id = keyId(key);
  const hit = store.get(id);
  if (!hit) return null;
  /** LRU touch */
  store.delete(id);
  store.set(id, hit);
  return hit;
}

export function setHistoricalZoneCache(entry: HistoricalZoneCacheEntry): void {
  if (!entry?.key) return;
  const id = keyId(entry.key);
  if (store.has(id)) store.delete(id);
  store.set(id, {
    ...entry,
    key: buildHistoricalZoneCacheKey(entry.key),
    computed_at: Number(entry.computed_at) || Date.now(),
  });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest == null) break;
    store.delete(oldest);
  }
}

/**
 * true → recompute zones (new closed bar / TF / symbol / engine / force).
 * Pipeline already causal on endExclusive; this gates optional cache reuse.
 */
export function shouldRecomputeEagle1Zones(params: {
  prevKey: HistoricalZoneCacheKey | null;
  nextKey: HistoricalZoneCacheKey;
  force?: boolean;
}): boolean {
  if (params.force) return true;
  if (!params.prevKey) return true;
  return !historicalZoneCacheKeyEquals(params.prevKey, params.nextKey);
}

/** Test / process reset only */
export function clearHistoricalZoneCache(): void {
  store.clear();
}

export function historicalZoneCacheAcceptance(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  clearHistoricalZoneCache();

  const k1 = buildHistoricalZoneCacheKey({
    symbol: 'BTCUSDT',
    timeframe: '4H',
    closedBarTime: 1_700_000_000,
  });
  const k2 = buildHistoricalZoneCacheKey({
    symbol: 'BTCUSDT',
    timeframe: '4H',
    closedBarTime: 1_700_014_400,
  });
  const kSame = buildHistoricalZoneCacheKey({
    symbol: 'btcusdt',
    timeframe: '4H',
    closedBarTime: 1_700_000_000,
  });

  if (!historicalZoneCacheKeyEquals(k1, kSame)) notes.push('keyEquals normalize fail');
  if (historicalZoneCacheKeyEquals(k1, k2)) notes.push('keyEquals different closedBar');

  if (!shouldRecomputeEagle1Zones({ prevKey: null, nextKey: k1 })) notes.push('null prev must recompute');
  if (!shouldRecomputeEagle1Zones({ prevKey: k1, nextKey: k2 })) notes.push('new bar must recompute');
  if (shouldRecomputeEagle1Zones({ prevKey: k1, nextKey: kSame })) notes.push('same key should skip');
  if (!shouldRecomputeEagle1Zones({ prevKey: k1, nextKey: kSame, force: true })) notes.push('force must recompute');

  const fp = fingerprintFrozenZoneBounds([
    { zone_id: 'a', lower: 100, upper: 110, midpoint: 105, frozen: true },
    { zone_id: 'b', lower: 90, upper: 95, midpoint: 92.5, frozen: true },
  ]);
  const fp2 = fingerprintFrozenZoneBounds([
    { zone_id: 'b', lower: 90, upper: 95, midpoint: 92.5, frozen: true },
    { zone_id: 'a', lower: 100, upper: 110, midpoint: 105, frozen: true },
  ]);
  if (!fp || fp === 'empty') notes.push('fingerprint empty');
  if (fp !== fp2) notes.push('fingerprint order-unstable');

  setHistoricalZoneCache({
    key: k1,
    zoneFingerprint: fp,
    coreSupportMid: 100,
    coreResistMid: 110,
    computed_at: Date.now(),
  });
  const hit = getHistoricalZoneCache(k1);
  if (!hit || hit.zoneFingerprint !== fp) notes.push('get/set miss');
  if (hit?.coreSupportMid !== 100) notes.push('core mid miss');

  const closed = closedBarTimeFromCandles(
    [{ time: 100 }, { time: 200 }, { time: 300 }],
    { treatLastAsForming: true }
  );
  if (closed !== 200) notes.push(`closedBar forming expected 200 got ${closed}`);
  const closedEnd = closedBarTimeFromCandles([{ time: 100 }, { time: 200 }, { time: 300 }], {
    endExclusive: 2,
  });
  if (closedEnd !== 200) notes.push(`closedBar endExclusive expected 200 got ${closedEnd}`);

  /** LRU cap */
  for (let i = 0; i < 40; i++) {
    setHistoricalZoneCache({
      key: buildHistoricalZoneCacheKey({ symbol: 'BTCUSDT', timeframe: '1H', closedBarTime: 1_000_000 + i }),
      zoneFingerprint: `t${i}`,
      coreSupportMid: null,
      coreResistMid: null,
      computed_at: Date.now(),
    });
  }
  if (store.size > MAX_ENTRIES) notes.push(`LRU overflow size=${store.size}`);

  clearHistoricalZoneCache();
  return { ok: notes.length === 0, notes };
}
