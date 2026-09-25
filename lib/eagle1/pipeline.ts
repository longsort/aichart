/**
 * Eagle1 composed pipeline — structure → zone → risk → MainPlan → frozen path.
 */

import { detectStructureCausal, lastSweepLiquidity, type Eagle1Bar, type StructureSnapshot } from './structureEngine';
import { detectZonesCausal, type ZoneEngineResult } from './zoneEngine';
import type { Eagle1Zone } from './zoneEngine';
import { buildRiskPlan, type Eagle1RiskPlan } from './riskEngine';
import { buildMainPlan, type Eagle1MainPlan } from './signalEngine';
import { buildEagle1ChartUx, appendSmartZoneSqueezePriceLines, type Eagle1ChartMode, type Eagle1ChartUx } from './chartUx';
import { evaluateMtfSequence, mtfFrameView, type MtfFrameInput, type MtfSequenceReport } from './mtfSequence';
import type { SetupOutcome } from './zoneExpectancy';
import { summarizeFamilies } from './zoneExpectancy';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';
import { computeMoneyPressure } from './moneyPressureBand';
import { freezeFromPlan, incrementalStatsFromSetupOutcomes, type Eagle1FrozenPrediction, type Eagle1SnapshotStats } from './predictionSnapshot';
import { advanceFrozenTrade, type FrozenTrade } from './tradeManage';
import type { Eagle1SmartPath } from './smartPath';
import { runSmartFuturePathEngine, type SmartFuturePathReport } from './smartFuturePathEngine';
import { runHistoricalPathGate, type HistoricalPathGate } from './historicalPathGate';
import { runOrderFlowFacade, type OrderFlowReport } from './orderFlowFacade';
import { type Eagle1WalkForwardReport } from './walkForwardBacktest';
import { buildStatsDashboard, type Eagle1StatsDashboard } from './statsDashboard';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import { runStructureAcceptance, type StructureAcceptanceReport } from './structureAcceptanceEngine';
import { runFalseBreakEngine, type FalseBreakReport } from './falseBreakEngine';
import { runHistoricalStatistics, type HistoricalOutcomeReport } from './historicalStatisticsEngine';
import { runPremiumDiscount, type PremiumDiscountReport } from './premiumDiscountEngine';
import { buildUnifiedZoneDesk, type UnifiedZoneDesk } from './unifiedZoneDesk';
import { buildEagle1HudPack, type Eagle1HudPack } from './hudPack';
import { runCombinationEngine, applyCombinationZonePromotion, type CombinationReport } from './combinationEngine';
import { runSqueezeRadarEngine, type SqueezeRadarReport } from './squeezeRadarEngine';
import { runMtfSmartZoneEngine, type MtfSmartZoneReport } from './mtfSmartZoneEngine';
import { runLiqZoneEngine, type LiqZoneReport } from './liqZoneEngine';
import { runReEntryEngine, type ReEntryReport } from './reEntryEngine';
import { runLegendaryStrategyFusion, type LegendaryFusionReport } from './legendaryStrategyFusion';
import { runTradeOpportunityEngine, type TradeOpportunityReport } from './tradeOpportunityEngine';
import { runExecutionLevels, type ExecutionLevelsReport } from './executionLevels';
import type { TargetStructureAnchors } from './targetEngine';
import { runContinuationEngine, type ContinuationReport } from './continuationEngine';
import { runCombinationMiningEngine, type CombinationMiningReport } from './combinationMiningEngine';
import { runScoreCalibrationView, type ScoreCalibrationReport } from './scoreCalibrationView';
import { runPositionSizeEngine, type PositionSizeReport } from './positionSizeEngine';
import { runHtfHistoricalStatus, type HtfHistoricalStatus } from './htfHistoricalStatus';
import { runPositionManagementEngine, type PositionManagementReport } from './positionManagementEngine';
import { runCandleEvidenceEngine, type CandleEvidenceReport } from './candleEvidenceEngine';
import {
  runProfileLevelsEngine,
  profileLevelsToPriceLines,
  type ProfileLevelsReport,
} from './profileLevelsEngine';
import { runCostAwareWalkForward, type CostAwareWalkForwardReport } from './costAwareWalkForward';
import { runLiquidityDefenseEngine, type LiquidityDefenseReport } from './liquidityDefenseEngine';
import { heatUnderlayReport, type HeatUnderlayPolicy } from './heatUnderlayPolicy';
import { applyOverlayBudgetToChartUx, reportOverlayBudget, type OverlayBudgetReport } from './overlayBudget';
import { runVisualLayoutSelftest, type VisualSelftestResult } from './visualLayoutContract';
import { runCoreZoneFusionEngine, type CoreZoneFusionReport } from './coreZoneFusionEngine';
import { runStrategyEnginePack, type StrategyEnginePack } from './strategyEngines';
import { runStrategyZoneFusionEngine, type StrategyZoneFusionReport } from './strategyZoneFusionEngine';
import { runFlowConfirmationEngine, type FlowConfirmationReport } from './flowConfirmationEngine';
import { runConfluenceEngine, type ConfluenceReport } from './confluenceEngine';
import { runCalibrationGate, type CalibrationGateReport } from './calibrationGate';

