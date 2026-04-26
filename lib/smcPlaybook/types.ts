/**
 * SMC 플레이북 타입 — 단계 id는 `playbook.steps.json` 과 동기화.
 */
export type SmcPlaybookStepId =
  | 'htf_poi'
  | 'bos'
  | 'idm'
  | 'lqs'
  | 'mss_choch'
  | 'ob_fvg'
  | 'ote'
  | 'ifvg'
  | 'ltf_poi'
  | 'lq_pool'
  | 'mitigation'
  | 'target';

export type SmcPlaybookStep = {
  order: number;
  id: SmcPlaybookStepId;
  labelKo: string;
  done: boolean;
};

export type SmcEntryPlaybook = {
  active: boolean;
  direction: 'LONG' | 'SHORT' | null;
  phaseLabel: string;
  detail: string;
  steps: SmcPlaybookStep[];
  zone: { low: number; high: number } | null;
  oteZone: { low: number; high: number } | null;
  inducement: { price: number; sideNote: string } | null;
  sweep: { index: number; price: number; side: 'buy' | 'sell' } | null;
  htfPoi: { low: number; high: number } | null;
  ltfPoi: { low: number; high: number } | null;
  ifvgZone: { low: number; high: number } | null;
  liquidityPoolTarget: number | null;
  mitigationTouched: boolean;
  /** 분석 타점 존의 중앙가 — 참고 */
  entryRefPrice: number | null;
  /** 무효화·손절 근사 — 참고용(자동) */
  stopPrice: number | null;
  /** TP1~3 — 분석 targets·지지/저항 정렬(플레이북). 비활성 시 null */
  targetPrices: [number | null, number | null, number | null] | null;
  /** 목표 산출 출처 요약 — 툴팁 */
  targetSourceNote: string;
  /** TP1과 동일(하위 호환) */
  targetPrice: number | null;
};

export type PlaybookStepDef = { order: number; id: string; labelKo: string };

export type PlaybookStepsFile = {
  schemaVersion: number;
  /** 라벨·순서·id 편집 시 UI/설정과 맞추는 계약 — 구조 변경 시 schemaVersion 상향 */
  doc?: string;
  short: PlaybookStepDef[];
  long: PlaybookStepDef[];
};

export type EngineSlice = {
  bos?: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number }>;
  choch?: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number }>;
  sweeps?: Array<{ side: 'buy' | 'sell'; index: number; price: number }>;
  fvg?: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number; valid: boolean }>;
  obs?: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number }>;
  eqh?: Array<{ a: number; b: number; price: number }>;
  eql?: Array<{ a: number; b: number; price: number }>;
};
