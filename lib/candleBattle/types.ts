/**
 * REAL CANDLE BATTLE ANALYSIS — 결과 모델.
 * Score ≠ 승률. 가짜/랜덤/목 데이터 금지. NOT_AVAILABLE 명시.
 */
import type { OverlayItem } from '@/types';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

export type BattleAvailability =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'NOT_AVAILABLE'
  | 'ESTIMATED';

export type BattleDataQuality = 'GOOD' | 'DEGRADED' | 'BAD';

export type BattleDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export type BattleDecisionStatus =
  | 'CONFIRMED_LONG'
  | 'LONG_WATCH'
  | 'WAIT'
  | 'SHORT_WATCH'
  | 'CONFIRMED_SHORT'
  | 'DATA_INSUFFICIENT';

export type BattleMarkerType =
  | 'TREND'
  | 'APPROACH'
  | 'ZONE'
  | 'SWEEP'
  | 'SFP'
  | 'ABSORPTION'
  | 'REPLENISHMENT'
  | 'CVD_DIVERGENCE'
  | 'OI_EVENT'
  | 'RECLAIM'
  | 'CHOCH'
  | 'MSS'
  | 'BOS'
  | 'DISPLACEMENT'
  | 'RETEST'
  | 'ENTRY'
  | 'SL'
  | 'TP'
  | 'INVALIDATION'
  | 'FORECAST';

export type BattlePhaseType =
  | 'TREND'
  | 'APPROACH'
  | 'SWEEP_SFP'
  | 'ABSORPTION'
  | 'RECLAIM'
  | 'DISPLACEMENT'
  | 'RETEST'
  | 'TARGET';

export type BattleAnalysisMarker = {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  price: number;
  type: BattleMarkerType;
  direction: BattleDirection;
  score: number | null;
  confidence: number | null;
  confirmed: boolean;
  labelKo: string;
  reasons: string[];
  debugReason: string;
  availability: BattleAvailability;
};

export type BattleAnalysisPhase = {
  id: string;
  index: number;
  startTimestamp: number;
  endTimestamp: number | null;
  phaseType: BattlePhaseType;
  direction: BattleDirection;
  score: number | null;
  labelKo: string;
  detailKo: string;
  evidence: string[];
  confirmed: boolean;
  active: boolean;
};

export type BattleTradeDecision = {
  symbol: string;
  timeframe: string;
  direction: BattleDirection;
  status: BattleDecisionStatus;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  invalidationPrice: number | null;
  gatePassed: number;
  gateTotal: number;
  confidenceScore: number | null;
  historicalProbability: number | null;
  sampleCount: number;
  reasons: string[];
  waitReason: string | null;
  attackScore: number | null;
  defenseScore: number | null;
};

export type BattleForecastPoint = {
  time: number;
  price: number;
  kind: 'retest' | 'entry' | 'tp1' | 'tp2' | 'tp3' | 'path';
};

export type BattleForecastPath = {
  direction: BattleDirection;
  createdAt: number;
  startTimestamp: number;
  startPrice: number;
  points: BattleForecastPoint[];
  invalidationPrice: number | null;
  status: 'ACTIVE' | 'INVALIDATED' | 'NOT_AVAILABLE';
  reasons: string[];
  /** 확정 아님 — 예상경로 */
  forecastOnly: true;
};

export type BattlePaneSeries = {
  key: 'volume' | 'delta' | 'cvd' | 'oi';
  availability: BattleAvailability;
  noteKo: string;
  /** timestamp(sec) → value ; OI는 희소할 수 있음 */
  points: Array<{ time: number; value: number }>;
};

export type CandleBattlePack = {
  version: 1;
  symbol: string;
  timeframe: string;
  builtAt: string;
  quality: BattleDataQuality;
  qualityNotes: string[];
  availability: {
    candles: BattleAvailability;
    trades: BattleAvailability;
    orderbook: BattleAvailability;
    orderbookHistory: BattleAvailability;
    cvd: BattleAvailability;
    oi: BattleAvailability;
    funding: BattleAvailability;
    liquidation: BattleAvailability;
    replenishment: BattleAvailability;
  };
  phases: BattleAnalysisPhase[];
  markers: BattleAnalysisMarker[];
  decision: BattleTradeDecision;
  forecast: BattleForecastPath | null;
  coreZone: { top: number; bot: number; labelKo: string; sourceTfKo: string } | null;
  previousLow: number | null;
  previousHigh: number | null;
  panes: BattlePaneSeries[];
  overlays: OverlayItem[];
  chartMarkers: AtlasPulseMarker[];
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
};
