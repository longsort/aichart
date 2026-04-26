/**
 * 시각화(D) 레이어가 받는 정규 페이로드 — 분석(B)·점수(C) 결과를 숫자/구간으로만 표현.
 * 프론트는 이 JSON만으로 존·라벨·게이지를 그린다.
 */
export type SmartOverlayZoneKind =
  | 'support'
  | 'resistance'
  | 'entry'
  | 'risk'
  | 'target'
  | 'breakout'
  | 'bpr'
  | 'fvg'
  | 'ob';

export type SmartOverlayZone = {
  type: SmartOverlayZoneKind;
  /** 가격 하단 */
  from: number;
  /** 가격 상단 */
  to: number;
  label: string;
  /** 진입·돌파·핵심 지지/저항·목표1 등 — 차트 존 펄스 */
  core?: boolean;
};

/** C단 점수 엔진 — 합 100 권장 (MVP: 미채움 가능) */
export type SmartOverlayScoreBreakdown = {
  structure: number;
  volume: number;
  whale: number;
  liquidityFvgBpr: number;
  oiCvd: number;
};

/** 구조 + 종가 돌파/이탈 + 2봉 유지 기반 상·하 확정 (휴리스틱 MVP) */
export type SmartOverlayConfirmation = {
  headline: 'BULL_CONFIRM' | 'BEAR_CONFIRM' | 'NONE';
  headline_ko: string;
  progress_ko: string;
  bull: {
    score: number;
    structure: boolean;
    breakout_close: boolean;
    hold_bars: boolean;
    volume_confirm: boolean;
  };
  bear: {
    score: number;
    structure: boolean;
    breakout_close: boolean;
    hold_bars: boolean;
    volume_confirm: boolean;
  };
  bull_detail?: string[];
  bear_detail?: string[];
};

export type SmartOverlayPayload = {
  schemaVersion: 'smart-overlay-v1';
  symbol: string;
  timeframe: string;
  price: number;
  /** 배지 문구: 롱 대기 | 관망 | 숏 주의 | 진입 가능 */
  status: string;
  confidence: string;
  prob_long: number;
  prob_short: number;
  /** 바닥·안착 후보 구간 [low, high] */
  support_zone: [number, number] | null;
  /** 상단 저항 맥락 [low, high] (숏 편향 시 등) */
  resist_zone: [number, number] | null;
  entry_1: number | null;
  breakout_level: number | null;
  invalid: number | null;
  tp1: number | null;
  tp2: number | null;
  zones: SmartOverlayZone[];
  /** 카드 한 줄 요약 */
  comment: string;
  /** 짧은 맥락 칩(최대 14) — 세션·변동·TF·존·안착·흐름 등 */
  insights?: string[];
  scores?: SmartOverlayScoreBreakdown;
  /** 상승/하락 확정 3요소(구조·종가·유지) + 거래량 보조 */
  confirmation?: SmartOverlayConfirmation;
};
