/**
 * 통합분석 데스크 — AI 정밀 브리핑 enrichment (게이트·시나리오·HTF·엔진 융합).
 */
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import {
  computeMonthDeskPrecisionAnalysis,
  type MonthDeskGatePartial,
  type MonthDeskPrecisionSnapshot,
} from '@/lib/monthDeskPrecisionAnalysis';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedIntegratedHubSnapshot } from '@/lib/mergedAnalysisIntegratedHub';
import type { MergedIntegratedMtfTfRow } from '@/lib/mergedIntegratedMtfBoard';
import {
  buildUnifiedMtfAnalysisStatistics,
  type UnifiedMtfAnalysisStatistics,
} from '@/lib/unifiedMtfAnalysisStatistics';
import {
  buildConfirmHeadline,
  buildConflictModuleLabels,
  buildDeterministicBriefingNarrative,
  buildFlowContextKo,
  buildHtfLtfContext,
  buildPrecisionScenarios,
  buildStructurePathKo,
  type UnifiedPrecisionScenario,
} from '@/lib/unifiedPrecisionBriefingShared';
import {
  externalContextModules,
  mergeExternalIntoReasons,
  type UnifiedBriefingExternalContext,
} from '@/lib/unifiedBriefingExternalContext';
import {
  buildUnifiedAnalysisFusion,
  type UnifiedAnalysisFusion,
} from '@/lib/unifiedAnalysisFusion';
import { alignMtfStatisticsToUnifiedPlan } from '@/lib/alignMtfStatisticsToUnifiedPlan';
import { buildTemporalCompareDigest, type TemporalCompareDigest } from '@/lib/temporalCompareDigest';

export type MergedPrecisionEnrichment = {
  precision: MonthDeskPrecisionSnapshot | null;
  scenarios: UnifiedPrecisionScenario[];
  gatePartials: MonthDeskGatePartial[];
  htfContextKo: string | null;
  ltfContextKo: string | null;
  riskKo: string | null;
  confirmHeadlineKo: string;
  conflictModules: string[];
  deterministicNarrativeKo: string;
  invalidationKo: string | null;
  structurePathKo: string | null;
  flowKo: string | null;
  external: import('@/lib/unifiedBriefingExternalContext').UnifiedBriefingExternalContext | null;
  mtfStatistics: UnifiedMtfAnalysisStatistics | null;
  analysisFusion: UnifiedAnalysisFusion | null;
  temporalDigest: TemporalCompareDigest | null;
};

