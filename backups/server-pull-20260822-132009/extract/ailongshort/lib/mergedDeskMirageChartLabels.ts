/**
 * 통합·분석 — 우측에 세로로 쌓이는 구조·무효·추세선 HTML 라벨만 숨김.
 * Mirage zone 면 라벨(오더블럭·거절% 등)은 유지.
 */
import type { OverlayItem } from '@/types';
import {
  isMergedAnalysisDeskOverlayId,
  mergedAnalysisDeskOverlayExtraClass,
  isMergedDeskMirageTvTrendOverlay,
  isMergedDeskMirageTvZoneOverlay,
} from '@/lib/mergedAnalysisOverlayIds';

/** zone 면 라벨 — HQ/HotZone만. 보조·구조 핀은 숨김 */
export function isMergedDeskMirageRightBandLabelHidden(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const kind = String(item.kind || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);

  if (extra.includes('merged-desk-zone-face-minimal') || extra.includes('merged-desk-zone-pro-soft')) {
    /** label-on / 반등·돈구간은 face-minimal·pro-soft여도 라인 라벨 허용 */
    if (
      !(
        extra.includes('merged-desk-zone-label-on') ||
        extra.includes('merged-desk-zone-label-solo') ||
        extra.includes('merged-desk-zone-pro-hero') ||
        extra.includes('merged-desk-rb-rail-bounce') ||
        extra.includes('merged-desk-money-zone-keep') ||
        extra.includes('merged-desk-hotzone') ||
        extra.includes('merged-desk-rb-pullback') ||
        extra.includes('merged-hq-entry-zone')
      )
    ) {
      return true;
    }
  }

  /** $$$$ 핵심 타점 · 추세선 1본 · HQ / HotZone · AI 세력ZONE · zone 라인라벨 면 캡션 허용 */
  if (
    extra.includes('merged-desk-zone-label-on') ||
    extra.includes('merged-desk-money-zone-keep') ||
    extra.includes('merged-desk-trendline-keep') ||
    extra.includes('merged-hq-entry-zone') ||
    extra.includes('merged-desk-zone-pro-hero') ||
    extra.includes('merged-desk-ai-force-zone') ||
    extra.includes('merged-desk-asset-auto-zone') ||
    extra.includes('merged-desk-rb-rail-bounce') ||
    extra.includes('merged-desk-rb-pullback') ||
    extra.includes('merged-desk-hotzone') ||
    id.startsWith('merged-desk-ai-buy-') ||
    id.startsWith('merged-desk-ai-sell-') ||
    id.startsWith('merged-desk-ai-defense-') ||
    id.startsWith('merged-desk-asset-') ||
    (extra.includes('merged-desk-hotzone-entry') &&
      (extra.includes('--primary') ||
        String((item as { label?: string }).label || '').includes('★') ||
        String((item as { label?: string }).label || '').includes('$$$$')))
  ) {
    return false;
  }

  if (isMergedDeskMirageTvZoneOverlay(item)) {
    /** 보조 Mirage 면 캡션 숨김 */
    if (
      id.includes('-liq-band-') ||
      id.includes('-struct-band-') ||
      id.includes('-dir-verdict') ||
      id.includes('-fvg') ||
      id.includes('-consolidation') ||
      id.includes('-ob-') ||
      id.includes('-resist') ||
      id.includes('-support')
    ) {
      return true;
    }
    return false;
  }

  if (id.startsWith('merged-ares-mlsp-tv-inval-')) return true;
  if (isMergedDeskMirageTvTrendOverlay(item)) return true;
  if (id.startsWith('merged-ares-mlsp-tv-struct-')) return true;
  if (kind === 'bos' || kind === 'choch') return true;
  if (id.startsWith('merged-ares-mlsp-tv-target-')) return true;
  if (id.startsWith('merged-smc-choch-level-label-')) return true;
  if (id.startsWith('merged-smc-choch-level-') && kind === 'keyLevel') return true;
  if (extra.includes('merged-ares-smc-choch-label')) return true;
  if (
    extra.includes('merged-ares-mlsp-pin-right') &&
    isMergedAnalysisDeskOverlayId(id) &&
    !extra.includes('merged-ares-mlsp-tv-zone-caption')
  ) {
    return true;
  }

  return false;
}

/** @deprecated — isMergedDeskMirageRightBandLabelHidden 사용 */
export function isMergedDeskMirageChartLabelHidden(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  return isMergedDeskMirageRightBandLabelHidden(item);
}
