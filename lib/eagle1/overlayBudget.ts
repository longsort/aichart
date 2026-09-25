/**
 * Phase 20 — Overlay budget by chart mode.
 * 계산은 전체 유지, 표시만 cap. Heat 캔들 가림 금지.
 */
import type { Eagle1ChartMode, Eagle1ChartUx } from './chartUx';

export type OverlayBudgetLimits = {
  maxPriceLines: number;
  maxZoneFaces: number;
  maxStructureMarks: number;
  maxPathSegments: number;
  heatOnCandleForbidden: true;
  note: string;
};

export const OVERLAY_BUDGET_BY_MODE: Record<Eagle1ChartMode, OverlayBudgetLimits> = {
  practical: {
    maxPriceLines: 12,
    maxZoneFaces: 4, // 지지2 + 저항2
    maxStructureMarks: 6,
    maxPathSegments: 3,
    heatOnCandleForbidden: true,
    note: '실전: E/SL/TP/POC/A+ 우선 · 존≤2+2',
  },
  analysis: {
    maxPriceLines: 22,
    maxZoneFaces: 8,
    maxStructureMarks: 14,
    maxPathSegments: 6,
    heatOnCandleForbidden: true,
    note: '분석: OB/FVG/유동성 추가 · 과밀 cap',
  },
  research: {
    maxPriceLines: 48,
    maxZoneFaces: 24,
    maxStructureMarks: 40,
    maxPathSegments: 12,
    heatOnCandleForbidden: true,
    note: '연구: 상한만 · 계산 전체',
  },
};

const PRICE_LINE_PRIORITY = [
  'MAIN ENTRY',
  'ENTRY',
  'STOP',
  'SL',
  'TP1',
  'TP2',
  'TP3',
  'POC',
  '최다거래',
  'A+',
  'SQUEEZE',
  'CASCADE',
  'LIQ',
  'HVN',
  'VAH',
  'VAL',
];

function lineRank(title: string): number {
  const t = String(title || '').toUpperCase();
  const i = PRICE_LINE_PRIORITY.findIndex((p) => t.includes(p.toUpperCase()));
  return i < 0 ? 80 : i;
}

export function applyPriceLineBudget<T extends { title?: string; price?: number }>(
  lines: T[],
  mode: Eagle1ChartMode = 'practical'
): T[] {
  const lim = OVERLAY_BUDGET_BY_MODE[mode] ?? OVERLAY_BUDGET_BY_MODE.practical;
  const sorted = [...lines].sort((a, b) => lineRank(String(a.title)) - lineRank(String(b.title)));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const line of sorted) {
    if (out.length >= lim.maxPriceLines) break;
    const key = `${line.title}:${line.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function applyOverlayBudgetToChartUx(
  ux: Eagle1ChartUx,
  mode: Eagle1ChartMode = 'practical'
): Eagle1ChartUx {
  return {
    ...ux,
    priceLines: applyPriceLineBudget(ux.priceLines ?? [], mode),
  };
}

export type OverlayBudgetReport = {
  mode: Eagle1ChartMode;
  limits: OverlayBudgetLimits;
  priceLineCount: number;
  withinBudget: boolean;
  summaryKo: string;
};

export function reportOverlayBudget(params: {
  mode?: Eagle1ChartMode;
  priceLineCount: number;
}): OverlayBudgetReport {
  const mode = params.mode ?? 'practical';
  const limits = OVERLAY_BUDGET_BY_MODE[mode];
  const withinBudget = params.priceLineCount <= limits.maxPriceLines;
  return {
    mode,
    limits,
    priceLineCount: params.priceLineCount,
    withinBudget,
    summaryKo: withinBudget
      ? `오버레이 예산 OK · ${params.priceLineCount}/${limits.maxPriceLines}`
      : `오버레이 초과 · ${params.priceLineCount}/${limits.maxPriceLines} · cap 적용 필요`,
  };
}
