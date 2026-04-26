import type { Candle, OverlayItem } from '@/types';

const MAX_OVERLAYS = 240;
/** 가로 줄선·존 근접: 가격 대비 약 0.12% (요청 스펙) */
const NEAR_REL = 0.0012;
/** ATR·레인지 보조 하한 — 극저가 틱에서 깨짐 방지 */
const ATR_MULT = 0.088;
const RANGE_MULT = 0.075;
const ATR_PERIOD = 14;

function candleDir(c: Candle): 'LONG' | 'SHORT' {
  return c.close >= c.open ? 'LONG' : 'SHORT';
}

function distSegToPoint(lo: number, hi: number, p: number): number {
  const L = Math.min(lo, hi);
  const H = Math.max(lo, hi);
  if (p >= L && p <= H) return 0;
  return Math.min(Math.abs(p - L), Math.abs(p - H));
}

function isHorizontalPrices(p1: number, p2: number): boolean {
  const ref = Math.max(Math.abs(p1), Math.abs(p2), 1e-9);
  return Math.abs(p1 - p2) / ref < 1e-5;
}

/**
 * 존 [z0,z1] 에 대한 캔들 [L,H] 근접 거리.
 * - 밖에서 접근: 구간 사이 갭
 * - 안쪽에 완전 포함: 가장 가까운 **경계**까지 거리 (중앙만 있으면 반짝 안 함)
 * - 걸침: 경계 접촉 → 0
 */
function zoneBoundaryProximityDist(L: number, H: number, a: number, b: number): number {
  const lo = Math.min(L, H);
  const hi = Math.max(L, H);
  const z0 = Math.min(a, b);
  const z1 = Math.max(a, b);
  if (hi < z0) return z0 - hi;
  if (lo > z1) return lo - z1;
  if (lo >= z0 && hi <= z1) return Math.min(lo - z0, z1 - hi);
  return 0;
}

function inTimeSpan(t: number, t1?: number, t2?: number): boolean {
  if (t1 == null && t2 == null) return true;
  const a = t1 != null ? Number(t1) : -Infinity;
  const b = t2 != null ? Number(t2) : Infinity;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return t >= lo && t <= hi;
}

function estimateMedianBarSeconds(candles: Candle[]): number {
  if (candles.length < 3) return 3600;
  const gaps: number[] = [];
  const n = candles.length;
  const from = Math.max(1, n - 48);
  for (let i = from; i < n; i++) {
    gaps.push(Math.abs((candles[i].time as number) - (candles[i - 1].time as number)));
  }
  if (!gaps.length) return 3600;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)] || 3600;
}

function computeAtrSma(candles: Candle[], period: number): number {
  const n = candles.length;
  if (n < period + 1) return 0;
  let sum = 0;
  for (let i = n - period; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
  }
  return sum / period;
}

function medianRecentRange(candles: Candle[], look = 32): number {
  const n = candles.length;
  if (n < 1) return 0;
  const ranges: number[] = [];
  const from = Math.max(0, n - look);
  for (let i = from; i < n; i++) {
    ranges.push(candles[i].high - candles[i].low);
  }
  ranges.sort((a, b) => a - b);
  return ranges[Math.floor(ranges.length / 2)] || 0;
}

function priceOnSegment(
  t: number,
  t1: number,
  p1: number,
  t2: number,
  p2: number
): number | null {
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  const dt = t2 - t1;
  if (Math.abs(dt) < 1e-12) return p1;
  return p1 + (p2 - p1) * ((t - t1) / dt);
}

const ZONE_LIKE = new Set<string>([
  'zone',
  'fvg',
  'ob',
  'supplyZone',
  'demandZone',
  'reactionZone',
  'bprZone',
]);

const LINE_LIKE = new Set<string>([
  'bos',
  'choch',
  'supportLine',
  'resistanceLine',
  'equilibrium',
  'eqh',
  'eql',
  'liquiditySweep',
  'keyLevel',
  'scenario',
  'fibLine',
  'strongHigh',
  'strongLow',
  'falseBreakout',
  'symTriangleTarget',
  'poi',
]);

