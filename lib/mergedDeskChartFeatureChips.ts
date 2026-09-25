/**
 * 통합모드 — 차트 위 FVG / OB / CHoCH / BOS 칩 분류·필터.
 * 차트에 직접 ON/OFF (확정 승률 아님).
 */
import type { OverlayItem } from '@/types';

export type MergedDeskChartFeatureChipId = 'fvg' | 'ob' | 'choch' | 'bos';

export const MERGED_DESK_CHART_FEATURE_CHIPS: ReadonlyArray<{
  id: MergedDeskChartFeatureChipId;
  labelKo: string;
  hintKo: string;
}> = [
  { id: 'fvg', labelKo: 'FVG', hintKo: 'Fair Value Gap 존 ON/OFF' },
  { id: 'ob', labelKo: 'OB', hintKo: 'Order Block 존 ON/OFF' },
  { id: 'choch', labelKo: 'CHoCH', hintKo: '구조전환(CHoCH) ON/OFF' },
  { id: 'bos', labelKo: 'BOS', hintKo: '구조돌파(BOS) ON/OFF' },
];

export function classifyMergedDeskChartFeature(
  o: OverlayItem
): MergedDeskChartFeatureChipId | null {
  const id = String(o.id || '').toLowerCase();
  const kind = String(o.kind || '').toLowerCase();
  const label = String(o.label || '').toLowerCase();
  const cat = String(o.category || '').toLowerCase();
  const extra = String(o.overlayZoneExtraClass || '').toLowerCase();
  const blob = `${id} ${kind} ${label} ${cat} ${extra}`;

  if (
    kind === 'fvg' ||
    /\bfvg\b|-fvg-|mlsp-tv-fvg|vifvg|fair.?value/.test(blob)
  ) {
    return 'fvg';
  }
  if (
    kind === 'orderBlock' ||
    /\border.?block\b|\bob\b|orderblock|-ob-|mlsp-tv-ob|choch-ob|breaker/.test(blob)
  ) {
    return 'ob';
  }
  if (
    kind === 'choch' ||
    /\bchoch\b|c\.?ho.?c\.?h|구조전환|change.?of.?character/.test(blob)
  ) {
    return 'choch';
  }
  if (kind === 'bos' || /\bbos\b|구조돌파|break.?of.?structure/.test(blob)) {
    return 'bos';
  }
  return null;
}

export type MergedDeskChartFeatureFlags = {
  fvg: boolean;
  ob: boolean;
  choch: boolean;
  bos: boolean;
};

/** 칩 OFF면 해당 기능 오버레이만 제거 — 다른 레이어 유지 */
export function filterOverlaysByChartFeatureChips(
  overlays: OverlayItem[],
  flags: MergedDeskChartFeatureFlags
): OverlayItem[] {
  if (!overlays.length) return overlays;
  const allOn = flags.fvg && flags.ob && flags.choch && flags.bos;
  if (allOn) return overlays;
  return overlays.filter((o) => {
    const cls = classifyMergedDeskChartFeature(o);
    if (!cls) return true;
    return flags[cls] !== false;
  });
}
