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
