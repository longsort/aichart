/**
 * 파동 이동경로 템플릿 카탈로그 (1차).
 * Impulse 1–5 · ZigZag/Flat ABC + 피보 비율.
 * 확정 경로·승률 아님 — 조건부 매칭용 상수만.
 */

export type WavePathKind = 'impulse' | 'zigzag' | 'flat';
export type WavePathBias = 'bullish' | 'bearish';

/** 레그 목표 — 기준 레그 대비 가격 비율(절댓값) */
export type WavePathLegSpec = {
  /** 표시 라벨 */
  label: string;
  /** 피보 비율 (예: W2 = 0.618 × W1) */
  ratioOf: number;
  /** 기준: 직전 임펄스 레그 인덱스(0=W1) 또는 'A' */
  base: 'w1' | 'w3' | 'A' | 'prev';
  /** 되돌림이면 true, 확장이면 false */
  retrace: boolean;
  /** 예상 봉수 배율(직전 레그 봉수 ×) */
  barsMult: number;
};

export type WavePathTemplate = {
  id: string;
  kind: WavePathKind;
  bias: WavePathBias;
  labelKo: string;
  /** 완료에 필요한 최소 피벗 수 (시작점 포함) */
  minPivots: number;
  /** 다음 레그 투영 스펙 (현재 위상 이후) */
  nextLegs: WavePathLegSpec[];
  /** B/A, C/A 등 매칭용 허용 비율 구간 */
  matchHints?: {
    bOfA?: [number, number];
    cOfA?: [number, number];
    w2OfW1?: [number, number];
    w4OfW3?: [number, number];
    w5OfW1?: [number, number];
  };
};

/** 충격파 — 롱 */
const IMPULSE_BULL: WavePathTemplate = {
  id: 'impulse-bull-5',
  kind: 'impulse',
  bias: 'bullish',
  labelKo: '충격상승 1–5',
  minPivots: 3,
  nextLegs: [
    { label: '②', ratioOf: 0.618, base: 'w1', retrace: true, barsMult: 0.9 },
    { label: '③', ratioOf: 1.618, base: 'w1', retrace: false, barsMult: 1.2 },
    { label: '④', ratioOf: 0.382, base: 'w3', retrace: true, barsMult: 0.7 },
    { label: '⑤', ratioOf: 1.0, base: 'w1', retrace: false, barsMult: 1.0 },
  ],
  matchHints: {
    w2OfW1: [0.382, 0.786],
    w4OfW3: [0.236, 0.5],
    w5OfW1: [0.618, 1.618],
  },
};

/** 충격파 — 숏 */
const IMPULSE_BEAR: WavePathTemplate = {
  id: 'impulse-bear-5',
  kind: 'impulse',
  bias: 'bearish',
  labelKo: '충격하락 1–5',
  minPivots: 3,
  nextLegs: [
    { label: '②', ratioOf: 0.618, base: 'w1', retrace: true, barsMult: 0.9 },
    { label: '③', ratioOf: 1.618, base: 'w1', retrace: false, barsMult: 1.2 },
    { label: '④', ratioOf: 0.382, base: 'w3', retrace: true, barsMult: 0.7 },
    { label: '⑤', ratioOf: 1.0, base: 'w1', retrace: false, barsMult: 1.0 },
  ],
  matchHints: {
    w2OfW1: [0.382, 0.786],
    w4OfW3: [0.236, 0.5],
    w5OfW1: [0.618, 1.618],
  },
};

const ZIGZAG_BULL: WavePathTemplate = {
  id: 'zigzag-bull',
  kind: 'zigzag',
  bias: 'bullish',
  labelKo: 'ZigZag 조정(상승추세 속)',
  minPivots: 2,
  nextLegs: [
    { label: 'B', ratioOf: 0.5, base: 'A', retrace: true, barsMult: 0.8 },
    { label: 'C', ratioOf: 1.0, base: 'A', retrace: false, barsMult: 1.0 },
  ],
  matchHints: {
    bOfA: [0.382, 0.618],
    cOfA: [0.786, 1.272],
  },
};

const ZIGZAG_BEAR: WavePathTemplate = {
  id: 'zigzag-bear',
  kind: 'zigzag',
  bias: 'bearish',
  labelKo: 'ZigZag 조정(하락추세 속)',
  minPivots: 2,
  nextLegs: [
    { label: 'B', ratioOf: 0.5, base: 'A', retrace: true, barsMult: 0.8 },
    { label: 'C', ratioOf: 1.0, base: 'A', retrace: false, barsMult: 1.0 },
  ],
  matchHints: {
    bOfA: [0.382, 0.618],
    cOfA: [0.786, 1.272],
  },
};

const FLAT_BULL: WavePathTemplate = {
  id: 'flat-bull',
  kind: 'flat',
  bias: 'bullish',
  labelKo: 'Flat 조정(상승추세 속)',
  minPivots: 2,
  nextLegs: [
    { label: 'B', ratioOf: 0.9, base: 'A', retrace: true, barsMult: 1.0 },
    { label: 'C', ratioOf: 1.0, base: 'A', retrace: false, barsMult: 1.1 },
  ],
  matchHints: {
    bOfA: [0.8, 1.05],
    cOfA: [0.9, 1.272],
  },
};

const FLAT_BEAR: WavePathTemplate = {
  id: 'flat-bear',
  kind: 'flat',
  bias: 'bearish',
  labelKo: 'Flat 조정(하락추세 속)',
  minPivots: 2,
  nextLegs: [
    { label: 'B', ratioOf: 0.9, base: 'A', retrace: true, barsMult: 1.0 },
    { label: 'C', ratioOf: 1.0, base: 'A', retrace: false, barsMult: 1.1 },
  ],
  matchHints: {
    bOfA: [0.8, 1.05],
    cOfA: [0.9, 1.272],
  },
};

/** 1차 카탈로그 — Leading Diagonal 등은 2차 */
export const MERGED_DESK_WAVE_PATH_CATALOG: WavePathTemplate[] = [
  IMPULSE_BULL,
  IMPULSE_BEAR,
  ZIGZAG_BULL,
  ZIGZAG_BEAR,
  FLAT_BULL,
  FLAT_BEAR,
];

export function wavePathTemplatesForBias(bias: WavePathBias): WavePathTemplate[] {
  return MERGED_DESK_WAVE_PATH_CATALOG.filter((t) => t.bias === bias);
}

export function wavePathTemplateById(id: string): WavePathTemplate | null {
  return MERGED_DESK_WAVE_PATH_CATALOG.find((t) => t.id === id) ?? null;
}
