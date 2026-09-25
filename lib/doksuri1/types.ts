/**
 * Doksuri-1 — FACT / 상태 타입.
 * 확정 승률·수익 보장 아님. FACT에 없는 문장 생성 금지.
 */

export type DataQuality = 'GOOD' | 'DEGRADED' | 'BAD';

export type DominantSide = 'BUYERS' | 'SELLERS' | 'BALANCED';

export type BigMoneyState =
  | 'STRONG_BUY'
  | 'STEADY_BUY'
  | 'SELL_ABSORPTION'
  | 'BREAKOUT_BUY'
  | 'CHASE_BUY'
  | 'NEUTRAL'
  | 'CHASE_SELL'
  | 'BREAKDOWN_SELL'
  | 'BUY_ABSORPTION'
  | 'STEADY_SELL'
  | 'STRONG_SELL';

export type PlanStatus =
  | 'READY'
  | 'WAIT_CONFIRMATION'
  | 'TOO_LATE'
  | 'INVALID'
  | 'ACTIVE'
  | 'WAIT_PULLBACK';

export type ActionState =
  | 'CONFIRMED_LONG'
  | 'WATCH_LONG'
  | 'WAIT'
  | 'WATCH_SHORT'
  | 'CONFIRMED_SHORT';

export type ZoneBattleState =
  | 'APPROACHING'
  | 'TESTING'
  | 'DEFENDING'
  | 'WEAKENING'
  | 'BREAK_ATTEMPT'
  | 'BROKEN'
  | 'RECLAIMED'
  | 'FLIPPED'
  | 'INVALID';

export const BIG_MONEY_KO: Record<BigMoneyState, string> = {
  STRONG_BUY: '강한 매수',
  STEADY_BUY: '꾸준한 매수',
  SELL_ABSORPTION: '매도흡수',
  BREAKOUT_BUY: '돌파매수',
  CHASE_BUY: '추격매수',
  NEUTRAL: '중립',
  CHASE_SELL: '추격매도',
  BREAKDOWN_SELL: '돌파매도',
  BUY_ABSORPTION: '매수흡수',
  STEADY_SELL: '꾸준한 매도',
  STRONG_SELL: '강한 매도',
};

export const DOMINANT_KO: Record<DominantSide, string> = {
  BUYERS: '매수 우세',
  SELLERS: '매도 우세',
  BALANCED: '균형 / WAIT',
};

export const ACTION_KO: Record<ActionState, string> = {
  CONFIRMED_LONG: 'LONG',
  WATCH_LONG: '롱관찰',
  WAIT: 'WAIT',
  WATCH_SHORT: '숏관찰',
  CONFIRMED_SHORT: 'SHORT',
};

export type Doksuri1TradePlan = {
  direction: 'LONG' | 'SHORT';
  status: PlanStatus;
  entryLow: number | null;
  entryHigh: number | null;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  rr: number | null;
  confirmationCount: number;
  confirmationTotal: number;
  invalidationKo: string | null;
  reasonKo: string | null;
  chaseForbidden: boolean;
};

export type Doksuri1MapLevel = {
  price: number;
  priceHi?: number;
  labelKo: string;
  kind: 'resist' | 'support' | 'pivot' | 'now' | 'whale' | 'liq';
};

export type Doksuri1ZoneScore = {
  zoneId: string;
  top: number;
  bot: number;
  attackScore: number;
  defenseScore: number;
  state: ZoneBattleState;
  labelKo: string;
};

export type Doksuri1PathLeg = {
  id: 'BULL' | 'BASE' | 'BEAR';
  points: number[];
  /** 학습표본 있을 때만 0–100, 없으면 null */
  probabilityPct: number | null;
  conditionKo: string;
};

export type Doksuri1DataQualityMap = {
  price: DataQuality;
  structure: DataQuality;
  dumpZones: DataQuality;
  whale: DataQuality;
  volume: DataQuality;
  derivatives: DataQuality;
  orderflow: DataQuality;
  plans: DataQuality;
};

export type Doksuri1Fact = {
  schema: 'doksuri1.fact.v1';
  symbol: string;
  timeframe: string;
  at: number;
  currentPrice: number;
  dominantSide: DominantSide;
  sellerStrength: number;
  buyerStrength: number;
  bigMoneyState: BigMoneyState;
  bigMoneyConfidence: number | null;
  bigMoneyKo: string;
  structureLabelKo: string | null;
  structureSummaryKo: string | null;
  whaleDnaKo: string | null;
  whaleForceKo: string | null;
  whaleBeamKo: string | null;
  whaleSampleN: number | null;
  whaleForecastPct: number | null;
  rvol: number | null;
  volumeLineKo: string | null;
  cvdState: 'POSITIVE' | 'NEGATIVE' | 'FLAT' | null;
  oiState: 'RISING' | 'FALLING' | 'FLAT' | null;
  derivCaseKo: string | null;
  absorptionScore: number | null;
  absorptionNoteKo: string | null;
  /** 학습표본 — 단위 분리 */
  learningSampleN: number | null;
  learningTp1ReachPct: number | null;
  learningSlReachPct: number | null;
  learningProfitFactor: number | null;
  learningLineKo: string | null;
  fundingKo: string | null;
  liqKo: string | null;
  mapLevels: Doksuri1MapLevel[];
  zoneScores: Doksuri1ZoneScore[];
  longPlan: Doksuri1TradePlan;
  shortPlan: Doksuri1TradePlan;
  nextBattlePrice: number | null;
  nextBattleKo: string | null;
  bullPathPoints: number[];
  bearPathPoints: number[];
  paths: Doksuri1PathLeg[];
  liveChainKo: string[];
  action: ActionState;
  actionKo: string;
  confidence: number | null;
  gatesPass: number | null;
  gatesTotal: number | null;
  dataQuality: Doksuri1DataQualityMap;
  badSourceCount: number;
  factHash: string;
  tipKo: string | null;
  /** 통합모드 맵 — 폭락TF·$$$$·초강·세력·캔들마커 */
  mergedDeskIntelLinesKo: string[];
  /** $$$$ 돈구간 분석 요약 (핵심·맵 공용 · 확정 수익 아님) */
  mergedDeskMoneyAnalysisKo: string[];
  /** 캔들 이벤트 스윕·돌파안착 */
  candleEventLinesKo: string[];
  candleEventFingerprint: string;
  candleEventEmitWorthy: boolean;
  mergedDeskIntelFlags: {
    nearDump: boolean;
    nearMoney: boolean;
    nearUltra: boolean;
    nearForce: boolean;
    nearWhale: boolean;
    candleMarkOn: boolean;
  } | null;
};

export type Doksuri1Pack = {
  fact: Doksuri1Fact;
  storyHtml: string;
  storyPlain: string;
  cardKo: {
    headline: string;
    mapLines: string[];
    liveLines: string[];
    longOneLine: string;
    shortOneLine: string;
    nextBattle: string;
    action: string;
  };
};
