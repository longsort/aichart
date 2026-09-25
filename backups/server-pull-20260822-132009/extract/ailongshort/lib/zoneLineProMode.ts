import type { UIMode } from '@/lib/settings';

/** 개선 존·라인 전용 모드 (LinReg + CP + HotZone + Strike) */
export function isZoneLineProMode(uiMode: UIMode | string | undefined): boolean {
  return uiMode === 'ZONE_LINE_PRO';
}

/** 마감·안착 계열 — 동일 차트 파이프라인·보드 */
export function isMonthDeskChartMode(uiMode: UIMode | string | undefined): boolean {
  return uiMode === 'MONTH_START_DESK' || uiMode === 'ZONE_LINE_PRO';
}

export const ZONE_LINE_PRO_MODE_LABEL = '존·라인';
