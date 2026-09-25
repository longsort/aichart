/**
 * AI DYNAMIC MARKET ZONE ENGINE — 도메인 타입.
 * 기존 zone/OB/mirage 엔진과 분리. 확정 승률·가짜 확률 금지.
 */

export type AmzDataQuality = 'GOOD' | 'DEGRADED' | 'BAD';

export type AmzZoneRole =
  | 'DEFENSE_SUPPORT'
  | 'DEFENSE_RESISTANCE'
  | 'MAGNET'
  | 'LIQUIDITY_TRAP'
  | 'FAST_PASS'
  | 'FLIP'
  | 'BALANCE'
  | 'UNKNOWN';

export type AmzZoneState =
  | 'DETECTED'
  | 'CONFIRMED'
  | 'FRESH'
  | 'APPROACHING'
  | 'TESTING'
  | 'DEFENDING'
  | 'WEAKENING'
  | 'CRITICAL'
  | 'BREAK_ATTEMPT'
  | 'BROKEN'
  | 'REJECTED'
  | 'FAILED_BREAK'
  | 'RETEST'
  | 'HOLD'
  | 'FAILED_RETEST'
  | 'FLIPPED'
  | 'INVALID'
  | 'DATA_INSUFFICIENT'
  | 'WAIT';

export type AmzEvidenceGroup =
  | 'STRUCTURE'
  | 'VOLUME'
  | 'ORDERFLOW'
  | 'LIQUIDITY'
  | 'PROFILE'
  | 'DERIVATIVES'
  | 'HISTORY'
  | 'MULTI_TF'
  | 'OB';

export type AmzEvidenceKind =
  | 'bullish_ob'
  | 'bearish_ob'
  | 'fvg'
  | 'bpr'
  | 'supply'
  | 'demand'
  | 'poc'
  | 'hvn'
  | 'lvn'
  | 'vah'
  | 'val'
  | 'swing_high'
  | 'swing_low'
  | 'eqh'
  | 'eql'
  | 'pdh'
  | 'pdl'
  | 'avwap'
  | 'liquidity_pool'
  | 'reaction_cluster';

export type AmzEvidence = {
  id: string;
  kind: AmzEvidenceKind;
  group: AmzEvidenceGroup;
  lower: number;
  upper: number;
  mid: number;
  timeframe: string;
  createdAtBar: number;
  strength: number;
  labelKo: string;
};

export type AmzProbabilities = {
  hold: number | null;
  breakTrue: number | null;
  fakeBreak: number | null;
  sweep: number | null;
  range: number | null;
  flip: number | null;
  sampleSize: number;
  calibrated: boolean;
  abstainReasonKo: string | null;
};

export type AmzMarketZone = {
  id: string;
  symbol: string;
  role: AmzZoneRole;
  roleKo: string;
  evidence: AmzEvidence[];
  timeframeSet: string[];
  outerUpper: number;
  outerLower: number;
  coreUpper: number;
  coreLower: number;
  criticalEdge: number | null;
  coreDefensePrice: number | null;
  coreAttackPrice: number | null;
  maxAbsorptionPrice: number | null;
  createdAt: number;
  confirmedAt: number | null;
  state: AmzZoneState;
  stateKo: string;
  initialStrength: number;
  currentStrength: number;
  lifeScore: number;
  fatigueScore: number;
  stabilityScore: number;
  attackScore: number;
  defenseScore: number;
  battleIntensity: number;
  absorptionScore: number | null;
  replenishmentScore: number | null;
  liquidityPullScore: number | null;
  icebergLikelihood: number | null;
  impactScore: number | null;
  compressionScore: number;
  reactionDecayScore: number;
  penetration: number;
  dwellBars: number;
  /** STEP9–12 */
  acceptanceScore: number | null;
  rejectionScore: number | null;
  touchCount: number;
  lastReactionPct: number | null;
  reactionMfePct: number | null;
  reactionMaePct: number | null;
  stateLogKo: string[];
  probabilities: AmzProbabilities;
  confidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
  dataQuality: AmzDataQuality;
  explainKo: string[];
  missingDataKo: string[];
};

export type AmzEnginePack = {
  version: 1;
  symbol: string;
  timeframe: string;
  dataQuality: AmzDataQuality;
  qualityNotesKo: string[];
  zones: AmzMarketZone[];
  overlays: import('@/types').OverlayItem[];
  /** STEP19 — 핵심방어/취약/흡수 가격선 */
  priceLines?: import('@/lib/monthDeskAtlasPulseDesk').AtlasPulsePriceLine[];
  statusKo: string;
  disclaimerKo: string;
  /** STEP8 주문흐름 가용성 */
  orderflow?: {
    available: boolean;
    tradeCount: number;
    buyPressure: number | null;
    ofi: number | null;
    replenishmentScore: number | null;
    noteKo: string;
  };
  /** STEP21 */
  liveValidation?: import('./liveValidation').AmzLiveValidation;
};
