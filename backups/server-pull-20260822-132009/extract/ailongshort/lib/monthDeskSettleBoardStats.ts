import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import { mtfRowBiasScore } from '@/lib/monthDeskBoardMetrics';
import type { TfCloseSettleBoard, TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import { TF_CLOSE_SETTLE_ORDER } from '@/lib/tfCloseSettleAssessment';

export type MonthDeskTfSettleRowStat = {
  tf: string;
  tfKo: string;
  formingScore: number;
  formingVerdict: string;
  confirmedEdge: string;
  bias: number;
  /** 0–100 게이지용 */
  scorePct: number;
  isChartTf: boolean;
};

export type MonthDeskSettleBoardStats = {
  tfRows: MonthDeskTfSettleRowStat[];
  formingCounts: { 안착: number; 불안: number; 실패: number; 관망: number };
  edgeCounts: { long: number; short: number; neutral: number };
  /** MTF 평균 formingScore → 0–100 (참고 강도, 승률 아님) */
  settleStrength: number;
  settleStrengthLabel: string;
  /** MTF 정렬 0–100 */
  mtfAlignPct: number;
  mtfAlignLabel: string;
  alignedTfCount: number;
  mtfConflict: boolean;
  chartTfRow: MonthDeskTfSettleRowStat | null;
  /** 차트 TF formingScore → 0–100 */
  chartTfFormingPct: number;
  /** 최근 봉 envelope 검증 (가장 긴 윈도) */
  validation: {
    bars: number;
    ok: number;
    fail: number;
    nervous: number;
    okPct: number;
    failPct: number;
    nervousPct: number;
  } | null;
  validationWindows: Array<{
    bars: number;
    ok: number;
    fail: number;
    nervous: number;
    okPct: number;
  }>;
  sparklineScores: number[];
  summaryLines: string[];
};

function normalizeFormingScore(score: number): number {
  const clamped = Math.max(-2, Math.min(2, score));
  return Math.round(((clamped + 2) / 4) * 100);
}

function chartTfMatches(rowTf: string, chartTf: string): boolean {
  const c = chartTf.trim();
  if (!c) return false;
  if (rowTf === c) return true;
  if (c === '15m' || c === '30m') return rowTf === '1h';
  if (c === '2h' || c === '6h' || c === '8h' || c === '12h') return rowTf === '4h';
  if (c === '3d') return rowTf === '1d';
  return false;
}

export function buildMonthDeskSettleBoardStats(params: {
  board: TfCloseSettleBoard | null;
  metrics: MonthDeskBoardMetrics;
  chartVerdictValidation: MonthDeskVerdictValidationSummary | null;
  timeframe: string;
}): MonthDeskSettleBoardStats | null {
  const { board, metrics, chartVerdictValidation, timeframe } = params;
  if (!board?.rows?.length) return null;

  const formingCounts = { 안착: 0, 불안: 0, 실패: 0, 관망: 0 };
  const edgeCounts = { long: 0, short: 0, neutral: 0 };
  const tfRows: MonthDeskTfSettleRowStat[] = [];
  let scoreSum = 0;

  const ordered = TF_CLOSE_SETTLE_ORDER.map((tf) => board.rows.find((r) => r.tf === tf)).filter(
    (r): r is TfCloseSettleRow => !!r
  );

  for (const row of ordered) {
    formingCounts[row.formingVerdict] = (formingCounts[row.formingVerdict] ?? 0) + 1;
    if (row.confirmedEdge === '롱 유리') edgeCounts.long += 1;
    else if (row.confirmedEdge === '숏 유리') edgeCounts.short += 1;
    else edgeCounts.neutral += 1;

    const bias = mtfRowBiasScore(row.confirmedEdge, row.formingVerdict);
    scoreSum += row.formingScore;
    tfRows.push({
      tf: row.tf,
      tfKo: row.tfKo,
      formingScore: row.formingScore,
      formingVerdict: row.formingVerdict,
      confirmedEdge: row.confirmedEdge,
      bias,
      scorePct: normalizeFormingScore(row.formingScore),
      isChartTf: chartTfMatches(row.tf, timeframe),
    });
  }

  const avgScore = ordered.length ? scoreSum / ordered.length : 0;
  const settleStrength = normalizeFormingScore(avgScore);
  let settleStrengthLabel = '혼조';
  if (settleStrength >= 72) settleStrengthLabel = '안착 우세';
  else if (settleStrength >= 58) settleStrengthLabel = '상방 기울';
  else if (settleStrength <= 28) settleStrengthLabel = '실패 우세';
  else if (settleStrength <= 42) settleStrengthLabel = '하방 기울';

  const boost = metrics.mtfBoost;
  const alignedTfCount = boost?.alignedTfCount ?? 0;
  const mtfAlignPct = Math.round((alignedTfCount / 5) * 100);
  const mtfConflict = !!boost?.conflict;
  const mtfAlignLabel = mtfConflict
    ? 'TF 충돌'
    : alignedTfCount >= 4
      ? '강한 정렬'
      : alignedTfCount >= 3
        ? '부분 정렬'
        : '분산';

  const chartTfRow = tfRows.find((r) => r.isChartTf) ?? null;
  const chartTfFormingPct = chartTfRow?.scorePct ?? settleStrength;

  const validationWindows =
    chartVerdictValidation?.windows.map((w) => {
      const total = Math.max(1, w.ok + w.fail + w.nervous);
      return { ...w, okPct: Math.round((w.ok / total) * 100) };
    }) ?? [];

  const primary = validationWindows.length ? validationWindows[validationWindows.length - 1]! : null;
  const validation = primary
    ? {
        bars: primary.bars,
        ok: primary.ok,
        fail: primary.fail,
        nervous: primary.nervous,
        okPct: primary.okPct,
        failPct: Math.round((primary.fail / Math.max(1, primary.ok + primary.fail + primary.nervous)) * 100),
        nervousPct: Math.round(
          (primary.nervous / Math.max(1, primary.ok + primary.fail + primary.nervous)) * 100
        ),
      }
    : null;

  const sparklineScores = tfRows.map((r) => r.scorePct);
  const summaryLines: string[] = [];
  if (boost?.lineupKo) summaryLines.push(boost.lineupKo);
  if (boost?.summaryKo) summaryLines.push(boost.summaryKo);
  summaryLines.push(
    `MTF 안착 ${formingCounts.안착} · 불안 ${formingCounts.불안} · 실패 ${formingCounts.실패}`
  );
  if (validation) {
    summaryLines.push(
      `최근 ${validation.bars}봉 envelope(참고): 안착 ${validation.okPct}% · 실패 ${validation.failPct}%`
    );
  }

  return {
    tfRows,
    formingCounts,
    edgeCounts,
    settleStrength,
    settleStrengthLabel,
    mtfAlignPct,
    mtfAlignLabel,
    alignedTfCount,
    mtfConflict,
    chartTfRow,
    chartTfFormingPct,
    validation,
    validationWindows,
    sparklineScores,
    summaryLines,
  };
}
