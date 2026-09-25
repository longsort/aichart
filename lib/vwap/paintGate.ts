/**
 * VWAP 차트 작도 게이트 — 모드 무관, 설정·데이터만 기준.
 * 기존 설정 키·핀·계산 엔진 유지. 확정 수익 문구 없음.
 */
export type VwapPaintSettings = {
  chartMergedDeskAnchoredVwapEnabled?: boolean;
  chartMergedDeskSessionVwapEnabled?: boolean;
  chartMergedDeskAvwapAutoExtremeEnabled?: boolean;
  chartMergedDeskAvwapPlaceArmed?: boolean;
  chartMergedDeskAvwapUserPinsHidden?: boolean;
  chartMergedDeskVwapPoiBandEnabled?: boolean;
  chartMergedDeskAvwapFibEnabled?: boolean;
};

/** AVWAP 피보·골든·헌팅 (기본 ON) */
export function vwapFibEnabled(s: VwapPaintSettings | null | undefined): boolean {
  return s?.chartMergedDeskAvwapFibEnabled !== false;
}

/** Anchored VWAP 마스터 (기본 ON) */
export function vwapMasterEnabled(s: VwapPaintSettings | null | undefined): boolean {
  return s?.chartMergedDeskAnchoredVwapEnabled !== false;
}

export function vwapSessionEnabled(s: VwapPaintSettings | null | undefined): boolean {
  return s?.chartMergedDeskSessionVwapEnabled === true;
}

export function vwapAutoExtremeEnabled(s: VwapPaintSettings | null | undefined): boolean {
  return s?.chartMergedDeskAvwapAutoExtremeEnabled === true;
}

export function vwapPlaceArmed(s: VwapPaintSettings | null | undefined): boolean {
  return s?.chartMergedDeskAvwapPlaceArmed === true;
}

export function vwapPoiBandEnabled(s: VwapPaintSettings | null | undefined): boolean {
  return s?.chartMergedDeskVwapPoiBandEnabled === true;
}

/** HTF·핀 캔들 로드 — 마스터 ON일 때 */
export function shouldLoadAvwapSupportingCandles(s: VwapPaintSettings | null | undefined): boolean {
  return vwapMasterEnabled(s);
}

/**
 * 차트에 VWAP 레이어를 그릴지 — **UI 모드 무관**.
 * 마스터 또는 세션 ON이면 작도.
 */
export function shouldPaintAvwapOnChart(s: VwapPaintSettings | null | undefined): boolean {
  return vwapMasterEnabled(s) || vwapSessionEnabled(s);
}
