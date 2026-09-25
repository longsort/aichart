/**
 * Eagle1 composed pipeline — structure → zone → risk → MainPlan → frozen path.
 */

import { detectStructureCausal, type Eagle1Bar, type StructureSnapshot } from './structureEngine';
import { detectZonesCausal, type ZoneEngineResult } from './zoneEngine';
import type { Eagle1Zone } from './zoneEngine';
import { buildRiskPlan, type Eagle1RiskPlan } from './riskEngine';
import { buildMainPlan, type Eagle1MainPlan } from './signalEngine';
import { buildEagle1ChartUx, type Eagle1ChartMode, type Eagle1ChartUx } from './chartUx';
import { evaluateMtfSequence, type MtfFrameInput, type MtfSequenceReport } from './mtfSequence';
import type { SetupOutcome } from './zoneExpectancy';
import { summarizeFamilies } from './zoneExpectancy';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';
import { computeMoneyPressure } from './moneyPressureBand';
import { freezeFromPlan, incrementalStatsFromSetupOutcomes, type Eagle1FrozenPrediction, type Eagle1SnapshotStats } from './predictionSnapshot';
import { advanceFrozenTrade, type FrozenTrade } from './tradeManage';
import { buildSmartPath, type Eagle1SmartPath } from './smartPath';
import { walkForwardBacktest, type Eagle1WalkForwardReport } from './walkForwardBacktest';
import { buildStatsDashboard, type Eagle1StatsDashboard } from './statsDashboard';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import { runStructureAcceptance, type StructureAcceptanceReport } from './structureAcceptanceEngine';
import { runFalseBreakEngine, type FalseBreakReport } from './falseBreakEngine';
import { runHistoricalStatistics, type HistoricalOutcomeReport } from './historicalStatisticsEngine';
import { runPremiumDiscount, type PremiumDiscountReport } from './premiumDiscountEngine';
import { buildUnifiedZoneDesk, type UnifiedZoneDesk } from './unifiedZoneDesk';

export type Eagle1PipelineInput = {
  candles: Eagle1Bar[];
  timeframe: string;
  htfBias?: string | null;
  htfStructure?: StructureSnapshot | null;
  mtfChain?: MtfFrameInput[] | null;
  qualityBlocked?: boolean;
  qualityCode?: string;
  repaintBlocked?: boolean;
  historicalSampleSize?: number;
  endExclusive?: number;
  chartMode?: Eagle1ChartMode;
  prevFrozenZones?: Eagle1Zone[];
  prevTrade?: FrozenTrade | null;
  outcomes?: SetupOutcome[];
  spreadBps?: number | null;
  depthOk?: boolean | null;
  moneyLive?: Eagle1MoneyPressureLive | null;
};

export type Eagle1PipelineResult = {
  structure: StructureSnapshot;
  zones: ZoneEngineResult;
  riskLong: Eagle1RiskPlan;
  riskShort: Eagle1RiskPlan;
  mainPlan: Eagle1MainPlan;
  chartUx: Eagle1ChartUx;
  mtf: MtfSequenceReport;
  trade: FrozenTrade | null;
  moneyPressure: Eagle1MoneyPressure;
  snapshot: Eagle1FrozenPrediction;
  snapshotStats: Eagle1SnapshotStats;
  smartPath: Eagle1SmartPath;
  walkForward: Eagle1WalkForwardReport;
  statsDashboard: Eagle1StatsDashboard;
  acceptance: StructureAcceptanceReport;
  falseBreak: FalseBreakReport;
  historicalOutcome: HistoricalOutcomeReport;
  premiumDiscount: PremiumDiscountReport;
  unifiedZones: UnifiedZoneDesk;
};

const TF_SEC: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '1h': 3600,
  '4H': 14400,
  '4h': 14400,
  '12H': 43200,
  '1D': 86400,
  '1d': 86400,
  '1W': 604800,
  '1M': 2592000,
};

