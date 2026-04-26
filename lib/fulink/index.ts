/**
 * Fulink Pro ULTRA 분석 엔진 (assets/lib 전부 포팅)
 * - DecisionEngine, Tyron, TyronPro, CandleProb, SuperAgiV7, SnapshotHub, Learning, CoreAI
 */

export {
  evaluateDecision,
  conservatismPenalty,
  type FulinkDecision,
  type KeyZones,
  type TyRongResult,
} from './decisionEngine';

export { analyzeTyron, tyronStatsToTyRong, type TyronStats } from './tyronEngine';
export { analyzeTyronPro, type TyronProResult } from './tyronProEngine';

export { buildCandleProbChips, type ChipItem, type ChipTone } from './candleProbEngine';

export { computeSuperAgiV7, type SuperAgiV7Input, type SuperAgiV7Out } from './superAgiV7';

export {
  aggregateToSnapshot,
  type Evidence,
  type EngineSnapshot,
  type EvidenceKind,
  type TradeState,
} from './snapshotHub';

export {
  conservatismPenalty as learningConservatismPenalty,
  recentStats,
  recordOutcome,
  recordSignal,
  type LearningStats,
} from './learningEngine';

// decisionEngine re-exports conservatismPenalty (async wrapper)

export { runCoreAI, type CoreAIEvidence, type CoreAIResult } from './coreAi';