function distToChannelBand(c: Candle, o: OverlayItem): number | null {
  const cb = o.channelBand;
  if (!cb) return null;
  const t = c.time as number;
  const t1 = cb.time1;
  const t2 = cb.time2;
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  if (t < lo || t > hi) return null;
  const dt = t2 - t1;
  const u = Math.abs(dt) < 1e-12 ? 0 : (t - t1) / dt;
  const ph = cb.priceHigh1 + (cb.priceHigh2 - cb.priceHigh1) * u;
  const pl = cb.priceLow1 + (cb.priceLow2 - cb.priceLow1) * u;
  const L = c.low;
  const H = c.high;
  return Math.min(distSegToPoint(L, H, ph), distSegToPoint(L, H, pl));
}

/**
 * 캔들 ↔ 오버레이 최소 거리(가격). 해당 없으면 null.
 */
function distanceCandleToOverlay(
  c: Candle,
  o: OverlayItem,
  medianBarSec: number
): number | null {
  const k = String(o.kind || '');
  const p1 = o.price1;
  const p2 = o.price2;
  const t1 = o.time1;
  const t2 = o.time2;
  const t = c.time as number;

  if (k === 'channelBand' && o.channelBand) {
    return distToChannelBand(c, o);
  }

  if (k === 'po3Phase') {
    if (p1 == null || !Number.isFinite(p1) || t1 == null) return null;
    const win = medianBarSec * 12;
    if (Math.abs(t - Number(t1)) > win) return null;
    return distSegToPoint(c.low, c.high, p1);
  }

  if (p1 == null || !Number.isFinite(p1)) return null;

  const p2n = p2 != null && Number.isFinite(p2) ? p2 : p1;

  if (!inTimeSpan(t, t1, t2)) return null;

  const L = c.low;
  const H = c.high;

  const isZone =
    ZONE_LIKE.has(k) || (k === 'zone' && String(o.category || '') !== 'chartPrimeTrendChannels');
  const isLine =
    LINE_LIKE.has(k) ||
    k === 'trendLine' ||
    (k === 'channelBand' && !o.channelBand);

  const t1n = t1 != null ? Number(t1) : null;
  const t2n = t2 != null ? Number(t2) : null;

  /** 대각 추세선은 캔들 근접 반짝·라벨 펄스에서 제외 — 가로에 가까울 때만 */
  if (k === 'trendLine' && t1n != null && t2n != null && !isHorizontalPrices(p1, p2n)) {
    return null;
  }

  if (k === 'channelBand' && !o.channelBand && t1n != null && t2n != null && !isHorizontalPrices(p1, p2n)) {
    const lo = Math.min(t1n, t2n);
    const hi = Math.max(t1n, t2n);
    if (t < lo || t > hi) return null;
    const px = priceOnSegment(t, t1n, p1, t2n, p2n);
    if (px == null || !Number.isFinite(px)) return null;
    return distSegToPoint(L, H, px);
  }

  if (isZone && p2 != null && Number.isFinite(p2) && !isHorizontalPrices(p1, p2n)) {
    const a = Math.min(p1, p2n);
    const b = Math.max(p1, p2n);
    return zoneBoundaryProximityDist(L, H, a, b);
  }

  if (isLine || (isZone && p2 != null && isHorizontalPrices(p1, p2n))) {
    const p = p2 != null && isHorizontalPrices(p1, p2n) ? (p1 + p2n) / 2 : p1;
    return distSegToPoint(L, H, p);
  }

  if ((k === 'label' || k === 'swingLabel') && p1 != null && Number.isFinite(p1)) {
    if (!inTimeSpan(t, t1, t2)) return null;
    return distSegToPoint(L, H, p1);
  }

  return null;
}

