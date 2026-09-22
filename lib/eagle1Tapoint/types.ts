/**
 * 독수리1호 타점엔진 — 타입·결정 상태.
 * 기존 Dual/A·B·C/S급/Zone 삭제 없음 · 새 모드 전용.
 * 확정 승률·수익 아님.
 */

export type TapDecision =
  | 'CONFIRMED_LONG'
  | 'CONFIRMED_SHORT'
  | 'ARMED_LONG'
  | 'ARMED_SHORT'
  | 'WAIT';

export type TapEntryState =
  | 'WAIT'
  | 'SETUP'
  | 'ARMED'
  | 'TRIGGERED'
  | 'EXECUTION_READY'
  | 'EXECUTED'
  | 'MANAGE'
  | 'EXIT'
  | 'OUTCOME';

export type TapExecKind = 'MARKET_SCALP' | 'ZONE_SNIPER' | 'WAIT';

export type TapScorePack = {
  macro: number;
  regime: number;
  direction: number;
  location: number;
  setup: number;
  entry: number;
  flow: number;
  liquidity: number;
  event: number;
  historical: number;
  failureRisk: number;
  ev: number;
};

export type TapGateResult = {
  ok: boolean;
  failReasons: string[];
  passTags: string[];
};

export type TapMacroFrame = {
  tf: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' | 'UNKNOWN';
  structure: string;
  momentum: string;
  flow: string;
  risk: string;
  noteKo: string;
};

export type TapBattleZone = {
  lo: number;
  hi: number;
  mid: number;
  labelKo: string;
  sources: string[];
  strength: number;
};

export type TapHistoricalSnap = {
  n: number;
  similarity: number | null;
  up3: number | null;
  up5: number | null;
  up10: number | null;
  mfe: number | null;
  mae: number | null;
  netEv: number | null;
  noteKo: string;
};

export type TapExtremeSnap = {
  kind: string;
  score: number;
  noteKo: string;
  allowsEventPath: boolean;
  evidence: string[];
};

export type TapointDecisionReport = {
  symbol: string;
  timeframe: string;
  decidedAt: number;
  decision: TapDecision;
  entryState: TapEntryState;
  execKind: TapExecKind;
  direction: 'LONG' | 'SHORT' | null;
  scores: TapScorePack;
  gate: TapGateResult;
  macro: TapMacroFrame[];
  regimeKo: string;
  battleZone: TapBattleZone | null;
  historical: TapHistoricalSnap;
  extreme: TapExtremeSnap;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reasonOneLineKo: string;
  briefingKo: string;
  setupSources: string[];
  signalId: string | null;
  rejectReasonKo: string | null;
  qualityOk: boolean;
};

export const TAPOINT_SOURCE = 'eagle1-tap-engine' as const;

export const TAPOINT_MACRO_TFS = ['1M', '1W', '1D', '4H', '1H'] as const;
export const TAPOINT_SETUP_TFS = ['15m', '5m'] as const;
export const TAPOINT_ENTRY_TFS = ['3m', '1m'] as const;
export const TAPOINT_CHART_TFS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '1H',
  '4H',
  '1D',
  '1W',
  '1M',
] as const;

export const TAPOINT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;
