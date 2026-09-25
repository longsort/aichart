/**
 * 통합분석 데스크 — 차트·패널·손익계산 단일 타점(E/SL/TP) 해석.
 * Strike primary + analysis 브리핑 + 구조 무효 레벨을 방향·기하 검증 후 정렬.
 */
import type { AnalyzeResponse } from '@/types';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import type { UnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';

export type UnifiedDeskTradePlan = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationKo: string;
  sourceKo: string;
  alignedWithChart: boolean;
  warningsKo: string[];
};

function parseNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseAnalysisLevels(analysis: AnalyzeResponse | null | undefined): Omit<UnifiedDeskTradePlan, 'sourceKo' | 'alignedWithChart' | 'warningsKo'> | null {
  if (!analysis) return null;
  const entry = parseNum(analysis.entry) ?? analysis.currentPrice ?? null;
  const stopLoss =
    parseNum(analysis.stopLoss) ??
    analysis.invalidationLevel?.price ??
    null;
  const targets = (analysis.targets ?? [])
    .map((t) => parseNum(t))
    .filter((n): n is number => n != null);
  if (!entry || !stopLoss) return null;

  const dir: 'LONG' | 'SHORT' | 'NEUTRAL' =
    analysis.verdict === 'LONG' || analysis.verdict === 'SHORT'
      ? analysis.verdict
      : stopLoss < entry
        ? 'LONG'
        : stopLoss > entry
          ? 'SHORT'
          : 'NEUTRAL';

  return {
    direction: dir,
    entry,
    stopLoss,
    tp1: targets[0] ?? 0,
    tp2: targets[1] ?? 0,
    tp3: targets[2] ?? 0,
    invalidationKo:
      analysis.invalidationLevel?.reason ??
      analysis.invalidation ??
      `SL ${stopLoss} 이탈 시 재검토`,
  };
}

function fromStrike(
  trade: MergedTradeSignal,
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
): Omit<UnifiedDeskTradePlan, 'sourceKo' | 'alignedWithChart' | 'warningsKo'> | null {
  const leg =
    direction === 'LONG'
      ? trade.longLeg ?? (trade.primary === 'LONG' ? trade.primaryLeg : null)
      : direction === 'SHORT'
        ? trade.shortLeg ?? (trade.primary === 'SHORT' ? trade.primaryLeg : null)
        : trade.primaryLeg ?? trade.longLeg ?? trade.shortLeg;

  if (!leg) {
    if (trade.entry <= 0 || trade.stopLoss <= 0) return null;
    return {
      direction: trade.primary,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      tp1: trade.tp1,
      tp2: trade.tp2,
      tp3: trade.tp3,
      invalidationKo: trade.invalidationKo,
    };
  }

  return {
    direction: leg.side,
    entry: leg.entry,
    stopLoss: leg.stopLoss,
    tp1: leg.tp1,
    tp2: leg.tp2,
    tp3: leg.tp3,
    invalidationKo: `${leg.side === 'LONG' ? '롱' : '숏'} SL ${leg.stopLoss.toFixed(2)} 이탈 시 무효`,
  };
}

function validateGeometry(
  plan: Pick<UnifiedDeskTradePlan, 'direction' | 'entry' | 'stopLoss' | 'tp1'>,
  direction: 'LONG' | 'SHORT'
): boolean {
  if (plan.entry <= 0 || plan.stopLoss <= 0) return false;
  if (direction === 'LONG') {
    if (!(plan.stopLoss < plan.entry)) return false;
    if (plan.tp1 > 0 && plan.tp1 <= plan.entry) return false;
    return true;
  }
  if (direction === 'SHORT') {
    if (!(plan.stopLoss > plan.entry)) return false;
    if (plan.tp1 > 0 && plan.tp1 >= plan.entry) return false;
    return true;
  }
  return false;
}