/** 줄선·존 근접 거리 임계(가격) — 기본 0.12%·보조 ATR/레인지. sensitivity>1 이면 더 넓게 잡혀 반짝↑ */
export function nearLineZoneThreshold(
  ref: number,
  atr: number,
  medRg: number,
  sensitivity = 1
): number {
  const s = Number.isFinite(sensitivity) ? Math.max(0.35, Math.min(2.6, sensitivity)) : 1;
  return (
    Math.max(ref * NEAR_REL, atr * ATR_MULT * 0.35, medRg * RANGE_MULT * 0.35, 1e-12) * s
  );
}

/**
 * 가로 줄선·존에 캔들 고저가가 근접한 봉 time → 금색/시안 펄스용 방향.
 * pre3 반짝과 병합 시 ChartView에서 pre3 맵이 우선.
 */
export function collectLineZoneProximitySparkle(
  overlays: OverlayItem[],
  candles: Candle[],
  proximitySensitivity = 1
): Map<number, 'LONG' | 'SHORT'> {
  const out = new Map<number, 'LONG' | 'SHORT'>();
  if (!candles.length || !overlays.length) return out;

  const vis = candles.length > 800 ? candles.slice(-800) : candles;
  const raw = overlays.length > MAX_OVERLAYS ? overlays.slice(-MAX_OVERLAYS) : overlays;
  const slice = raw.filter((o) => {
    const k = String(o.kind || '');
    return k !== 'label' && k !== 'swingLabel';
  });

  const atr = computeAtrSma(vis, Math.min(ATR_PERIOD, Math.max(1, vis.length - 1)));
  const medRg = medianRecentRange(vis, 36);
  const medianBarSec = estimateMedianBarSeconds(vis);

  for (const c of vis) {
    const L = c.low;
    const H = c.high;
    const ref = Math.max(Math.abs(c.close), Math.abs((L + H) / 2), 1e-9);
    const th = nearLineZoneThreshold(ref, atr, medRg, proximitySensitivity);

    let best: number | null = null;

    for (const o of slice) {
      const d = distanceCandleToOverlay(c, o, medianBarSec);
      if (d == null || !Number.isFinite(d)) continue;
      if (d <= th && (best === null || d < best)) {
        best = d;
        out.set(c.time as number, candleDir(c));
      }
    }
  }

  return out;
}

export function hasLineZoneProximitySparkle(m: Map<number, 'LONG' | 'SHORT'>): boolean {
  return m.size > 0;
}

/**
 * **마지막 봉**이 해당 오버레이(존·줄·핀 등) 가격에 근접하면 오버레이 id 집합 — HTML 라벨·가격띠 애니메이션용.
 */
export function collectOverlayIdsNearLastCandle(
  overlays: OverlayItem[],
  candles: Candle[],
  proximitySensitivity = 1
): Set<string> {
  const ids = new Set<string>();
  if (!candles.length || !overlays.length) return ids;
  const vis = candles.length > 800 ? candles.slice(-800) : candles;
  const last = vis[vis.length - 1];
  if (!last) return ids;
  const atr = computeAtrSma(vis, Math.min(ATR_PERIOD, Math.max(1, vis.length - 1)));
  const medRg = medianRecentRange(vis, 36);
  const medianBarSec = estimateMedianBarSeconds(vis);
  const L = last.low;
  const H = last.high;
  const ref = Math.max(Math.abs(last.close), Math.abs((L + H) / 2), 1e-9);
  const th = nearLineZoneThreshold(ref, atr, medRg, proximitySensitivity);
  const slice = overlays.length > MAX_OVERLAYS ? overlays.slice(-MAX_OVERLAYS) : overlays;

  for (const o of slice) {
    if (o.id == null || String(o.id).length === 0) continue;
    const d = distanceCandleToOverlay(last, o, medianBarSec);
    if (d != null && Number.isFinite(d) && d <= th) {
      ids.add(String(o.id));
    }
  }
  return ids;
}
