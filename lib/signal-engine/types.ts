export type SignalState = 'WATCH' | 'READY' | 'TRIGGERED' | 'INVALID' | 'NO_SIGNAL';
export type SignalDirection = 'LONG' | 'SHORT' | 'NONE';

export interface SignalReason {
  code: string;
  label: string;
  score: number;
  detail?: string;
}

export interface SignalResult {
  state: SignalState;
  direction: SignalDirection;
  confidence: number;
  signalTime?: number;
  entry?: number;
  stop?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rr?: number;
  leverage?: number;
  positionSize?: number;
  riskAmount?: number;
  spotProfitPct?: number[];
  spotLossPct?: number;
  futuresProfitPct?: number[];
  futuresLossPct?: number;
  reasons: SignalReason[];
  contextScore: number;
  setupScore: number;
  triggerScore: number;
  totalScore: number;
  thresholds?: {
    triggered: { setup: number; trigger: number; total: number };
    ready: { setup: number; trigger: number };
    watch: { setup: number; triggerUpper: number };
    timeframe: string;
    regime: 'trend' | 'range';
  };
  timestamp: number;
}

export type MarketDataInput = {
  timeframe: string;
  currentPrice: number;
  candles: Array<{ open: number; high: number; low: number; close: number; volume: number; time: number }>;
  htfBias?: 'bullish' | 'bearish' | 'neutral';
  regime?: 'trend' | 'range';
  premiumDiscount?: 'premium' | 'discount' | 'neutral';
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  bosCount?: number;
  chochCount?: number;
  sweeps?: Array<{ side: 'buy' | 'sell'; index?: number; price?: number }>;
  rsiVerdict?: 'LONG' | 'SHORT' | 'WATCH' | 'NONE';
  rsiScore?: number;
  entryHoldProbability?: number;
  breakoutLevelProbability?: number;
  invalidationLevelProbability?: number;
  supportLevelProbability?: number;
  resistanceLevelProbability?: number;
  oiState?: 'increasing' | 'decreasing' | 'neutral';
  fundingState?: 'positive' | 'negative' | 'neutral';
  orderbookImbalance?: number;
  buyPressure?: number;
  sellPressure?: number;
  verdict?: 'LONG' | 'SHORT' | 'WATCH';
  confidence?: number;
  totalSeed?: number;
};
