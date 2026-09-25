/**
 * 독수리1호 4-STRATEGY AUTO SCALP — 타입.
 * A Sweep · B TrendCont · C AbsorptionDefense · D BreakoutRetest
 * 필수 3개 = CANDIDATE · 보너스는 점수만 · 승률 합산 금지.
 */

export const FOUR_STRATEGY_IDS = [
  'SWEEP_REVERSAL',
  'TREND_CONTINUATION',
  'ZONE_DEFENSE',
  'BREAKOUT_RETEST',
] as const;

export type FourStrategyId = (typeof FOUR_STRATEGY_IDS)[number];

/** ZONE_DEFENSE = Absorption Defense (id 유지 · 통계 호환) */
export const FOUR_STRATEGY_KO: Record<FourStrategyId, string> = {
  SWEEP_REVERSAL: '스윕반전',
  TREND_CONTINUATION: '추세연속',
  ZONE_DEFENSE: '흡수방어',
  BREAKOUT_RETEST: '돌파리테스트',
};

export const FOUR_STRATEGY_EN: Record<FourStrategyId, string> = {
  SWEEP_REVERSAL: 'SWEEP REVERSAL',
  TREND_CONTINUATION: 'TREND CONTINUATION',
  ZONE_DEFENSE: 'ABSORPTION DEFENSE',
  BREAKOUT_RETEST: 'BREAKOUT RETEST',
};

export type FourStrategyStatus =
  | 'LEARNING'
  | 'ACTIVE'
  | 'CAUTION'
  | 'DISABLED'
  | 'RECOVERY';

export type MarketRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'HIGH_VOL'
  | 'LOW_VOL'
  | 'BREAKOUT'
  | 'CHOP'
  | 'UNKNOWN';

export type FourStrategySide = 'LONG' | 'SHORT';

export type FourStrategyGrade = 'WAIT' | 'C' | 'B' | 'A' | 'A+';

export type MandatoryCheck = {
  key: string;
  labelKo: string;
  ok: boolean;
};

export type BonusItem = {
  key: string;
  labelKo: string;
  points: number;
};

export type FourStrategySignal = {
  strategyId: FourStrategyId;
  side: FourStrategySide;
  /** 필수 20×3 + 보너스(≤40) = 최대 100 */
  score: number;
  mandatoryCount: number;
  mandatory: MandatoryCheck[];
  bonusScore: number;
  bonusItems: BonusItem[];
  grade: FourStrategyGrade;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  evidence: string[];
  entryReason: string;
  failureRisk: number;
  expectedNetRoiPct: number;
  timestamp: number;
  regime: MarketRegime;
};

export type FourStrategyRejectReason =
  | 'NO_SETUP'
  | 'NO_RECLAIM'
  | 'NO_CONFIRMATION'
  | 'NO_TARGET_SPACE'
  | 'HIGH_SPREAD'
  | 'LOW_EV'
  | 'LOW_SCORE'
  | 'STRATEGY_DISABLED'
  | 'COOLDOWN'
  | 'CONFLICT'
  | 'BAD_DATA'
  | 'TF_BLOCK'
  | 'COST'
  | 'RR_FAIL';

export type FourStrategyTradeCandidate = {
  symbol: string;
  timeframe: string;
  side: FourStrategySide;
  primaryStrategy: FourStrategyId;
  supportingStrategies: FourStrategyId[];
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  mandatoryCount: number;
  bonusScore: number;
  grade: FourStrategyGrade;
  mandatory: MandatoryCheck[];
  bonusItems: BonusItem[];
  expectedNetRoiPct: number;
  failureRisk: number;
  evidence: string[];
  entryReason: string;
  regime: MarketRegime;
  status: FourStrategyStatus;
  sampleCount: number;
  netEv: number;
  profitFactor: number;
  allowPaper: boolean;
  allowLive: boolean;
  rejectReason: FourStrategyRejectReason | null;
  waitKo: string;
};

export type FourStrategyStatsBucket = {
  strategyId: FourStrategyId;
  symbol: string;
  timeframe: string;
  regime: MarketRegime;
  tradeCount: number;
  wins: number;
  losses: number;
  sumWinRoe: number;
  sumLossRoe: number;
  sumMfe: number;
  sumMae: number;
  sumFeeRoe: number;
  maxConsecLoss: number;
  consecLoss: number;
  netEv: number;
  profitFactor: number;
  status: FourStrategyStatus;
  updatedAt: number;
};

export type FourStrategyClosedTrade = {
  tradeId: string;
  strategyId: FourStrategyId;
  supportingStrategies: FourStrategyId[];
  symbol: string;
  timeframe: string;
  regime: MarketRegime;
  side: FourStrategySide;
  entryScore: number;
  entryReason: string;
  entryPrice: number;
  stopPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  leverage: number;
  feeRoePct: number;
  slippageRoePct: number;
  grossRoePct: number;
  netRoePct: number;
  mfeRoePct: number;
  maeRoePct: number;
  holdingBars: number;
  exitReason: string;
  win: boolean;
  paper: boolean;
  closedAt: number;
};

export type FourStrategyCardView = {
  strategyId: FourStrategyId;
  labelKo: string;
  status: FourStrategyStatus;
  tradeCount: number;
  winRate: number | null;
  netEv: number;
  profitFactor: number;
  bestRegime: MarketRegime | null;
  setupKo: string;
};

export function gradeFromScore(mandatoryCount: number, total: number): FourStrategyGrade {
  if (mandatoryCount < 3) return 'WAIT';
  if (total >= 90) return 'A+';
  if (total >= 80) return 'A';
  if (total >= 70) return 'B';
  return 'C';
}

export function formatFourStrategyBoard(sig: {
  strategyId: FourStrategyId;
  side: FourStrategySide;
  mandatory: MandatoryCheck[];
  bonusItems: BonusItem[];
  score: number;
  grade: FourStrategyGrade;
}): string {
  const mand = sig.mandatory.map((m) => `${m.ok ? '✓' : '✗'} ${m.labelKo}`).join(' · ');
  const bonus = sig.bonusItems.length
    ? sig.bonusItems.map((b) => `${b.labelKo}+${b.points}`).join(' · ')
    : '보너스없음';
  return [
    `${FOUR_STRATEGY_EN[sig.strategyId]} ${sig.side}`,
    `MANDATORY ${sig.mandatory.filter((m) => m.ok).length}/3 · ${mand}`,
    `BONUS ${bonus}`,
    `TOTAL ${sig.score}/100 · ${sig.grade}`,
  ].join('\n');
}
