/** 마감·안착 — 게이트·확정 시 차트 영역 펄스 (보드 ↔ 차트 연동) */
export const MONTH_DESK_CHART_PULSE_EVENT = 'month-desk-chart-pulse';

export type MonthDeskChartPulseDetail = {
  kind: 'gate' | 'confirm' | 'full' | 'invalid';
  gates?: number;
  symbol?: string;
  timeframe?: string;
};

export function dispatchMonthDeskChartPulse(detail: MonthDeskChartPulseDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MONTH_DESK_CHART_PULSE_EVENT, { detail }));
}
