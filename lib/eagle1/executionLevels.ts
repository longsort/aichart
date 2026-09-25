/**
 * ExecutionLevels — Entry/Stop/Target 합성 뷰모델 (MAIN ENTRY 1개).
 * PHASE 10: 전폭 priceLines · TP는 유동성/POC/HTF 우선 (+% 단독 금지).
 */
import type { Eagle1RiskPlan } from './riskEngine';
import type { Eagle1MainPlan } from './signalEngine';
import { runEntryOptimizer, type EntryOptimizerReport } from './entryOptimizer';
import { runStopOptimizer, type StopOptimizerReport } from './stopOptimizer';
import { runTargetEngine, type TargetEngineReport, type TargetStructureAnchors } from './targetEngine';

export type ExecutionPracticalPriceLine = {
  price: number;
  title: string;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  role: 'ENTRY' | 'STOP' | 'TP1' | 'TP2' | 'TP3';
};

export type ExecutionLevelsReport = {
  entry: EntryOptimizerReport;
  stop: StopOptimizerReport;
  target: TargetEngineReport;
  summaryKo: string;
  /** 통합분석·차트 전폭 가격선 (createPriceLine / desk priceLines) */
  practicalPriceLines: ExecutionPracticalPriceLine[];
};

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

/** Acceptance: 가격좌표만 · 퍼센트 타깃 단독 금지 */
export function buildExecutionPracticalPriceLines(
  entry: EntryOptimizerReport,
  stop: StopOptimizerReport,
  target: TargetEngineReport
): ExecutionPracticalPriceLine[] {
  const lines: ExecutionPracticalPriceLine[] = [];
  if (entry.zone) {
    lines.push({
      price: entry.zone.mid,
      title: `진입 ${fmtPx(entry.zone.mid)}`,
      color: entry.allowEntry ? '#22c55e' : '#94a3b8',
      lineWidth: 2,
      lineStyle: 'dashed',
      role: 'ENTRY',
    });
  }
  if (stop.executableSl != null && Number.isFinite(stop.executableSl)) {
    lines.push({
      price: stop.executableSl,
      title: `손절 ${fmtPx(stop.executableSl)}`,
      color: '#f97316',
      lineWidth: 2,
      lineStyle: 'solid',
      role: 'STOP',
    });
  }
  const colors: Record<'TP1' | 'TP2' | 'TP3', string> = {
    TP1: '#4ade80',
    TP2: '#34d399',
    TP3: '#a3e635',
  };
  for (const lv of target.levels) {
    if (lv.price == null || !Number.isFinite(lv.price)) continue;
    if (/^[+\-]?\d+(\.\d+)?%$/.test(String(lv.reason || '').trim())) continue;
    lines.push({
      price: lv.price,
      title: `${lv.id} ${fmtPx(lv.price)}`,
      color: colors[lv.id],
      lineWidth: lv.id === 'TP1' ? 2 : 1,
      lineStyle: 'dotted',
      role: lv.id,
    });
  }
  return lines;
}

export function runExecutionLevels(params: {
  risk: Eagle1RiskPlan | null | undefined;
  plan?: Eagle1MainPlan | null;
  anchors?: TargetStructureAnchors | null;
}): ExecutionLevelsReport {
  const entry = runEntryOptimizer(params);
  const stop = runStopOptimizer({ risk: params.risk });
  const target = runTargetEngine({ risk: params.risk, anchors: params.anchors ?? null });
  const practicalPriceLines = buildExecutionPracticalPriceLines(entry, stop, target);
  const summaryKo = entry.zone
    ? `MAIN ENTRY ${entry.zone.low.toFixed(0)}~${entry.zone.high.toFixed(0)} · STOP ${
        stop.executableSl?.toFixed(0) ?? '데이터 없음'
      } · ${target.note}`
    : entry.note;
  return { entry, stop, target, summaryKo, practicalPriceLines };
}

/** Acceptance — 가격좌표 E/SL/TP · 퍼센트 단독 타깃 거부 */
export function executionLevelsAcceptancePriceCoords(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const risk = {
    direction: 'LONG' as const,
    candidateKind: 'poc_retest' as const,
    entryLow: 60000,
    entryHigh: 60200,
    structuralSl: 59500,
    executableSl: 59400,
    tp1: 61000,
    tp1Reason: '가까운 최다거래가격',
    tp2: 62000,
    tp2Reason: '위쪽 유동성/스윙고점',
    tp3: 63500,
    tp3Reason: '확장 목표(측정 이동)',
    grossRrTp1: 2.5,
    netRrTp1: 2.4,
    rrGate: 'confirm_candidate' as const,
    feesBps: 4,
    slippageBps: 1,
    fundingBps: 1,
    execution: 'ok' as const,
    sizeNote: '',
    sizeUnits: 1,
    sizeEquity: 10000,
    sizeRiskPct: 1,
    rejectReasons: [] as string[],
  };
  const rep = runExecutionLevels({ risk, plan: null });
  if (!rep.practicalPriceLines.some((l) => l.role === 'ENTRY')) notes.push('missing ENTRY');
  if (!rep.practicalPriceLines.some((l) => l.role === 'STOP')) notes.push('missing STOP');
  if (!rep.practicalPriceLines.some((l) => l.role === 'TP1')) notes.push('missing TP1');
  if (rep.practicalPriceLines.some((l) => /%/.test(l.title))) notes.push('percent title forbidden');
  const atrOnly = runTargetEngine({
    risk: { ...risk, tp1Reason: '+2%', tp1: 61200 },
    anchors: {
      direction: 'LONG',
      entryMid: 60100,
      poc: 61000,
      liqHigh: 62000,
      coreResistMid: 61500,
    },
  });
  if (atrOnly.levels[0]?.reason === '+2%') notes.push('should prefer structure over percent');
  return { ok: notes.length === 0, notes };
}
