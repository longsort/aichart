import type { Candle } from '@/types';

export type CandleStrength = 'weak' | 'normal' | 'strong';
export type LocalStructure = 'trend_up' | 'trend_down' | 'range' | 'reversal';
export type ZoneState = 'long_confirm' | 'short_confirm' | 'wait';

export type CandleScore = {
  index: number;
  bullish: boolean;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
  closeNearHigh: boolean;
  closeNearLow: boolean;
  longBody: boolean;
  hammer: boolean;
  invertedHammer: boolean;
  engulfing: boolean;
  breakoutCandle: boolean;
  failedBreakCandle: boolean;
  sweepSuspect: boolean;
  volumeZ: number;
  volumeTrend3: number;
  volumeConfirmed: boolean;
  strength: CandleStrength;
  score: number;
};

export type SwingPoint = {
  type: 'high' | 'low';
  index: number;
  price: number;
};

export type StructureSnapshot = {
  state: LocalStructure;
  hhhl: boolean;
  lhll: boolean;
  bosUp: number;
  bosDown: number;
  chochUp: number;
  chochDown: number;
  premiumDiscount: 'premium' | 'discount' | 'equilibrium';
};

export type ZoneSignalPack = {
  zone: ZoneState;
  score: number;
  bucket: 'strong' | 'valid' | 'normal' | 'invalid';
  reasons: string[];
  entryZone: [number, number] | null;
  stopZone: [number, number] | null;
  targets: number[];
  riskReward: number | null;
  labels: string[];
};

export type AnalysisPanelData = {
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  structure: 'Trending' | 'Range' | 'Reversal';
  htfBias: string;
  zoneState: ZoneState;
  longConfirmed: boolean;
  shortConfirmed: boolean;
  score: number;
  reasons: string[];
};

export type EngineMvpOutput = {
  candleScores: CandleScore[];
  swings: SwingPoint[];
  structure: StructureSnapshot;
  zoneSignal: ZoneSignalPack;
  panel: AnalysisPanelData;
};

export type EngineMvpInput = {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  htfBias: 'bullish' | 'bearish' | 'range' | null | undefined;
  ltfBias: 'bullish' | 'bearish' | 'range' | null | undefined;
  trend: 'bullish' | 'bearish' | 'range';
  verdict: 'LONG' | 'SHORT' | 'WATCH';
  confidence: number;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  breakoutLevel?: number | null;
  invalidationLevel?: number | null;
  entry?: number | null;
  stop?: number | null;
  targets?: number[];
  rr?: number | null;
  fvgCount?: number;
  obCount?: number;
  bosCount?: number;
  chochCount?: number;
  entryHoldProbability?: number;
  breakoutLevelProbability?: number;
  invalidationLevelProbability?: number;
  supportLevelProbability?: number;
  resistanceLevelProbability?: number;
  currentPrice?: number | null;
  zoneSensitivity?: number;
};
