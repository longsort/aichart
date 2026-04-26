import type { Verdict } from '@/types';

/** 피처 패밀리 — 통합 그래프 6축과 정렬 + execution·micro 확장 */
export type FeatureFamily =
  | 'structure'
  | 'zone'
  | 'pattern'
  | 'momentum'
  | 'close'
  | 'liquidity'
  | 'execution'
  | 'micro';

/** 우측 패널·탭과 연동되는 신호 채널 */
export type SignalChannelId =
  | 'core_structure'
  | 'zone'
  | 'pattern'
  | 'momentum'
  | 'close'
  | 'liquidity'
  | 'execution'
  | 'micro'
  | 'briefing'
  | 'strategy_ref'
  | 'learning_ls'
  | 'virtual_trade'
  | 'misc';

export const CHANNEL_LABEL_KO: Record<SignalChannelId, string> = {
  core_structure: '구조·MTF',
  zone: '존·구간',
  pattern: '패턴·비전',
  momentum: '지표·확률',
  close: '종가 TF',
  liquidity: '유동성·압력',
  execution: '실행·타점',
  micro: '캔들 미세',
  briefing: '브리핑·유사',
  strategy_ref: '참조·전략',
  learning_ls: '자율학습',
  virtual_trade: '가상매매',
  misc: '기타 엔진',
};

/** 채널 스트립·범례용 짧은 이름 */
export const CHANNEL_COMPACT_KO: Record<SignalChannelId, string> = {
  core_structure: '구조',
  zone: '존',
  pattern: '패턴',
  momentum: '지표',
  close: '종가',
  liquidity: '유동',
  execution: '실행',
  micro: '미세',
  briefing: '브리핑',
  strategy_ref: '참조',
  learning_ls: '학습',
  virtual_trade: '가상',
  misc: '기타',
};

export type SignalGrade = 'CONFIRMED' | 'LEAN' | 'WATCH' | 'CONFLICT' | 'NONE';

export type UnifiedSignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export const SIGNAL_GRADE_LABEL_KO: Record<SignalGrade, string> = {
  CONFIRMED: '확정',
  LEAN: '우세',
  WATCH: '관찰',
  CONFLICT: '상충',
  NONE: '미약',
};

export const FUSION_DIRECTION_LABEL_KO: Record<UnifiedSignalDirection, string> = {
  LONG: '롱',
  SHORT: '숏',
  NEUTRAL: '중립',
};

/** 단일 분석 모듈에서 나온 롱/숏 기여 (0~100 스케일) */
export type UnifiedFeatureContribution = {
  id: string;
  family: FeatureFamily;
  channel: SignalChannelId;
  label: string;
  longScore: number;
  shortScore: number;
  /** 0~1, 추출기가 신뢰도 부여 */
  confidence: number;
  /** 프리셋·사용자 튜닝용 피처 가중 (기본 1) */
  weight: number;
  reasons: string[];
  meta?: Record<string, unknown>;
};

export type UnifiedChannelContribution = {
  channel: SignalChannelId;
  label: string;
  longDisplay: number;
  shortDisplay: number;
  /** 채널 내 가중합 Σ(confidence×weight) */
  weightSum: number;
  featureLabels: string[];
};

export type UnifiedLsSignal = {
  direction: UnifiedSignalDirection;
  grade: SignalGrade;
  /** 가중 평균 기반 0~100 (피처 없으면 50) */
  longDisplay: number;
  shortDisplay: number;
  edge: number;
  features: UnifiedFeatureContribution[];
  /** 채널별 가중 기여 요약 */
  channelContributions: UnifiedChannelContribution[];
  gatesPassed: string[];
  gatesFailed: string[];
  explain: string[];
  /** 기존 verdict와의 참조용 (엔진이 바꾸지 않음) */
  sourceVerdict?: Verdict;
};

/** `buildUnifiedLsSignal` 세 번째 인자 — 캔들이 있으면 RSI/MACD/OBV/EMA 합성 피처가 들어가고 `momentum_rsi_div`는 중복 방지로 생략 */
export type BuildUnifiedLsSignalOptions = {
  candles?: import('@/types').Candle[];
};

/** `buildUnifiedLsSignal` 옵션 — 로컬스토리지/서버 프로필과 연결 예정 */
export type UnifiedSignalProfile = {
  familyWeights: Partial<Record<FeatureFamily, number>>;
  featureWeights: Partial<Record<string, number>>;
  /** 채널 배수 — 0이면 해당 채널 피처 무시 */
  channelWeights: Partial<Record<SignalChannelId, number>>;
  thresholds: {
    leanEdge: number;
    watchEdge: number;
    confirmEdge: number;
    confirmSideMin: number;
    conflictSideMin: number;
    conflictMaxEdge: number;
  };
};

export const DEFAULT_UNIFIED_SIGNAL_PROFILE: UnifiedSignalProfile = {
  familyWeights: {},
  /** `omni_chart_fusion`: RSI·MACD·OBV·EMA를 한 덩어리로 합성(캔들 전달 시만) */
  featureWeights: { omni_chart_fusion: 1.25 },
  channelWeights: {},
  thresholds: {
    leanEdge: 12,
    watchEdge: 6,
    confirmEdge: 20,
    confirmSideMin: 58,
    conflictSideMin: 55,
    conflictMaxEdge: 8,
  },
};
