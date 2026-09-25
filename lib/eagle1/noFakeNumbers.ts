/**
 * UI는 확률을 만들지 않는다. 표본·소스 없는 숫자는 표시하지 않는다.
 */
import { isMergedAnalysisDeskMode } from '@/lib/mergedAnalysisDeskMode';
import type { Eagle1ChartMode } from '@/lib/eagle1/chartUx';

export const EAGLE1_MIN_STAT_SAMPLE = 30;

export function formatMissingStat(kind: 'none' | 'short' | 'low'): string {
  if (kind === 'none') return '데이터 없음';
  if (kind === 'short') return '통계 부족';
  return '신뢰도 낮음';
}

/** n<30 또는 값 없음 — % 를 만들지 않고 표본 수만 붙인다. */
export function formatSamplePct(sampleCount: number, value: number | null | undefined): string {
  const n = sampleCount ?? 0;
  if (n <= 0) return formatMissingStat('none');
  if (n < EAGLE1_MIN_STAT_SAMPLE || value == null || !Number.isFinite(value)) {
    return `통계 부족 (n=${n})`;
  }
  return `${Math.round(value * 100)}%`;
}

export function historicalStatLabel(opts: {
  sampleCount: number | null | undefined;
  valuePct: number | null | undefined;
  quality?: 'ok' | 'warning' | 'fail' | 'lookahead';
}): string {
  const n = opts.sampleCount ?? 0;
  if (n <= 0) return formatMissingStat('none');
  if (n < EAGLE1_MIN_STAT_SAMPLE) return formatMissingStat('short');
  if (opts.quality === 'lookahead' || opts.quality === 'fail') return formatMissingStat('low');
  if (opts.valuePct == null || !Number.isFinite(opts.valuePct)) return formatMissingStat('none');
  return `${opts.valuePct.toFixed(1)}%`;
}

/** 차트 compact: `POC ↑ 통계부족` — 표본 없으면 %를 만들지 않는다. */
export function formatCompactZoneLabel(opts: {
  type: string;
  bias: 'up' | 'down' | 'neutral';
  sampleCount: number | null | undefined;
  medianPct?: number | null;
  holdPct?: number | null;
}): string {
  const n = opts.sampleCount ?? 0;
  const arrow = opts.bias === 'up' ? '↑' : opts.bias === 'down' ? '↓' : '·';
  if (n < EAGLE1_MIN_STAT_SAMPLE) {
    return `${opts.type} ${arrow} ${formatMissingStat('short')}`;
  }
  const rx = historicalStatLabel({
    sampleCount: n,
    valuePct: opts.medianPct ?? null,
  });
  const holdOk = opts.holdPct != null && Number.isFinite(opts.holdPct);
  if (rx === '데이터 없음' || rx === '통계 부족' || rx === '신뢰도 낮음') {
    return `${opts.type} ${arrow} ${rx}`;
  }
  return holdOk ? `${opts.type} ${arrow} ${rx} · ${Math.round(opts.holdPct!)}%` : `${opts.type} ${arrow} ${rx}`;
}

/**
 * 같은 창 lookahead 확률 게이지.
 * 통합모드 실전/분석: 숨김. 연구모드만 표시(신뢰도 낮음).
 */
export function shouldShowFeatureProbabilityGauge(opts: {
  uiMode: string | undefined;
  eagle1ChartMode: Eagle1ChartMode;
  hasRows: boolean;
}): boolean {
  if (!opts.hasRows) return false;
  if (isMergedAnalysisDeskMode(opts.uiMode)) {
    return opts.eagle1ChartMode === 'research';
  }
  return true;
}
