import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts';

/** lightweight-charts `setData` — time/value null·시리즈 범위 밖·teardown 레이스 방어 */
export function safeHorizLineSeriesSetData(
  api: ISeriesApi<'Line'> | null | undefined,
  t0: UTCTimestamp,
  tN: UTCTimestamp,
  value: number
): boolean {
  if (!api || !Number.isFinite(value)) return false;
  const a = Number(t0);
  const b = Number(tN);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const lo = (Math.min(a, b) as UTCTimestamp);
  const hi = (Math.max(a, b) as UTCTimestamp);
  try {
    if (lo === hi) {
      api.setData([{ time: lo, value }]);
    } else {
      api.setData([
        { time: lo, value },
        { time: hi, value },
      ]);
    }
    return true;
  } catch {
    return false;
  }
}

/** SeriesMarkers — time null·NaN·시리즈에 없는 봉 → fillSizeAndY ensureNotNull 크래시 방지 */
export function sanitizeSeriesMarkersForLwc<T extends { time?: unknown }>(
  rows: T[] | null | undefined,
  candleTimes?: Iterable<number> | null
): T[] {
  if (!rows?.length) return [];
  let allow: Set<number> | null = null;
  if (candleTimes) {
    allow = new Set<number>();
    for (const raw of candleTimes) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) allow.add(n);
    }
    if (!allow.size) allow = null;
  }
  const out: T[] = [];
  for (const r of rows) {
    if (!r || r.time == null) continue;
    const t = Number(r.time as number);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (allow && !allow.has(t)) continue;
    out.push(r);
  }
  return out;
}

export function safeSeriesSetMarkers(
  api: { setMarkers: (m: unknown[]) => void } | null | undefined,
  markers: unknown[] | null | undefined
): void {
  if (!api) return;
  try {
    api.setMarkers(Array.isArray(markers) ? markers : []);
  } catch {
    try {
      api.setMarkers([]);
    } catch {
      /* teardown */
    }
  }
}
