import type { UIMode } from '@/lib/settings';
import { isDeskPulseLinkedMode } from '@/lib/analysisModeLinkBus';

/** 통합·분석 — 차트 캔들분석 + 카드분석 ARES/TV식 한 화면 */
export const MERGED_ANALYSIS_DESK_MODE_LABEL = '통합·분석';

/**
 * 통합·분석 차트·칩·작도 파이프.
 * 타점엔진도 동일 차트·기능을 쓰되, 모드칩 선택은 각자(EAGLE1_TAP_ENGINE vs MERGED_ANALYSIS_DESK).
 */
export function isMergedAnalysisDeskMode(uiMode: UIMode | string | undefined): boolean {
  return uiMode === 'MERGED_ANALYSIS_DESK' || uiMode === 'EAGLE1_TAP_ENGINE';
}

/**
 * Strike·펄스·밴드·E/SL/TP 라인 공유 파이프.
 * 통합·분석 / 마감·안착 / 존라인 / AI존 / 고래 — AI 앱 모드 연동.
 */
export function isDeskPulseChartMode(uiMode: UIMode | string | undefined): boolean {
  return isDeskPulseLinkedMode(uiMode);
}

export function isDeskUnifiedPulseChartMode(uiMode: UIMode | string | undefined): boolean {
  if (isMergedAnalysisDeskMode(uiMode)) return true;
  if (uiMode === 'ZONE_LINE_PRO') return false;
  return uiMode === 'MONTH_START_DESK' || uiMode === 'AI_ZONE' || uiMode === 'WHALE';
}