export type Eagle1PipelineInput = {
  candles: Eagle1Bar[];
  timeframe: string;
  symbol?: string;
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
  clockCandles15m?: Eagle1Bar[] | null;
  compassChain?: MtfFrameInput[] | null;
  coverage?: Array<{ tf: string; rows: number; gaps: number; firstIso: string | null; lastIso: string | null }> | null;
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
  hud: Eagle1HudPack;
  combination: CombinationReport;
  squeezeRadar: SqueezeRadarReport;
  mtfSmartZone: MtfSmartZoneReport;
  liqZones: LiqZoneReport;
  reEntry: ReEntryReport;
  legendaryFusion: LegendaryFusionReport;
  tradeOpportunity: TradeOpportunityReport;
  executionLevels: ExecutionLevelsReport;
  continuation: ContinuationReport;
  combinationMining: CombinationMiningReport;
  scoreCalibration: ScoreCalibrationReport;
  positionSize: PositionSizeReport;
  htfHistorical: HtfHistoricalStatus;
  smartFuturePath: SmartFuturePathReport;
  historicalPathGate: HistoricalPathGate;
  orderFlow: OrderFlowReport;
  positionManagement: PositionManagementReport;
  candleEvidence: CandleEvidenceReport;
  profileLevels: ProfileLevelsReport;
  costAwareWalkForward: CostAwareWalkForwardReport;
  liquidityDefense: LiquidityDefenseReport;
  heatUnderlay: { policy: HeatUnderlayPolicy; bars: number; note: string };
  overlayBudget: OverlayBudgetReport;
  visualLayout: VisualSelftestResult;
  coreZoneFusion: CoreZoneFusionReport;
  strategyPack: StrategyEnginePack;
  strategyFusion: StrategyZoneFusionReport;
  flowConfirmation: FlowConfirmationReport;
  confluence: ConfluenceReport;
  calibrationGate: CalibrationGateReport;
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
  /**
   * Causal on endExclusive (forming bar excluded when caller sets end).
   * PHASE 17: identical consecutive calls → prefer `runEagle1PipelineMemoized`
   * (closedBarTime key + historicalZoneCache LRU). Recompute when
   * `shouldRecomputeEagle1Zones` says TF/symbol/closedBar changed.
   */
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
  /** WAIT 감시 레벨은 HUD/작도만. FrozenTrade는 확정 후에만 연다. */
  const trade =
    confirm &&
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
  const historicalPathGate = runHistoricalPathGate({
    sampleSize: mainPlan.sampleSize,
    outcomeCount: causalOut.length,
    hasStructureTargets:
      riskForPath.entryLow != null &&
      riskForPath.entryHigh != null &&
      riskForPath.executableSl != null &&
      riskForPath.tp1 != null,
  });
  const futurePath = runSmartFuturePathEngine({
    lastTime: last?.time ?? 0,
    tfSec: TF_SEC[input.timeframe] ?? 900,
    direction: dir,
    risk: riskForPath,
    trade,
    sampleSize: mainPlan.sampleSize,
    outcomeCount: causalOut.length,
    calibratedProbability: mainPlan.calibratedProbability,
    slFirstRate: mainPlan.stats?.slFirstRate ?? historicalOutcome.slBeforeTp,
    medianMfePct: historicalOutcome.medianMfePct,
    meanReactionSec: historicalOutcome.meanReactionSec,
    lastClose: last?.close ?? null,
    historicalPathGate,
  });
  const smartPath = futurePath.path;
  mainPlan = {
    ...mainPlan,
    smartPath,
    expectedPath: `${smartPath.main.labelKo}: ${smartPath.main.note}`,
    altPath: `${smartPath.alt.labelKo}: ${smartPath.alt.note}`,
  };
  const orderFlow = runOrderFlowFacade({ live: input.moneyLive });
  const positionManagement = runPositionManagementEngine({
    trade,
    allowBreakeven: false,
  });
  const rec = zones.recommended;
  let chartUx = buildEagle1ChartUx(mainPlan, input.chartMode ?? 'practical', trade, {
    poc: zones.profile.poc,
    vah: zones.profile.vah,
    val: zones.profile.val,
    clusterUpper: rec?.upper ?? null,
    clusterLower: rec?.lower ?? null,
    clusterBias: rec?.bias ?? null,
    clusterLabel: rec?.labelKo ?? null,
    eqh: structure.equalHighs.slice(-1)[0] ?? null,
    eql: structure.equalLows.slice(-1)[0] ?? null,
    ssl: lastSweepLiquidity(structure.events).ssl,
    bsl: lastSweepLiquidity(structure.events).bsl,
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
  const costAwareWalkForward = runCostAwareWalkForward({
    outcomes: input.outcomes ?? [],
    liveSpreadBps: input.spreadBps ?? input.moneyLive?.spreadBps ?? null,
  });
  const walkForward = costAwareWalkForward.base;
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
  const candleEvidence = runCandleEvidenceEngine({
    candles: input.candles,
    events: structure.events,
    money: moneyPressure,
    endExclusive: end,
  });
  const candleEvents = candleEvidence.marks;
  const combination = runCombinationEngine({
    clusters: [...zones.displaySupport, ...zones.displayResist],
    recommended: zones.recommended,
    structure,
    money: moneyPressure,
    live: input.moneyLive,
    candleEvents,
    families: summarizeFamilies(causalOut),
  });
  const displaySupport = applyCombinationZonePromotion(zones.displaySupport, combination);
  const displayResist = applyCombinationZonePromotion(zones.displayResist, combination);
  const profileLevels = runProfileLevelsEngine({
    profile: zones.profile,
    mode: input.chartMode ?? 'practical',
  });
  {
    const extra = profileLevelsToPriceLines(profileLevels).filter(
      (l) => !chartUx.priceLines.some((e) => Math.abs(e.price - l.price) < 1e-6)
    );
    if (extra.length) chartUx = { ...chartUx, priceLines: [...chartUx.priceLines, ...extra] };
  }
  const unifiedZones = buildUnifiedZoneDesk({
    displaySupport,
    displayResist,
    families: summarizeFamilies(causalOut),
    money: moneyPressure,
    oiState: input.moneyLive?.oiState ?? null,
    hasCvd: Boolean(input.moneyLive?.has_cvd || typeof input.moneyLive?.volumeDelta === 'number'),
    nextSupportTarget: zones.displaySupport[1]?.upper ?? zones.profile.poc,
    nextResistTarget: zones.displayResist[1]?.lower ?? zones.profile.poc,
  });
  const lastPx = input.candles[Math.max(0, end - 1)]?.close ?? 0;
  const coreZoneFusion = runCoreZoneFusionEngine({
    zones: zones.zones,
    timeframe: input.timeframe,
    price: lastPx,
    symbol: input.symbol,
    displaySupport,
    displayResist,
  });
  const strategyPack = runStrategyEnginePack({
    candles: input.candles,
    endExclusive: end,
    structure,
    zones: { ...zones, displaySupport, displayResist },
    acceptance,
    falseBreak,
    orderFlow,
    riskLong,
    riskShort,
    timeframe: input.timeframe,
    symbol: input.symbol,
  });
  const strategyFusion = runStrategyZoneFusionEngine({ strategies: strategyPack.zones });
  const flowConfirmation = runFlowConfirmationEngine({
    live: input.moneyLive,
    money: moneyPressure,
    orderFlow,
  });
  const confluence = runConfluenceEngine({
    structure,
    zones: { ...zones, displaySupport, displayResist },
    flow: flowConfirmation,
    core: coreZoneFusion,
    strategyFusion,
    premiumDiscount,
    mtf,
    candles: input.candles,
    endExclusive: end,
    historicalSample: mainPlan.sampleSize,
    historicalTpBeforeSl: mainPlan.stats?.tpBeforeSlRate ?? null,
  });
  /** A+ practical: confluence 게이트 — 실패 시 A+ 라인만 숨김 (전략·CORE 유지) */
  const gatedFusion: StrategyZoneFusionReport = {
    ...strategyFusion,
    aPlusLong: confluence.aPlusLongOk ? strategyFusion.aPlusLong : null,
    aPlusShort: confluence.aPlusShortOk ? strategyFusion.aPlusShort : null,
    practical: [
      confluence.aPlusLongOk ? strategyFusion.aPlusLong : null,
      confluence.aPlusShortOk ? strategyFusion.aPlusShort : null,
    ].filter((z): z is NonNullable<typeof strategyFusion.aPlusLong> => z != null),
    note: `${strategyFusion.note} · conf ${confluence.summaryKo}`,
  };
  const calibrationGate = runCalibrationGate({
    setupScore: confluence.setupScore,
    historicalWinRate:
      confluence.historicalWinRate ??
      mainPlan.stats?.tpBeforeSlRate ??
      snapshotStats.tpBeforeSlRate ??
      null,
    sampleSize:
      confluence.historicalSample ?? mainPlan.sampleSize ?? snapshotStats.sampleSize ?? 0,
  });
  {
    const coreLines: Eagle1ChartUx['priceLines'] = [];
    if (coreZoneFusion.support) {
      coreLines.push({
        price: coreZoneFusion.support.midpoint,
        title: `CORE SUPPORT ${input.timeframe}`,
        color: '#22d3ee',
        lineWidth: 2,
        lineStyle: 'solid',
        axisLabel: true,
      });
    }
    if (coreZoneFusion.resistance) {
      coreLines.push({
        price: coreZoneFusion.resistance.midpoint,
        title: `CORE RESISTANCE ${input.timeframe}`,
        color: '#f87171',
        lineWidth: 2,
        lineStyle: 'solid',
        axisLabel: true,
      });
    }
    for (const ap of gatedFusion.practical) {
      coreLines.push({
        price: ap.midpoint,
        title: ap.labelEn,
        color: ap.side === 'LONG' ? '#34d399' : '#fb7185',
        lineWidth: 3,
        lineStyle: 'solid',
        axisLabel: true,
      });
    }
    if (coreLines.length) {
      const extra = coreLines.filter(
        (l) => !chartUx.priceLines.some((e) => Math.abs(e.price - l.price) < 1e-6)
      );
      if (extra.length) chartUx = { ...chartUx, priceLines: [...chartUx.priceLines, ...extra] };
    }
  }
  const squeezeRadar = runSqueezeRadarEngine({
    candles: input.candles,
    endExclusive: end,
    money: moneyPressure,
    live: input.moneyLive,
    falseBreak,
    regime: structure.regime,
  });
  const liqZones = runLiqZoneEngine({
    candles: input.candles,
    structure,
    endExclusive: end,
    squeezeRadar,
  });
  const liquidityDefense = runLiquidityDefenseEngine({
    candles: input.candles,
    structure,
    endExclusive: end,
    live: input.moneyLive,
    liqZones,
  });
  const mtfSmartZone = runMtfSmartZoneEngine({
    combination,
    displaySupport,
    displayResist,
    unifiedZones,
  });
  const reEntry = runReEntryEngine({
    prevTrade: input.prevTrade,
    trade,
    planStatus: mainPlan.status,
    combinationPromote: Boolean(combination.promoted),
    lastClose: last?.close ?? null,
  });
  const legendaryFusion = runLegendaryStrategyFusion({
    structure,
    plan: mainPlan,
    combination,
    mtfSmartZone,
    bigMove: squeezeRadar.bigMove,
  });
  const tradeOpportunity = runTradeOpportunityEngine({
    plan: mainPlan,
    combination,
    mtfSmartZone,
    legendary: legendaryFusion,
    reEntry,
  });
  const riskForExec =
    mainPlan.direction === 'SHORT' ? riskShort : mainPlan.direction === 'LONG' ? riskLong : riskLong;
  const entryMidForAnchors =
    riskForExec.entryLow != null && riskForExec.entryHigh != null
      ? (Number(riskForExec.entryLow) + Number(riskForExec.entryHigh)) / 2
      : null;
  const execAnchors: TargetStructureAnchors = {
    direction: mainPlan.direction === 'LONG' || mainPlan.direction === 'SHORT' ? mainPlan.direction : null,
    entryMid: entryMidForAnchors,
    poc: zones.profile.poc ?? null,
    hvn: zones.profile.hvn?.[0] ?? null,
    liqHigh: liqZones.shortLiq?.mid ?? null,
    liqLow: liqZones.longLiq?.mid ?? null,
    coreSupportMid: coreZoneFusion.support?.midpoint ?? null,
    coreResistMid: coreZoneFusion.resistance?.midpoint ?? null,
  };
  const executionLevels = runExecutionLevels({
    risk: riskForExec,
    plan: mainPlan,
    anchors: execAnchors,
  });
  /** PHASE 11 — Continuation after positionManagement (+ exec stop/tp2) */
  const continuation = runContinuationEngine({
    position: positionManagement,
    plan: mainPlan,
    lastClose: last?.close ?? null,
    stop: executionLevels.stop.executableSl ?? null,
    tp2: executionLevels.target.levels.find((lv) => lv.id === 'TP2')?.price ?? null,
  });
  const combinationMining = runCombinationMiningEngine({
    outcomes: causalOut,
    combination,
  });
  const scoreCalibration = runScoreCalibrationView({
    plan: mainPlan,
    consensus: mainPlan.consensus,
  });
  const positionSize = runPositionSizeEngine({
    risk: riskForExec,
    plan: mainPlan,
  });
  const htfHistorical = runHtfHistoricalStatus({
    symbol: input.symbol || 'BTCUSDT',
    coverage: (input.coverage ?? []).map((c) => ({
      tf: c.tf,
      rows: c.rows,
      gaps: c.gaps,
      firstIso: c.firstIso,
      lastIso: c.lastIso,
    })),
  });
  /** OOD면 MainPlan이 이미 WAIT인 경우가 많음 — 확정 힌트만 추가 제한 */
  if (scoreCalibration.forceWait && scoreCalibration.oodFlagged && htfHistorical.blockConfirmedHint) {
    /* quality는 analyze 라우트 qualityGate가 담당 — 여기선 뷰모델만 */
  }
  const heatUnderlaySeed = heatUnderlayReport(null);
  chartUx = appendSmartZoneSqueezePriceLines(chartUx, {
    mtfSmartZone,
    squeezeRadar,
    liqZones,
    legendaryTag: legendaryFusion.chartTag,
    tradeOpportunity,
    executionLevels,
    lastClose: last?.close ?? null,
  });
  const chartMode = input.chartMode ?? 'practical';
  chartUx = applyOverlayBudgetToChartUx(chartUx, chartMode);
  const overlayBudget = reportOverlayBudget({
    mode: chartMode,
    priceLineCount: chartUx.priceLines.length,
  });
  const visualLayout = runVisualLayoutSelftest({
    heatCoverCandles: false,
    hasWhaleCardUi: false,
  });
  const hud = buildEagle1HudPack({
    candles: input.candles,
    endExclusive: end,
    structure,
    plan: mainPlan,
    trade,
    money: moneyPressure,
    live: input.moneyLive,
    path: smartPath,
    acceptance,
    falseBreak,
    hist: historicalOutcome,
    mtf,
    profile: zones.profile,
    combination,
    candleEvents,
    clockCandles15m: input.clockCandles15m,
    compassFrames: (input.compassChain ?? []).map((f) => mtfFrameView(f.tf, f.structure)),
    coverage: input.coverage ?? [],
    squeezeRadar,
    mtfSmartZone,
    liqZones,
    reEntry,
    legendaryFusion,
    tradeOpportunity,
    executionLevels,
    combinationMining,
    scoreCalibration,
    positionSize,
    htfHistorical,
    smartFuturePath: futurePath,
    orderFlow,
    positionManagement,
    candleEvidence,
    profileLevels,
    costAwareWalkForward,
    liquidityDefense,
    heatUnderlay: heatUnderlaySeed,
    overlayBudget,
    visualLayout,
  });
  const heatUnderlay = heatUnderlayReport(hud.heat);
  hud.heatUnderlay = heatUnderlay;
  return {
    structure,
    zones: { ...zones, displaySupport, displayResist },
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
    smartFuturePath: futurePath,
    historicalPathGate,
    orderFlow,
    positionManagement,
    candleEvidence,
    profileLevels,
    walkForward,
    costAwareWalkForward,
    liquidityDefense,
    heatUnderlay,
    overlayBudget,
    visualLayout,
    statsDashboard,
    acceptance,
    falseBreak,
    historicalOutcome,
    premiumDiscount,
    unifiedZones,
    hud,
    combination,
    squeezeRadar,
    mtfSmartZone,
    liqZones,
    reEntry,
    legendaryFusion,
    tradeOpportunity,
    executionLevels,
    continuation,
    combinationMining,
    scoreCalibration,
    positionSize,
    htfHistorical,
    coreZoneFusion,
    strategyPack,
    strategyFusion: gatedFusion,
    flowConfirmation,
    confluence,
    calibrationGate,
  };
}

export function mainPlanBlocksConfirmed(plan: Eagle1MainPlan | null | undefined): boolean {
  if (!plan) return false;
  return plan.status !== 'CONFIRMED_LONG' && plan.status !== 'CONFIRMED_SHORT';
}