/** 롱: 더 가까운 SL(큰 값). 숏: 더 가까운 SL(작은 값). */
function mergeTighterSl(
  strikeSl: number,
  analysisSl: number,
  direction: 'LONG' | 'SHORT'
): number {
  if (direction === 'LONG') return Math.max(strikeSl, analysisSl);
  return Math.min(strikeSl, analysisSl);
}

function applyChartFeatureHints(
  plan: Omit<UnifiedDeskTradePlan, 'sourceKo' | 'alignedWithChart' | 'warningsKo'>,
  direction: 'LONG' | 'SHORT',
  chartFeatures: UnifiedChartFeatureContext | null | undefined,
  warningsKo: string[]
): Omit<UnifiedDeskTradePlan, 'sourceKo' | 'alignedWithChart' | 'warningsKo'> {
  if (!chartFeatures?.tradeHints) return plan;
  const hints = chartFeatures.tradeHints;
  let { entry, stopLoss, tp1, tp2, tp3, invalidationKo } = plan;

  if (hints.slHint != null && stopLoss > 0) {
    stopLoss = mergeTighterSl(stopLoss, hints.slHint, direction);
  } else if (hints.slHint != null && stopLoss <= 0) {
    stopLoss = hints.slHint;
  }

  if (hints.entryHint != null && entry > 0) {
    const gap = (Math.abs(entry - hints.entryHint) / entry) * 100;
    if (gap < 0.85) entry = hints.entryHint;
  } else if (hints.entryHint != null && entry <= 0) {
    entry = hints.entryHint;
  }

  const tps = hints.tpHints.filter((t) => t > 0);
  if (tp1 <= 0 && tps[0]) tp1 = tps[0];
  if (tp2 <= 0 && tps[1]) tp2 = tps[1];
  if (tp3 <= 0 && tps[2]) tp3 = tps[2];

  if (hints.invalidationKo && !invalidationKo.includes('FVG') && !invalidationKo.includes('ZONE')) {
    invalidationKo = `${invalidationKo} · ${hints.invalidationKo}`.slice(0, 120);
  }

  if (hints.slHint != null && plan.stopLoss > 0 && Math.abs(plan.stopLoss - stopLoss) > plan.entry * 0.0005) {
    warningsKo.push('차트 zone/FVG 구조 SL 반영');
  }

  return { ...plan, direction, entry, stopLoss, tp1, tp2, tp3, invalidationKo };
}

