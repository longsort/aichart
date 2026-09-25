'use client';

import { useEffect } from 'react';
import { MONTH_DESK_CHART_PULSE_EVENT, type MonthDeskChartPulseDetail } from '@/lib/monthDeskChartPulse';

/** 마감·안착 모드 — 게이트 펄스 시 차트/보드 wrap 하이라이트 */
export default function MonthDeskChartPulseBridge() {
  useEffect(() => {
    const onPulse = (e: Event) => {
      const detail = (e as CustomEvent<MonthDeskChartPulseDetail>).detail;
      const cls =
        detail.kind === 'full'
          ? 'chart-wrap--md-pulse-full'
          : detail.kind === 'confirm'
            ? 'chart-wrap--md-pulse-confirm'
            : detail.kind === 'invalid'
              ? 'chart-wrap--md-pulse-invalid'
              : 'chart-wrap--md-pulse-gate';
      const nodes = document.querySelectorAll(
        '.chart-wrap--month-desk-board, .tv-frame, .chart-wrap'
      );
      nodes.forEach((el) => {
        el.classList.remove(
          'chart-wrap--md-pulse-gate',
          'chart-wrap--md-pulse-confirm',
          'chart-wrap--md-pulse-full',
          'chart-wrap--md-pulse-invalid'
        );
        el.classList.add(cls);
      });
      window.setTimeout(() => {
        nodes.forEach((el) => el.classList.remove(cls));
      }, detail.kind === 'full' ? 900 : 650);
    };
    window.addEventListener(MONTH_DESK_CHART_PULSE_EVENT, onPulse);
    return () => window.removeEventListener(MONTH_DESK_CHART_PULSE_EVENT, onPulse);
  }, []);
  return null;
}
