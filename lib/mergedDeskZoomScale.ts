/**
 * 통합·분석 라벨·로켓 줌 — 거래소 앱식(화면 픽셀 거의 고정, 확대 시 살짝만 커짐).
 * 선형 barSpacing 배율은 과대 확대되어 캔들을 가림 → 금지.
 */
export const MERGED_DESK_ZOOM_BAR_BASE = 8;

/** 봉간격 → 화면 스케일. 대략 0.82~1.18 (거래소 마커급) */
export function mergedDeskZoomScaleFromBarSpacing(
  barSpacing: number,
  baseSpacing: number = MERGED_DESK_ZOOM_BAR_BASE
): number {
  if (!(barSpacing > 0) || !Number.isFinite(barSpacing)) return 1;
  const base = baseSpacing > 0 ? baseSpacing : MERGED_DESK_ZOOM_BAR_BASE;
  const raw = barSpacing / base;
  /** 거듭제곱 <1 → 확대해도 천천히 커짐 */
  const soft = Math.pow(Math.max(0.25, Math.min(raw, 3.5)), 0.32);
  return Math.max(0.82, Math.min(1.18, soft));
}

/** 로켓만 더 타이트 — 확대해도 캔들 가림 최소화 */
export function mergedDeskRocketZoomScale(chartZoom: number): number {
  if (!(chartZoom > 0) || !Number.isFinite(chartZoom)) return 1;
  return Math.max(0.88, Math.min(1.12, chartZoom));
}

/** 라벨 글자용 — 로켓과 동일 상한이지만 하한 약간 여유 */
export function mergedDeskLabelZoomScale(chartZoom: number): number {
  if (!(chartZoom > 0) || !Number.isFinite(chartZoom)) return 1;
  return Math.max(0.85, Math.min(1.15, chartZoom));
}
