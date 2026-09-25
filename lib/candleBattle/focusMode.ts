/**
 * 캔들전투 ON — 참고 이미지형 포커스. 기존 기능은 OFF 시 그대로.
 * 삭제 아님: 필터만 (전투 레이어 + 전투 E/SL/TP).
 */
import type { OverlayItem } from '@/types';
import { isMergedDeskCandleBattleOverlay } from '@/lib/mergedAnalysisOverlayIds';
import type { AtlasPulseMarker, AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { isMergedDeskCandleBattleMarker } from '@/lib/mergedAnalysisOverlayIds';

export function isCandleBattleFocusPriceLine(pl: { title?: string } | null | undefined): boolean {
  const t = String(pl?.title || '');
  return (
    /이전 저점|이전 고점|LONG E|SHORT E|^SL$|^TP[123]$|무효/.test(t) ||
    t.includes('🔥')
  );
}

export function filterOverlaysForCandleBattleFocus(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => isMergedDeskCandleBattleOverlay(o));
}

export function filterMarkersForCandleBattleFocus(
  markers: AtlasPulseMarker[]
): AtlasPulseMarker[] {
  return markers.filter((m) => isMergedDeskCandleBattleMarker(m));
}

export function filterPriceLinesForCandleBattleFocus(
  lines: AtlasPulsePriceLine[]
): AtlasPulsePriceLine[] {
  return lines.filter((pl) => isCandleBattleFocusPriceLine(pl));
}