export function resolveUnifiedDeskTradePlan(params: {
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  trade: MergedTradeSignal | null | undefined;
  analysis: AnalyzeResponse | null | undefined;
  judgment: MergedTradeJudgment | null | undefined;
  currentPrice?: number | null;
  chartFeatures?: UnifiedChartFeatureContext | null;
}): UnifiedDeskTradePlan {
  const warningsKo: string[] = [];
  const direction: 'LONG' | 'SHORT' | 'NEUTRAL' =
    params.masterDirection !== 'NEUTRAL'
      ? params.masterDirection
      : params.trade?.primary && params.trade.primary !== 'NEUTRAL'
        ? params.trade.primary
        : params.analysis?.verdict === 'LONG' || params.analysis?.verdict === 'SHORT'
          ? params.analysis.verdict
          : params.judgment?.direction && params.judgment.direction !== 'NEUTRAL'
            ? params.judgment.direction
            : 'NEUTRAL';

  const strikeRaw = params.trade ? fromStrike(params.trade, direction) : null;
  const analysisRaw = parseAnalysisLevels(params.analysis);

  const confirmed =
    params.analysis?.confirmedSignal?.confirmed === true &&
    params.analysis.confirmedSignal.direction === direction;

  if (direction === 'NEUTRAL') {
    const fallback = strikeRaw ?? analysisRaw;
    return {
      direction: 'NEUTRAL',
      entry: fallback?.entry ?? params.currentPrice ?? 0,
      stopLoss: fallback?.stopLoss ?? 0,
      tp1: fallback?.tp1 ?? 0,
      tp2: fallback?.tp2 ?? 0,
      tp3: fallback?.tp3 ?? 0,
      invalidationKo: fallback?.invalidationKo ?? '방향 관망 — 타점 참고만',
      sourceKo: '관망 · Strike/분석 혼합',
      alignedWithChart: false,
      warningsKo: ['마스터 방향 관망 — 진입·손절은 조건부 참고'],
    };
  }

  const strikeOk = strikeRaw && validateGeometry(strikeRaw, direction);
  const analysisOk = analysisRaw && analysisRaw.direction === direction && validateGeometry(analysisRaw, direction);

  const chartSuffix = params.chartFeatures?.compositeScore
    ? ` · 차트 ${params.chartFeatures.compositeScore}pt`
    : '';

  if (confirmed && analysisOk && analysisRaw) {
    const merged = applyChartFeatureHints({ ...analysisRaw, direction }, direction, params.chartFeatures, warningsKo);
    return {
      ...merged,
      sourceKo: `AI 분석 확정 · zone·FVG·line${chartSuffix}`,
      alignedWithChart: true,
      warningsKo,
    };
  }

  if (strikeOk && analysisOk && strikeRaw && analysisRaw) {
    const sl = mergeTighterSl(strikeRaw.stopLoss, analysisRaw.stopLoss, direction);
    const slGapPct = (Math.abs(strikeRaw.stopLoss - analysisRaw.stopLoss) / strikeRaw.entry) * 100;
    if (slGapPct > 0.35) {
      warningsKo.push(
        `Strike SL ${strikeRaw.stopLoss.toFixed(1)} ↔ 분석 SL ${analysisRaw.stopLoss.toFixed(1)} — 구조 SL 우선`
      );
    }
    const base = applyChartFeatureHints(
      {
        direction,
        entry: strikeRaw.entry,
        stopLoss: sl,
        tp1: strikeRaw.tp1 > 0 ? strikeRaw.tp1 : analysisRaw.tp1,
        tp2: strikeRaw.tp2 > 0 ? strikeRaw.tp2 : analysisRaw.tp2,
        tp3: strikeRaw.tp3 > 0 ? strikeRaw.tp3 : analysisRaw.tp3,
        invalidationKo: `${direction === 'LONG' ? '롱' : '숏'} SL ${sl.toFixed(2)} 이탈 시 무효 · Strike E + 분석 SL`,
      },
      direction,
      params.chartFeatures,
      warningsKo
    );
    return {
      ...base,
      sourceKo: `Strike E · 분석·zone·FVG SL${chartSuffix}`,
      alignedWithChart: true,
      warningsKo,
    };
  }

  if (strikeOk && strikeRaw) {
    const merged = applyChartFeatureHints({ ...strikeRaw, direction }, direction, params.chartFeatures, warningsKo);
    return {
      ...merged,
      sourceKo: `Strike · zone·line·밴드${chartSuffix}`,
      alignedWithChart: true,
      warningsKo,
    };
  }

  if (analysisOk && analysisRaw) {
    const merged = applyChartFeatureHints({ ...analysisRaw, direction }, direction, params.chartFeatures, warningsKo);
    return {
      ...merged,
      sourceKo: `AI 분석 · zone·FVG·추세${chartSuffix}`,
      alignedWithChart: true,
      warningsKo,
    };
  }

  if (strikeRaw) {
    warningsKo.push('Strike 타점 기하 검증 실패 — 값은 참고용');
    return {
      ...strikeRaw,
      direction,
      sourceKo: 'Strike (검증 경고)',
      alignedWithChart: false,
      warningsKo,
    };
  }

  if (analysisRaw) {
    warningsKo.push('분석 타점 기하 검증 실패 — 값은 참고용');
    return {
      ...analysisRaw,
      direction,
      sourceKo: 'AI 분석 (검증 경고)',
      alignedWithChart: false,
      warningsKo,
    };
  }

  const px = params.currentPrice ?? 0;
  return {
    direction,
    entry: px,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    invalidationKo: '타점 계산 대기',
    sourceKo: '—',
    alignedWithChart: false,
    warningsKo: ['진입·손절 데이터 없음'],
  };
}
