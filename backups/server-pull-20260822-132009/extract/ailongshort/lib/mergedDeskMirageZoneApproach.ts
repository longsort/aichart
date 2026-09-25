/**
 * Mirage zone — 현재가 접근(2% 이내) 시 차트 면 하이라이트 (클릭 없이).
 */
import type { OverlayItem } from '@/types';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';
import type { MirageZoneIntelRequestZone } from '@/lib/mergedDeskMirageZoneExchangeIntel';

export const MIRAGE_ZONE_APPROACH_PCT = 0.02;

export type MirageZoneApproachTarget = {
  zoneId: string;
  distancePct: number;
  near: boolean;
};

export function findMirageZoneApproachTarget(
  zones: MirageZoneIntelRequestZone[],
  currentPrice: number | null | undefined
): MirageZoneApproachTarget | null {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0 || !zones.length) {
    return null;
  }
  let best: MirageZoneApproachTarget | null = null;
  for (const z of zones) {
    const center = Number(z.center);
    if (!Number.isFinite(center) || center <= 0) continue;
    const inBand = currentPrice >= z.bot && currentPrice <= z.top;
    const distPct = Math.abs(currentPrice - center) / center;
    const near = inBand || distPct <= MIRAGE_ZONE_APPROACH_PCT;
    if (!near) continue;
    const hit: MirageZoneApproachTarget = {
      zoneId: z.id,
      distancePct: distPct,
      near: true,
    };
    if (!best || hit.distancePct < best.distancePct) best = hit;
  }
  return best;
}

export function applyMirageZoneApproachHighlight(
  overlays: OverlayItem[],
  approach: MirageZoneApproachTarget | null,
  selectedZoneId?: string | null
): OverlayItem[] {
  if (!approach?.near && !selectedZoneId) return overlays;
  return overlays.map((raw) => {
    if (!isMergedDeskMirageTvZoneOverlay(raw) || String(raw.kind) !== 'zone') return raw;
    const id = String(raw.id || '');
    const isSelected = selectedZoneId != null && id === selectedZoneId;
    const isApproach = approach?.near && id === approach.zoneId;
    if (!isSelected && !isApproach) {
      const extra = String(raw.overlayZoneExtraClass || '')
        .trim()
        .split(/\s+/)
        .filter((c) => c && c !== 'merged-ares-mlsp-tv-zone-approach' && c !== 'merged-ares-mlsp-tv-zone-selected');
      if (extra.length === String(raw.overlayZoneExtraClass || '').trim().split(/\s+/).filter(Boolean).length) {
        return raw;
      }
      return { ...raw, overlayZoneExtraClass: extra.join(' ') };
    }
    const extra = String(raw.overlayZoneExtraClass || '')
      .trim()
      .split(/\s+/)
      .filter(
        (c) =>
          c &&
          c !== 'merged-ares-mlsp-tv-zone-approach' &&
          c !== 'merged-ares-mlsp-tv-zone-selected'
      );
    if (isApproach) extra.push('merged-ares-mlsp-tv-zone-approach');
    if (isSelected) extra.push('merged-ares-mlsp-tv-zone-selected');
    return { ...raw, overlayZoneExtraClass: extra.join(' ') };
  });
}
