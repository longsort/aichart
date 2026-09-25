/**
 * 통합·분석 UI — 글자 스트립/카드 HUD 끄고, 캔들·zone·선 작도 중심.
 * 사용자: 글자 기능 불필요 → 차트 캔들 작도. AI 앱 전 모드 연동도 ZONE/LINE 우선.
 */
export const MERGED_DESK_CHART_DRAWING_ONLY = true;

/** 하단 스트립·배너·스윙 카드 숨김 */
export function mergedDeskHideTextStrips(): boolean {
  return MERGED_DESK_CHART_DRAWING_ONLY;
}

/** 플로팅 HUD 숨김 */
export function mergedDeskHideFloatingTextHud(): boolean {
  return MERGED_DESK_CHART_DRAWING_ONLY;
}

/** 폰 전체화면 하단 글자 상황바 숨김 — 캔들·선만 */
export function mergedDeskHideMobileSituationBar(): boolean {
  return MERGED_DESK_CHART_DRAWING_ONLY;
}

/** PC·폰 동일 — 차트 HTML 라벨(존·E/SL/TP·핀)을 폰에서 숨기지 않음. */
export function mergedDeskHideMobileChartHtmlLabels(): boolean {
  return false;
}

/** 스윙 채널·추세선 전 TF 작도 */
export function mergedDeskAlwaysDrawSwingChannel(): boolean {
  return true;
}

/** 레일 라벨을 E/SL/TP 짧은 기호만 */
export function mergedDeskShortTradeRailLabels(): boolean {
  return MERGED_DESK_CHART_DRAWING_ONLY;
}