export function runEagle1Pipeline(input: Eagle1PipelineInput): Eagle1PipelineResult {
  const end = input.endExclusive ?? input.candles.length;
  const causalOut = (input.outcomes ?? []).filter((r) => r.index < Math.max(0, end - 1)).sort((a, b) => a.index - b.index);
  const statSample = causalOut.length;
  const medianOf = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? null;
  };
  const maeStats =
    statSample >= EAGLE1_MIN_STAT_SAMPLE
      ? { medianMaeR: medianOf(causalOut.map((r) => r.mae)), medianMfeR: medianOf(causalOut.map((r) => r.mfe)), statSample }
      : { medianMaeR: null, medianMfeR: null, statSample };
  const structure = detectStructureCausal(input.candles, end);
  const zoneStats = summarizeFamilies(input.outcomes ?? []).map((f) => ({
    family: f.family,
    sampleSize: f.sampleSize,
    netExpectancy: f.netExpectancy,
    tpBeforeSlRate: f.tpBeforeSlRate,
  }));
  const zones = detectZonesCausal({
    candles: input.candles,
    timeframe: input.timeframe,
    structure,
    endExclusive: end,
    prevFrozen: input.prevFrozenZones,
    stats: zoneStats,
  });
  const exec = { spreadBps: input.spreadBps ?? null, depthOk: input.depthOk ?? null };
  const riskLong = buildRiskPlan({
    candles: input.candles,
    structure,
    zones,
    direction: 'LONG',
    endExclusive: end,
    ...exec,
    ...maeStats,
  });
  const riskShort = buildRiskPlan({
    candles: input.candles,
    structure,
    zones,
    direction: 'SHORT',
    endExclusive: end,
    ...exec,
    ...maeStats,
  });
  const mtf = evaluateMtfSequence({
    htf: input.htfStructure,
    ltf: structure,
    chain: input.mtfChain,
  });
  const prefix = input.candles.slice(0, end);
  const moneyPressure = computeMoneyPressure(prefix, input.moneyLive);
  let mainPlan = buildMainPlan({
    candles: input.candles,
    timeframe: input.timeframe,
    structure,
    zones,
    riskLong,
    riskShort,
    qualityBlocked: input.qualityBlocked,
    qualityCode: input.qualityCode,
    repaintBlocked: input.repaintBlocked,
    htfBias: input.htfBias,
    endExclusive: end,
    historicalSampleSize: input.historicalSampleSize,
    outcomes: input.outcomes,
    mtf,
    moneyPressure,
    spreadBps: input.spreadBps ?? null,
  });
  const last = input.candles[Math.min(input.candles.length, end) - 1];
  const confirm =
    mainPlan.status === 'CONFIRMED_LONG' || mainPlan.status === 'CONFIRMED_SHORT';
  const dir = mainPlan.direction;
  const trade =
    dir &&
    mainPlan.entryLow != null &&
    mainPlan.sl != null &&
    mainPlan.tp1 != null &&
    last
      ? advanceFrozenTrade({
          prev: input.prevTrade,
          candles: input.candles,
          endExclusive: end,
          candidate: {
            direction: dir,
            entry: (mainPlan.entryLow + (mainPlan.entryHigh ?? mainPlan.entryLow)) / 2,
            sl: mainPlan.sl,
            tp1: mainPlan.tp1,
            tp2: mainPlan.tp2,
            tp3: mainPlan.tp3,
            lastTime: last.time,
            tfSec: TF_SEC[input.timeframe] ?? 900,
            confirm,
          },
        })
      : input.prevTrade ?? null;
  mainPlan = { ...mainPlan, trade };
  const riskForPath = dir === 'SHORT' ? riskShort : riskLong;
  const historicalOutcome = runHistoricalStatistics({
    outcomes: causalOut,
    tfSec: TF_SEC[input.timeframe] ?? 900,
  });
  const smartPath = buildSmartPath({
    lastTime: last?.time ?? 0,
    tfSec: TF_SEC[input.timeframe] ?? 900,
    direction: dir,
    risk: riskForPath,
    trade,
    sampleSize: mainPlan.sampleSize,
    calibratedProbability: mainPlan.calibratedProbability,
    slFirstRate: mainPlan.stats?.slFirstRate ?? historicalOutcome.slBeforeTp,
    medianMfePct: historicalOutcome.medianMfePct,
    meanReactionSec: historicalOutcome.meanReactionSec,
  });
  mainPlan = {
    ...mainPlan,
    smartPath,
    expectedPath: `${smartPath.main.labelKo}: ${smartPath.main.note}`,
    altPath: `${smartPath.alt.labelKo}: ${smartPath.alt.note}`,
  };
  const rec = zones.recommended;
  const chartUx = buildEagle1ChartUx(mainPlan, input.chartMode ?? 'practical', trade, {
    poc: zones.profile.poc,
    vah: zones.profile.vah,
    val: zones.profile.val,
    clusterUpper: rec?.upper ?? null,
    clusterLower: rec?.lower ?? null,
    clusterBias: rec?.bias ?? null,
    clusterLabel: rec?.labelKo ?? null,
    eqh: structure.equalHighs.slice(-1)[0] ?? null,
    eql: structure.equalLows.slice(-1)[0] ?? null,
  });
  const snapshot = freezeFromPlan({
    candles: input.candles,
    endExclusive: end,
    timeframe: input.timeframe,
    mainPlan,
    poc: zones.profile.poc,
    zones: zones.zones.filter((z) => z.frozen && z.status !== 'DELETED'),
    features: {
      regime: structure.regime,
      structureState: structure.state,
      wyckoff: structure.wyckoff.label,
      pocState: zones.profile.pocState,
      reaction: zones.reaction.kind,
      moneyFlow: moneyPressure.state,
      agreement: mainPlan.agreementScore,
      ood: mainPlan.consensus?.ood.label ?? 'ok',
      aiScore: mainPlan.aiScore,
    },
  });
  const snapshotStats = incrementalStatsFromSetupOutcomes(input.outcomes ?? []);
  const walkForward = walkForwardBacktest(input.outcomes ?? []);
  const statsDashboard = buildStatsDashboard({
    similarity: mainPlan.stats,
    ml: mainPlan.ml,
    consensus: mainPlan.consensus,
    walkForward,
    snapshotStats,
    votes: mainPlan.consensus?.votes,
  });
  const acceptance = runStructureAcceptance({
    candles: input.candles,
    structure,
    endExclusive: end,
    pocState: zones.profile.pocState,
    money: moneyPressure,
    live: input.moneyLive,
    oiState: input.moneyLive?.oiState ?? null,
    sampleSize: mainPlan.sampleSize,
    calibratedProbability: mainPlan.calibratedProbability,
    mtfFrames: mtf.frames,
  });
  const falseBreak = runFalseBreakEngine({
    candles: input.candles,
    structure,
    endExclusive: end,
    pocState: zones.profile.pocState,
    money: moneyPressure,
  });
  const premiumDiscount = runPremiumDiscount({
    lastClose: last?.close ?? null,
    structure,
  });
  const unifiedZones = buildUnifiedZoneDesk({
    displaySupport: zones.displaySupport,
    displayResist: zones.displayResist,
    families: summarizeFamilies(causalOut),
    money: moneyPressure,
    oiState: input.moneyLive?.oiState ?? null,
    hasCvd: Boolean(input.moneyLive?.has_cvd || typeof input.moneyLive?.volumeDelta === 'number'),
    nextSupportTarget: zones.displaySupport[1]?.upper ?? zones.profile.poc,
    nextResistTarget: zones.displayResist[1]?.lower ?? zones.profile.poc,
  });
  return {
    structure,
    zones,
    riskLong,
    riskShort,
    mainPlan,
    chartUx,
    mtf,
    trade,
    moneyPressure,
    snapshot,
    snapshotStats,
    smartPath,
    walkForward,
    statsDashboard,
    acceptance,
    falseBreak,
    historicalOutcome,
    premiumDiscount,
    unifiedZones,
  };
}

export function mainPlanBlocksConfirmed(plan: Eagle1MainPlan | null | undefined): boolean {
  if (!plan) return false;
  return plan.status !== 'CONFIRMED_LONG' && plan.status !== 'CONFIRMED_SHORT';
}
