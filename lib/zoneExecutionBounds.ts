import type { OverlayItem } from '@/types';

/** ChartView `mapOverlays` 존 종류와 동기 */
const ZONE_KINDS_FOR_EXEC = new Set<OverlayItem['kind']>([
  'zone',
  'fvg',
  'ob',
  'supplyZone',
  'demandZone',
  'bprZone',
  'reactionZone',
]);

export type ZoneExecBound = { id: string; low: number; high: number };

const DEFAULT_MAX = 40;

/**
 * 앵커된 오버레이에서 USDM 체결 집계용 가격 구간을 뽑는다. id 중복은 첫 항만 유지.
 */
export function extractZoneExecutionBoundsFromOverlays(
  overlays: OverlayItem[],
  max = DEFAULT_MAX
): ZoneExecBound[] {
  const seen = new Set<string>();
  const out: ZoneExecBound[] = [];
  for (const o of overlays) {
    if (!ZONE_KINDS_FOR_EXEC.has(o.kind)) continue;
    const p1 = o.price1;
    const p2 = o.price2;
    if (typeof p1 !== 'number' || typeof p2 !== 'number' || !Number.isFinite(p1) || !Number.isFinite(p2)) {
      continue;
    }
    const low = Math.min(p1, p2);
    const high = Math.max(p1, p2);
    if (high - low < 1e-12) continue;
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id, low, high });
    if (out.length >= max) break;
  }
  return out;
}
