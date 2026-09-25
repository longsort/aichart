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
export { computeZoneReaction, classifyBandReaction, zoneReactionKo, ZONE_REACTION_KO } from '@/lib/eagle1/zoneReaction';
export { inheritFrozenZones } from '@/lib/eagle1/zoneFreeze';
export { walkSetupOutcomes, buildExpectancyCatalog, walkForwardRrGates, classifyFamily } from '@/lib/eagle1/zoneExpectancy';
export { matchSimilarOutcomes, similarityShellKo } from '@/lib/eagle1/historicalSimilarity';
export { runInternalMl, mlShellKo } from '@/lib/eagle1/internalMl';
export { voteExperts } from '@/lib/eagle1/expertModels';
export { runConsensus, detectOod, consensusShellKo } from '@/lib/eagle1/consensusEngine';
export { buildSmartPath, smartPathShellKo } from '@/lib/eagle1/smartPath';
export { walkForwardBacktest, walkForwardShellKo } from '@/lib/eagle1/walkForwardBacktest';
export { buildStatsDashboard } from '@/lib/eagle1/statsDashboard';
export { formatEagle1TelegramReport, safeEagle1TelegramReport } from '@/lib/eagle1/telegramReporter';
export { evaluateMtfSequence, mtfChainTfsForChart, mtfFrameView } from '@/lib/eagle1/mtfSequence';
export { advanceFrozenTrade, buildFrozenPath } from '@/lib/eagle1/tradeManage';
export { buildRiskPlan, positionUnits } from '@/lib/eagle1/riskEngine';
export { buildMainPlan } from '@/lib/eagle1/signalEngine';
export { runEagle1Pipeline, mainPlanBlocksConfirmed } from '@/lib/eagle1/pipeline';
export { runEagle1AtCursor, liveReplayParity, EAGLE1_REPLAY_SPEEDS } from '@/lib/eagle1/replayEngine';
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
  applyEagle1TermKo,
  eagle1PathSegments,
  eagle1PathArrowPolygon,
  hideCollidingLabels,
  eagle1LabelPriority,
  attachFunctionalOverlayLabel,
} from '@/lib/eagle1/chartUx';
export { eagle1ZonesToOverlays, overlayFromEagle1ZoneId } from '@/lib/eagle1/zoneOverlays';
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

