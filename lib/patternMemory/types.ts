/**
 * Dual-model pattern memory (candle-only vs candle+volume).
 * Unique key: symbol + timeframe + openTime. No mock rows.
 */

export const PATTERN_MEMORY_TFS = ['5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;
export type PatternMemoryTf = (typeof PATTERN_MEMORY_TFS)[number];

export const PATTERN_WINDOWS = [5, 10, 20, 30, 50] as const;
export type PatternWindow = (typeof PATTERN_WINDOWS)[number];

export const OUTCOME_HORIZONS = [1, 2, 3, 5, 10, 20] as const;
export type OutcomeHorizon = (typeof OUTCOME_HORIZONS)[number];

export const TOP_K_OPTIONS = [50, 100, 200, 500] as const;

export type PatternMemoryModel = 'CANDLE_ONLY' | 'CANDLE_VOLUME';

export type PatternMemoryRegime =
  | 'STRONG_UP'
  | 'UP'
  | 'RANGE'
  | 'DOWN'
  | 'STRONG_DOWN'
  | 'VOL_EXPANSION'
  | 'VOL_COMPRESSION'
  | 'UNKNOWN';

export type FirstTouchResult = 'TP' | 'SL' | 'NONE' | 'AMBIGUOUS';

export type WaitReason =
  | '데이터 부족'
  | '표본 부족'
  | 'Similarity 낮음'
  | 'Candle과 Volume 결과 충돌'
  | 'TF 충돌 심함'
  | 'EV 부족'
  | 'Failure Risk 높음'
  | 'First Touch 차이 작음'
  | 'Parameter Stability 낮음'
  | 'Data Quality BAD'
  | '미완성 Candle';

export type StoredCandle = {
  symbol: string;
  timeframe: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  baseVolume: number;
  quoteTurnover: number | null;
  isClosed: boolean;
};

export type QualityRepairLog = {
  duplicateDropped: number;
  missingFilled: number;
  gapWindowsRepaired: number;
  invalidOhlcRepaired: number;
  negativeVolumeRepaired: number;
  unfinishedDropped: number;
  apiPages: number;
};

export type InventoryRow = {
  symbol: string;
  timeframe: string;
  count: number;
  firstOpenTime: number | null;
  lastOpenTime: number | null;
  lastClosedOpenTime: number | null;
  missingCount: number;
  duplicateCount: number;
  repair: QualityRepairLog;
  qualitySeverity: 'ok' | 'warning' | 'fail';
  source: string;
};

export type HorizonOutcome = {
  horizon: OutcomeHorizon;
  closeReturn: number;
  maxHighReturn: number;
  maxLowReturn: number;
};

export type SimilarityHit = {
  openTime: number;
  iso: string;
  cosine: number;
  euclidean: number;
  correlation: number;
  structureMatch: number;
  volumeMatch: number;
  rerank: number;
  regime: PatternMemoryRegime;
  model: PatternMemoryModel;
  window: PatternWindow;
};

export type DualMetrics = {
  model: PatternMemoryModel;
  sampleCount: number;
  winRate: number | null;
  evGross: number | null;
  evNet: number | null;
  profitFactor: number | null;
  averageR: number | null;
  medianR: number | null;
  mfeMean: number | null;
  maeMean: number | null;
  maxDrawdown: number | null;
  consecutiveLoss: number | null;
  firstTouchRate: number | null;
};

export const FEE_RATE = 0.0006;
export const SLIPPAGE_RATE = 0.0005;
export const ROUND_TRIP_COST = (FEE_RATE + SLIPPAGE_RATE) * 2;

export const TF_MIN_SEPARATION: Record<string, number> = {
  '5m': 12,
  '15m': 8,
  '1h': 6,
  '1H': 6,
  '4h': 4,
  '4H': 4,
  '1d': 3,
  '1D': 3,
  '1w': 2,
  '1W': 2,
  '1M': 1,
};

export const TF_LOOKBACK_MS: Record<string, number | null> = {
  '5m': 3 * 365.25 * 86_400_000,
  '15m': 3 * 365.25 * 86_400_000,
  '1h': 3 * 365.25 * 86_400_000,
  '4h': 3 * 365.25 * 86_400_000,
  '1d': null,
  '1w': null,
  '1M': null,
};

export const TF_ROLE: Record<string, string> = {
  '5m': 'Entry Timing',
  '15m': 'Short Term',
  '1h': 'Intraday',
  '4h': 'Swing',
  '1d': 'Major Trend',
  '1w': 'Macro',
  '1M': 'Macro Cycle',
};
