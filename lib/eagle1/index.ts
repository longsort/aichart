export { EAGLE1_ENGINE_VERSION, EAGLE1_AVAILABILITY_NONE, eagle1RawMarketType } from '@/lib/eagle1/rawTypes';
export { resolveEagle1LiveAvailability, eagle1AvailabilityOrNone } from '@/lib/eagle1/availabilityFromLive';
export { buildPressureHeat } from '@/lib/eagle1/pressureHeatmap';
export { runSchematicCompare } from '@/lib/eagle1/schematicCompare';
export { validateRawCandles, expectedCloseTime } from '@/lib/eagle1/dataQualityValidator';
export { inspectEagle1Storage } from '@/lib/eagle1/storageManager';
export { loadEagle1RawCandles, defaultAvailabilityForOhlcvOnly } from '@/lib/eagle1/historicalDatabase';
export { chartCandlesToEagle1Raw, chartCandleToEagle1Raw, eagle1CandleUniqueKey } from '@/lib/eagle1/canonicalCandle';
export { evaluateQualityGate } from '@/lib/eagle1/qualityGate';
export { shouldShowFeatureProbabilityGauge, historicalStatLabel, formatCompactZoneLabel, formatSamplePct, EAGLE1_MIN_STAT_SAMPLE } from '@/lib/eagle1/noFakeNumbers';
/** coverageRefresh 는 server-only — 배럴에서 재export 하지 않음 (클라이언트 TP1004 방지) */
export { buildCoverageManifest, writeCoverageManifest } from '@/lib/eagle1/coverageManifest';
export { resampleOhlcv, compareNativeToResampled } from '@/lib/eagle1/resampleValidate';
export { freezePrediction, attachOutcome, freezeFromPlan, formatEagle1SnapshotClock, resolvePredictionOutcome, incrementalSnapshotStats, incrementalStatsFromSetupOutcomes } from '@/lib/eagle1/predictionSnapshot';
export { chronologicalSplit, rejectShuffledSplit } from '@/lib/eagle1/chronologicalSplit';
export { detectFvgCausal } from '@/lib/eagle1/causalFvg';
export { runRepaintAudit } from '@/lib/eagle1/repaintAudit';
export { evaluateRepaintGate } from '@/lib/eagle1/repaintGate';
export { detectStructureCausal, structureReplayParity, lastStructureEventKo, wyckoffKo, lastLiquidityKo, lastSweepLiquidity, WYCKOFF_KO } from '@/lib/eagle1/structureEngine';
export { smcWyckoffConfluence } from '@/lib/eagle1/smcConfluence';
export { detectZonesCausal, clusterZones, applyZoneLifecycle, classifyPocState, pocStateKo, volumeProfile, clusterReactionLabel } from '@/lib/eagle1/zoneEngine';
export {
  buildParallelChannelEngine,
  detectChannelPivots,
  getLowerPrice,
  getUpperPrice,
  getMidPrice,
} from '@/lib/eagle1/parallelChannelEngine';
export type {
  ParallelChannel,
  ChannelState,
  ChannelType,
  ParallelChannelEnginePack,
} from '@/lib/eagle1/parallelChannelEngine';
export {
  eagle1ZoneToMarketZone,
  marketZoneToEagle1Zone,
  zoneLifecycleToMarketState,
  marketStateToZoneLifecycle,
  applyMarketZoneStateWithoutMovingBounds,
  marketZoneBoundsEqual,
  marketZoneRoundTripOk,
  marketZoneAdapterSelftest,
} from '@/lib/eagle1/marketZone';
export {
  buildZoneDensityProfile,
  densityPeakForDirection,
  zonesToDensityEvidence,
  evidenceWeightForSource,
} from '@/lib/eagle1/zoneDensityProfile';
export {
  runCoreZoneFusionEngine,
  coreZoneToMarketZone,
  coreZoneFusionAcceptanceA,
  clustersAsSyntheticZones,
} from '@/lib/eagle1/coreZoneFusionEngine';
export {
  runTrendBreakStrategy,
  runLiquidityReversalStrategy,
  runObRetestStrategy,
  runMitigationStrategy,
  runPocReclaimStrategy,
  runAsymmetricRiskStrategy,
  runVcpStyleStrategy,
  runStrategyEnginePack,
} from '@/lib/eagle1/strategyEngines';
export { runStrategyZoneFusionEngine, strategyFusionAcceptanceB } from '@/lib/eagle1/strategyZoneFusionEngine';
export { runFlowConfirmationEngine, flowConfirmationAcceptanceI } from '@/lib/eagle1/flowConfirmationEngine';
export { runConfluenceEngine, confluenceSmcDampSelftest } from '@/lib/eagle1/confluenceEngine';
export {
  runCalibrationGate,
  calibrationGateAcceptance,
  normalizeHistoricalWinRate,
  setupScoreEqualsWinRatePct,
} from '@/lib/eagle1/calibrationGate';
export { computeZoneReaction, classifyBandReaction, zoneReactionKo, ZONE_REACTION_KO } from '@/lib/eagle1/zoneReaction';
export { inheritFrozenZones } from '@/lib/eagle1/zoneFreeze';
export { walkSetupOutcomes, buildExpectancyCatalog, walkForwardRrGates, classifyFamily } from '@/lib/eagle1/zoneExpectancy';
export { matchSimilarOutcomes, similarityShellKo } from '@/lib/eagle1/historicalSimilarity';
export { runInternalMl, mlShellKo } from '@/lib/eagle1/internalMl';
export { voteExperts } from '@/lib/eagle1/expertModels';
export { runConsensus, detectOod, consensusShellKo } from '@/lib/eagle1/consensusEngine';
export { buildSmartPath, smartPathShellKo } from '@/lib/eagle1/smartPath';
export { runSmartFuturePathEngine } from '@/lib/eagle1/smartFuturePathEngine';
export {
  runHistoricalPathGate,
  historicalPathAcceptanceJ,
  isEvidenceBackedPathPoints,
  applyHistoricalPathGateToSmartPath,
} from '@/lib/eagle1/historicalPathGate';
export { walkForwardBacktest, walkForwardShellKo } from '@/lib/eagle1/walkForwardBacktest';
export { buildStatsDashboard } from '@/lib/eagle1/statsDashboard';
export { formatEagle1TelegramReport, safeEagle1TelegramReport, formatSqueezeTelegramLine, formatMtfSmartZoneTelegramLine, formatLiqZoneTelegramLine, formatReEntryTelegramLine, formatLegendaryTelegramLine, formatTradeOpportunityTelegramLine } from '@/lib/eagle1/telegramReporter';
export { evaluateMtfSequence, mtfChainTfsForChart, mtfFrameView } from '@/lib/eagle1/mtfSequence';
export { advanceFrozenTrade, buildFrozenPath, isTradeTerminal } from '@/lib/eagle1/tradeManage';
export {
  marketBusKey,
  marketBusCandleKey,
  subscribeMarketBus,
  subscribeMarketBusCandles,
  marketBusStats,
  clearMarketBus,
  marketBusConcurrentSelftest,
} from '@/lib/eagle1/marketDataBus';
export { explainEagle1Label, eagle1LabelTitleAttr } from '@/lib/eagle1/labelLexicon';
export { runSqueezeRadarEngine } from '@/lib/eagle1/squeezeRadarEngine';
export { runMtfSmartZoneEngine } from '@/lib/eagle1/mtfSmartZoneEngine';
export { runLiqZoneEngine } from '@/lib/eagle1/liqZoneEngine';
export { runReEntryEngine } from '@/lib/eagle1/reEntryEngine';
export { runLegendaryStrategyFusion } from '@/lib/eagle1/legendaryStrategyFusion';
export { runTradeOpportunityEngine } from '@/lib/eagle1/tradeOpportunityEngine';
export { runEntryOptimizer } from '@/lib/eagle1/entryOptimizer';
export { runStopOptimizer } from '@/lib/eagle1/stopOptimizer';
export { runTargetEngine } from '@/lib/eagle1/targetEngine';
export { runExecutionLevels, executionLevelsAcceptancePriceCoords } from '@/lib/eagle1/executionLevels';
export { runContinuationEngine, continuationAcceptanceGH } from '@/lib/eagle1/continuationEngine';
export { runCombinationMiningEngine } from '@/lib/eagle1/combinationMiningEngine';
export { runScoreCalibrationView } from '@/lib/eagle1/scoreCalibrationView';
export { runPositionSizeEngine } from '@/lib/eagle1/positionSizeEngine';
export { runHtfHistoricalStatus } from '@/lib/eagle1/htfHistoricalStatus';
export { runOrderFlowFacade } from '@/lib/eagle1/orderFlowFacade';
export { runPositionManagementEngine } from '@/lib/eagle1/positionManagementEngine';
export { runCandleEvidenceEngine } from '@/lib/eagle1/candleEvidenceEngine';
export { runProfileLevelsEngine, profileLevelsToPriceLines } from '@/lib/eagle1/profileLevelsEngine';
export { runCostAwareWalkForward, costPerTradeApproxR } from '@/lib/eagle1/costAwareWalkForward';
export { runLiquidityDefenseEngine } from '@/lib/eagle1/liquidityDefenseEngine';
export { heatBarPaintSafe, heatUnderlayReport, EAGLE1_HEAT_UNDERLAY } from '@/lib/eagle1/heatUnderlayPolicy';
export {
  applyOverlayBudgetToChartUx,
  applyPriceLineBudget,
  reportOverlayBudget,
  OVERLAY_BUDGET_BY_MODE,
} from '@/lib/eagle1/overlayBudget';
export {
  labelInteractionPayload,
  resolveLabelExplain,
  EAGLE1_EASY_KO,
  LABEL_LONG_PRESS_MS,
} from '@/lib/eagle1/labelInteraction';
export { runVisualLayoutSelftest, EAGLE1_VISUAL_CONTRACT } from '@/lib/eagle1/visualLayoutContract';
export { buildRiskPlan, positionUnits } from '@/lib/eagle1/riskEngine';
export { buildMainPlan } from '@/lib/eagle1/signalEngine';
export { runEagle1Pipeline, mainPlanBlocksConfirmed } from '@/lib/eagle1/pipeline';
export {
  runEagle1PipelineMemoized,
  clearEagle1PipelineMemo,
  pipelineMemoAcceptance,
} from '@/lib/eagle1/pipelineMemo';
export {
  getHistoricalZoneCache,
  setHistoricalZoneCache,
  historicalZoneCacheKeyEquals,
  shouldRecomputeEagle1Zones,
  closedBarTimeFromCandles,
  buildHistoricalZoneCacheKey,
  fingerprintFrozenZoneBounds,
  clearHistoricalZoneCache,
  historicalZoneCacheAcceptance,
  type HistoricalZoneCacheKey,
  type HistoricalZoneCacheEntry,
} from '@/lib/eagle1/historicalZoneCache';
export {
  runEagle1AtCursor,
  liveReplayParity,
  liveReplayParityDetailed,
  liveReplayParityHash,
  replayFusionParityAcceptanceD,
} from '@/lib/eagle1/replayEngine';
export { EAGLE1_REPLAY_SPEEDS } from '@/lib/eagle1/replaySpeeds';
export { eagle1HorizonVerdicts } from '@/lib/eagle1/horizonVerdict';
export { runStructureAcceptance, ACCEPTANCE_FLOW } from '@/lib/eagle1/structureAcceptanceEngine';
export { runFalseBreakEngine } from '@/lib/eagle1/falseBreakEngine';
export { runHistoricalStatistics, formatReactionTime } from '@/lib/eagle1/historicalStatisticsEngine';
export { runPremiumDiscount } from '@/lib/eagle1/premiumDiscountEngine';
export { runBigMoveEngine } from '@/lib/eagle1/bigMoveEngine';
export { runCandleEventEngine } from '@/lib/eagle1/candleEventEngine';
export { runClockFlowEngine, clockSlotUtc } from '@/lib/eagle1/clockFlowEngine';
export {
  bucketTradesToOfi,
  replenishmentFromBooks,
  liqAccelFromPoints,
  lastOfi,
  clockSubMinuteLabel,
  bookSnapFromDepth,
} from '@/lib/eagle1/microstructureSeries';
export { buildEagle1HudPack, HUD_TRADE_RAIL, HUD_BREAK_RAIL } from '@/lib/eagle1/hudPack';
export {
  overlayPassesEagle1ChartMode,
  deskOverlayKeptForEagle1Mode,
  capDeskZoneFacesForAnalysis,
  applyEagle1DeskOverlayMode,
  mergedDeskZoneFaceAllowed,
  isEagle1OverlayId,
  overlayAllowedOnEagle1HudChart,
  formatEagle1MainPlanCompact,
  eagle1DecisionKo,
  mergeEagle1DeskPriceLines,
  appendSmartZoneSqueezePriceLines,
  applyEagle1TermKo,
  eagle1PathSegments,
  eagle1PathArrowPolygon,
  hideCollidingLabels,
  eagle1LabelPriority,
  attachFunctionalOverlayLabel,
} from '@/lib/eagle1/chartUx';
export { buildEagle1ChartAlerts, buildEagle1LiveBriefing } from '@/lib/eagle1/chartAlertCallouts';
export type { Eagle1LiveBriefing } from '@/lib/eagle1/chartAlertBriefing';
export { eagle1ZonesToOverlays, overlayFromEagle1ZoneId, coreZoneFusionToOverlays, coreZoneToOverlay, aPlusZoneToOverlay } from '@/lib/eagle1/zoneOverlays';
export {
  buildMergedDeskEagle1CoreInject,
  formatEagle1InjectChip,
  mergedDeskCoreInjectSelftest,
  resolveEagle1CoreTimeSpan,
} from '@/lib/eagle1/mergedDeskCoreInject';
export {
  filterOverlaysForEagle1DeskUi,
  isPracticalKeptOverlayId,
  eagle1ZoneDetailFromOverlay,
  mergedDeskPracticalUiAcceptance,
  type Eagle1DeskUiMode,
  type Eagle1DebugLayer,
} from '@/lib/eagle1/mergedDeskPracticalUi';
export {
  SCREENSHOT_VISUAL_CONTRACT,
  SCREENSHOT_PRICE_SPACE_ROLES,
  screenshotVisualContractAcceptance,
  type ScreenshotVisualContract,
} from '@/lib/eagle1/screenshotVisualContract';
export {
  runMasterAcceptanceChecklist,
  type MasterAcceptanceItem,
} from '@/lib/eagle1/masterAcceptanceChecklist';
export { eagle1StructureToOverlays } from '@/lib/eagle1/structureOverlays';
export { buildStructureDeskOverlays } from '@/lib/eagle1/structureDeskDraw';
export {
  computeMoneyPressure,
  applyMoneyPressureToRbOverlays,
  isPracticalRbPressureBand,
  EAGLE1_MONEY_PRESSURE_KO,
  moneyFlowSide,
  moneyPressureShellKo,
} from '@/lib/eagle1/moneyPressureBand';