function levelsFromTradeAndAnalysis(
  analysis: AnalyzeResponse | null,
  trade: MergedTradeSignal | null | undefined
): MonthDeskCoreLevels {
  return {
    close: analysis?.currentPrice ?? null,
    support: analysis?.supportLevel?.price ?? null,
    resistance: analysis?.resistanceLevel?.price ?? null,
    invalidation: trade?.stopLoss ?? analysis?.invalidationLevel?.price ?? null,
    entryLow: trade?.entry ?? null,
    entryHigh: trade?.entry ?? null,
    entryMid: trade?.entry ?? analysis?.currentPrice ?? null,
    targets: [trade?.tp1, trade?.tp2, trade?.tp3].filter(
      (n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
    ),
  };
}

export function enrichMergedPrecisionBriefing(params: {
  snapshot: MergedIntegratedHubSnapshot;
  analysis: AnalyzeResponse | null | undefined;
  trade: MergedTradeSignal | null | undefined;
  judgment: MergedTradeJudgment | null | undefined;
  mtfBoard: MergedIntegratedMtfTfRow[];
  external?: UnifiedBriefingExternalContext | null;
}): MergedPrecisionEnrichment {
  const { snapshot: s, analysis, trade, judgment, mtfBoard } = params;
  const bm = s.consensus.boardMetrics;
  const levels = levelsFromTradeAndAnalysis(analysis ?? null, trade);

  const precision =
    analysis && bm
      ? computeMonthDeskPrecisionAnalysis(analysis, bm, levels, bm.structure)
      : null;

  const scenarios = buildPrecisionScenarios({
    analysis,
    trade,
    masterDirection: s.masterDirection,
  });

  const mtfRows = mtfBoard.map((r) => ({ tf: r.tf, direction: r.direction }));
  const { htfContextKo, ltfContextKo } = buildHtfLtfContext(mtfRows, s.masterDirection);

  const conflictModules = buildConflictModuleLabels(s.modules);
  const gatePartials = precision?.gatePartials ?? [];
  const flowKo = buildFlowContextKo(analysis ?? null);
  const structurePathKo = buildStructurePathKo(analysis ?? null);

  const confirmHeadlineKo = buildConfirmHeadline(
    s.consensus.gatesPassCount,
    s.gauges.gatesPct,
    s.consensus.mtfBlocked
  );

  const invalidationKo =
    trade?.invalidationKo ??
    judgment?.stanceKo ??
    analysis?.invalidation ??
    analysis?.invalidationLevel?.reason ??
    null;

  const riskKo = [
    invalidationKo,
    s.consensus.mtfBlocked ? 'MTF 상위 반대 — 확정 억제' : null,
    s.consensus.conflict ? 'TF 간 방향 충돌' : null,
    conflictModules.length ? `모듈 엇갈림 ${conflictModules.length}개` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const deterministicNarrativeKo = buildDeterministicBriefingNarrative({
    symbol: s.symbol,
    chartTf: s.chartTf,
    masterDirection: s.masterDirection,
    masterGrade: precision?.precisionGrade ?? s.masterGrade,
    syncPct: s.gauges.syncPct,
    gatesPct: s.gauges.gatesPct,
    actionLine: s.actionLine,
    htfContextKo,
    conflictModules,
    precisionGrade: precision?.precisionGrade ?? null,
    flowKo,
    structurePathKo,
  });

  const external = params.external ?? null;
  const extLine = [
    external?.news?.headlineKo,
    external?.whale?.headlineKo,
    external?.signalHistory?.compareKo,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    precision,
    scenarios,
    gatePartials,
    htfContextKo,
    ltfContextKo,
    riskKo: [riskKo, external?.news?.level === 'HIGH' ? '매크로 이벤트 임박' : null]
      .filter(Boolean)
      .join(' · ') || null,
    confirmHeadlineKo,
    conflictModules,
    deterministicNarrativeKo: extLine
      ? `${deterministicNarrativeKo} ${extLine}`.slice(0, 420)
      : deterministicNarrativeKo,
    invalidationKo,
    structurePathKo,
    flowKo,
    external,
    mtfStatistics: null,
    analysisFusion: null,
    temporalDigest: null,
  };
}

export type MergedIntegratedHubSnapshotFull = MergedIntegratedHubSnapshot & MergedPrecisionEnrichment;

export function buildMergedIntegratedHubSnapshotFull(params: {
  snapshot: MergedIntegratedHubSnapshot;
  analysis: AnalyzeResponse | null | undefined;
  trade: MergedTradeSignal | null | undefined;
  judgment: MergedTradeJudgment | null | undefined;
  mtfBoard: MergedIntegratedMtfTfRow[];
  external?: UnifiedBriefingExternalContext | null;
  mtfAnalyzes?: Array<{ tf: string; analyze: import('@/types').AnalyzeResponse | null }>;
}): MergedIntegratedHubSnapshotFull {
  const enrichment = enrichMergedPrecisionBriefing(params);
  const external = params.external ?? null;
  const extModules = externalContextModules(external, params.snapshot.masterDirection);
  const masterGrade = enrichment.precision?.precisionGrade ?? params.snapshot.masterGrade;
  const precisionFusion = enrichment.precision?.fusionScore ?? params.snapshot.gauges.precisionFusion;

  let mtfStatistics =
    params.mtfAnalyzes && params.mtfAnalyzes.length
      ? buildUnifiedMtfAnalysisStatistics({
          symbol: params.snapshot.symbol,
          chartTf: params.snapshot.chartTf,
          chartAnalysis: params.analysis ?? null,
          mtfAnalyzes: params.mtfAnalyzes,
          consensus: params.snapshot.consensus,
          trade: params.trade ?? null,
        })
      : null;

  if (mtfStatistics && params.snapshot.unifiedTradePlan.direction !== 'NEUTRAL') {
    mtfStatistics = alignMtfStatisticsToUnifiedPlan(mtfStatistics, params.snapshot.unifiedTradePlan);
  }

  const temporalDigest = params.analysis
    ? buildTemporalCompareDigest(params.analysis, {
        symbol: params.snapshot.symbol,
        timeframe: params.snapshot.chartTf,
      })
    : null;

  const statLine = mtfStatistics?.headlineKo;

  const analysisFusion = buildUnifiedAnalysisFusion({
    snapshot: params.snapshot,
    analysis: params.analysis ?? null,
    trade: params.trade ?? null,
    judgment: params.judgment ?? null,
    external,
    mtfStatistics,
    chartFeatures: params.snapshot.chartFeatures ?? null,
  });

  const scenarios = analysisFusion.enhancedScenarios;

  return {
    ...params.snapshot,
    ...enrichment,
    masterGrade,
    mtfStatistics,
    scenarios,
    analysisFusion,
    temporalDigest,
    modules: [...params.snapshot.modules, ...extModules],
    gauges: {
      ...params.snapshot.gauges,
      precisionFusion: Math.round(precisionFusion),
    },
    summaryKo: [
      params.snapshot.summaryKo,
      enrichment.confirmHeadlineKo,
      enrichment.htfContextKo,
      external?.news?.headlineKo,
      statLine,
      analysisFusion.headlineKo,
    ]
      .filter(Boolean)
      .join(' · '),
    reasonsKo: mergeExternalIntoReasons(
      [
        ...params.snapshot.reasonsKo,
        enrichment.structurePathKo,
        enrichment.flowKo,
        mtfStatistics?.headlineKo,
        analysisFusion.depthLabelKo,
        ...(enrichment.precision?.breakdownKo ?? []),
      ].filter(Boolean) as string[],
      external
    ),
    deterministicNarrativeKo: statLine
      ? `${enrichment.deterministicNarrativeKo} ${statLine}`.slice(0, 420)
      : enrichment.deterministicNarrativeKo,
  };
}
