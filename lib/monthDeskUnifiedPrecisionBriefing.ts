/**
 * 마감·안착 — 핵심보드·Strike·마감안착·트레이드 통합 AI 정밀 브리핑 스냅샷.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MonthDeskPrecisionSnapshot } from '@/lib/monthDeskPrecisionAnalysis';
import type { MonthDeskConfirmDisplay } from '@/lib/monthDeskConfirmDisplay';
import type { MonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import type { MonthDeskSettleBoardStats } from '@/lib/monthDeskSettleBoardStats';
import type { MergedIntegratedMtfTfRow } from '@/lib/mergedIntegratedMtfBoard';
import { buildMergedIntegratedMtfBoard, mergeMtfAnalyzesWithChart } from '@/lib/mergedIntegratedMtfBoard';
import { buildMergedMtfConsensus } from '@/lib/mergedAnalysisMtfConsensus';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import type { MonthDeskGatePartial } from '@/lib/monthDeskPrecisionAnalysis';
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
  buildUnifiedMtfAnalysisStatistics,
  type UnifiedMtfAnalysisStatistics,
} from '@/lib/unifiedMtfAnalysisStatistics';
import {
  externalContextModules,
  mergeExternalIntoReasons,
  type UnifiedBriefingExternalContext,
} from '@/lib/unifiedBriefingExternalContext';

export type MonthDeskUnifiedModuleSnap = {
  key: string;
  labelKo: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  detailKo: string;
  live: boolean;
  aligned: boolean;
};

export type MonthDeskUnifiedBriefingGauges = {
  longPct: number;
  shortPct: number;
  confidence: number;
  gatesPct: number;
  rr: number | null;
  precisionFusion: number;
  syncPct: number;
};

export type MonthDeskUnifiedBriefingSnapshot = {
  symbol: string;
  chartTf: string;
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  masterGrade: string;
  gauges: MonthDeskUnifiedBriefingGauges;
  modules: MonthDeskUnifiedModuleSnap[];
  headlineKo: string;
  summaryKo: string;
  actionLine: string;
  confirmHeadlineKo: string;
  tradeLevels: {
    entry: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
  };
  mtfBoard: MergedIntegratedMtfTfRow[];
  reasonsKo: string[];
  precision: MonthDeskPrecisionSnapshot | null;
  scenarios: UnifiedPrecisionScenario[];
  gatePartials: MonthDeskGatePartial[];
  htfContextKo: string | null;
  ltfContextKo: string | null;
  riskKo: string | null;
  conflictModules: string[];
  deterministicNarrativeKo: string;
  flowKo: string | null;
  structurePathKo: string | null;
  external: import('@/lib/unifiedBriefingExternalContext').UnifiedBriefingExternalContext | null;
  mtfStatistics: UnifiedMtfAnalysisStatistics | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normDir(v: string | null | undefined): 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT' {
  const u = String(v ?? '').toUpperCase();
  if (u === 'LONG') return 'LONG';
  if (u === 'SHORT') return 'SHORT';
  if (u === 'WAIT' || u === '') return 'WAIT';
  return 'NEUTRAL';
}

function masterFromVotes(
  votes: Array<{ dir: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT'; weight: number }>
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  let long = 0;
  let short = 0;
  for (const v of votes) {
    if (v.dir === 'WAIT') continue;
    if (v.dir === 'LONG') long += v.weight;
    else if (v.dir === 'SHORT') short += v.weight;
    else {
      long += v.weight * 0.12;
      short += v.weight * 0.12;
    }
  }
  if (long > short + 0.75) return 'LONG';
  if (short > long + 0.75) return 'SHORT';
  return 'NEUTRAL';
}

export function buildMonthDeskUnifiedBriefingSnapshot(params: {
  symbol: string;
  chartTf: string;
  analysis: AnalyzeResponse | null;
  metrics: MonthDeskBoardMetrics;
  levels: MonthDeskCoreLevels;
  strikeBundle: MonthDeskStrikeDeskBundle | null;
  settleBoard: TfCloseSettleBoard | null | undefined;
  settleStats: MonthDeskSettleBoardStats | null | undefined;
  tradeAction: MonthDeskTradeAction;
  confirmDisplay: MonthDeskConfirmDisplay;
  precision: MonthDeskPrecisionSnapshot | null;
  mtfAnalyzes: Array<{ tf: string; analyze: AnalyzeResponse | null }>;
  actionLine: string;
}): MonthDeskUnifiedBriefingSnapshot {
  const m = params.metrics;
  const mergedMtf = mergeMtfAnalyzesWithChart(params.chartTf, params.analysis, params.mtfAnalyzes);
  const consensus = buildMergedMtfConsensus({
    chartTf: params.chartTf,
    analysis: params.analysis,
    candles: null,
    settleBoard: params.settleBoard ?? null,
    mtfAnalyzes: mergedMtf,
    trade: null,
    judgment: null,
  });
  const mtfBoard = buildMergedIntegratedMtfBoard({
    chartTf: params.chartTf,
    chartAnalysis: params.analysis,
    consensus,
    mtfAnalyzes: mergedMtf,
  });

  const coreDir = normDir(m.verdict);
  const strikeDir = normDir(params.strikeBundle?.primary);
  const tradeDir = normDir(m.verdict);
  const settleDir =
    params.settleStats && params.settleStats.edgeCounts.long > params.settleStats.edgeCounts.short
      ? 'LONG'
      : params.settleStats && params.settleStats.edgeCounts.short > params.settleStats.edgeCounts.long
        ? 'SHORT'
        : 'NEUTRAL';

  const masterDirection = masterFromVotes([
    { dir: coreDir, weight: 3 },
    { dir: strikeDir, weight: 2.5 },
    { dir: tradeDir, weight: 2.2 },
    { dir: settleDir, weight: 2 },
    { dir: consensus.finalDirection, weight: 2.8 },
  ]);

  const precisionFusion = params.precision?.fusionScore ?? m.confidence ?? 50;
  const longPct = clamp(
    Math.round(
      m.longPct * 0.28 +
        consensus.longPct * 0.22 +
        (masterDirection === 'LONG' ? 58 : 42) * 0.2 +
        precisionFusion * 0.15
    ),
    8,
    92
  );
  const shortPct = 100 - longPct;
  const gatesPct = Math.round(((m.gatesPassCount ?? 0) / 5) * 100);
  const rr = params.levels.entryMid && params.levels.invalidation && params.levels.targets[0]
    ? Math.abs(params.levels.targets[0] - params.levels.entryMid) /
      Math.max(Math.abs(params.levels.entryMid - params.levels.invalidation), 1e-9)
    : null;

  const modules: MonthDeskUnifiedModuleSnap[] = [
    {
      key: 'core',
      labelKo: '핵심보드',
      direction: coreDir,
      detailKo: `${m.verdictLabel} · ${m.confidence ?? 0}%`,
      live: true,
      aligned: coreDir === masterDirection || masterDirection === 'NEUTRAL' || coreDir === 'WAIT',
    },
    {
      key: 'strike',
      labelKo: 'Strike',
      direction: strikeDir,
      detailKo: params.strikeBundle?.primaryKo?.slice(0, 28) ?? '—',
      live: !!params.strikeBundle,
      aligned: strikeDir === 'WAIT' || strikeDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'settle',
      labelKo: '마감·안착',
      direction: settleDir,
      detailKo: params.settleStats?.summaryLines?.[0]?.slice(0, 32) ?? '마감표',
      live: !!(params.settleBoard?.rows?.length),
      aligned: settleDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'trade',
      labelKo: '트레이드',
      direction: tradeDir,
      detailKo: params.tradeAction.actionKo?.slice(0, 28) ?? params.tradeAction.status,
      live: !!params.analysis,
      aligned: tradeDir === 'WAIT' || tradeDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'precision',
      labelKo: 'AI 정밀',
      direction: params.precision
        ? normDir(m.verdict)
        : 'WAIT',
      detailKo: params.precision
        ? `등급 ${params.precision.precisionGrade} · ${params.precision.fusionLabel}`
        : '—',
      live: !!params.precision,
      aligned: true,
    },
  ];

  const liveModules = modules.filter((mod) => mod.live);
  const syncPct = liveModules.length
    ? Math.round((liveModules.filter((mod) => mod.aligned).length / liveModules.length) * 100)
    : 0;

  const masterGrade =
    params.precision?.precisionGrade ??
    (consensus.grade !== '—' ? consensus.grade : syncPct >= 75 ? 'B' : syncPct >= 50 ? 'C' : '—');

  const headlineKo =
    masterDirection === 'LONG'
      ? `통합 AI 정밀 · 롱 (연동 ${syncPct}%)`
      : masterDirection === 'SHORT'
        ? `통합 AI 정밀 · 숏 (연동 ${syncPct}%)`
        : `통합 AI 정밀 · 관망 (연동 ${syncPct}%)`;

  const summaryKo = [
    headlineKo,
    params.confirmDisplay.headlineKo,
    `L ${longPct}% / S ${shortPct}% · 신뢰 ${m.confidence ?? 0}% · 확정 ${m.gatesPassCount ?? 0}/5`,
    params.settleStats?.summaryLines?.[0],
  ]
    .filter(Boolean)
    .join(' · ');

  const reasonsKo = [
    m.verdictReasonKo,
    params.confirmDisplay.badgeKo,
    params.tradeAction.actionKo,
    params.precision?.breakdownKo?.[0],
    consensus.reasonsKo[0],
  ].filter(Boolean) as string[];

  const entry = params.levels.entryMid ?? params.analysis?.currentPrice ?? 0;
  const sl = params.levels.invalidation ?? 0;

  const scenarios = buildPrecisionScenarios({
    analysis: params.analysis,
    trade: {
      primary: m.verdict,
      entry,
      stopLoss: sl,
      tp1: params.levels.targets[0] ?? 0,
      tp2: params.levels.targets[1] ?? 0,
      tp3: params.levels.targets[2] ?? 0,
      invalidationKo: params.tradeAction.invalidKo ?? '',
    } as import('@/lib/mergedAnalysisTradeLayer').MergedTradeSignal,
    masterDirection,
  });

  const mtfRows = mtfBoard.map((r) => ({ tf: r.tf, direction: r.direction }));
  const { htfContextKo, ltfContextKo } = buildHtfLtfContext(mtfRows, masterDirection);
  const conflictModules = buildConflictModuleLabels(modules);
  const gatePartials = params.precision?.gatePartials ?? [];
  const flowKo = buildFlowContextKo(params.analysis);
  const structurePathKo = buildStructurePathKo(params.analysis);
  const riskKo = [
    params.tradeAction.invalidKo,
    consensus.mtfBlocked ? 'MTF 상위 반대' : null,
    conflictModules.length ? `엇갈림 ${conflictModules.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const deterministicNarrativeKo = buildDeterministicBriefingNarrative({
    symbol: params.symbol,
    chartTf: params.chartTf,
    masterDirection,
    masterGrade,
    syncPct,
    gatesPct,
    actionLine: params.actionLine,
    htfContextKo,
    conflictModules,
    precisionGrade: params.precision?.precisionGrade ?? null,
    flowKo,
    structurePathKo,
  });

  const mtfStatistics = buildUnifiedMtfAnalysisStatistics({
    symbol: params.symbol,
    chartTf: params.chartTf,
    chartAnalysis: params.analysis,
    mtfAnalyzes: mergedMtf,
    consensus,
    trade: null,
  });

  return {
    symbol: params.symbol,
    chartTf: params.chartTf,
    masterDirection,
    masterGrade,
    gauges: {
      longPct,
      shortPct,
      confidence: m.confidence ?? consensus.confidence,
      gatesPct,
      rr: rr != null ? Math.round(rr * 100) / 100 : null,
      precisionFusion: Math.round(precisionFusion),
      syncPct,
    },
    modules,
    headlineKo,
    summaryKo,
    actionLine: params.actionLine,
    confirmHeadlineKo: params.confirmDisplay.headlineKo,
    tradeLevels: {
      entry,
      stopLoss: sl,
      tp1: params.levels.targets[0] ?? 0,
      tp2: params.levels.targets[1] ?? 0,
      tp3: params.levels.targets[2] ?? 0,
    },
    mtfBoard,
    reasonsKo: [...new Set(reasonsKo)].slice(0, 8),
    precision: params.precision,
    scenarios,
    gatePartials,
    htfContextKo,
    ltfContextKo,
    riskKo: riskKo || null,
    conflictModules,
    deterministicNarrativeKo,
    flowKo,
    structurePathKo,
    external: null,
    mtfStatistics,
  };
}

export function applyExternalToMonthDeskBriefing(
  snap: MonthDeskUnifiedBriefingSnapshot,
  external: UnifiedBriefingExternalContext | null | undefined
): MonthDeskUnifiedBriefingSnapshot {
  if (!external) return snap;
  const extModules = externalContextModules(external, snap.masterDirection);
  return {
    ...snap,
    external,
    modules: [...snap.modules, ...extModules],
    summaryKo: [snap.summaryKo, external.news?.headlineKo, snap.mtfStatistics?.headlineKo]
      .filter(Boolean)
      .join(' · '),
    reasonsKo: mergeExternalIntoReasons(snap.reasonsKo, external),
    deterministicNarrativeKo: [
      snap.deterministicNarrativeKo,
      external.whale?.headlineKo,
      external.signalHistory?.compareKo,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 420),
    riskKo: [snap.riskKo, external.news?.level === 'HIGH' ? '매크로 이벤트 임박' : null]
      .filter(Boolean)
      .join(' · ') || null,
  };
}
