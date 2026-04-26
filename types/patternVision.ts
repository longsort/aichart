/** 패턴 비전 엔진 감지 결과 */
export type PatternVisionType =
  | 'Ascending Triangle'
  | 'Descending Triangle'
  | 'Symmetrical Triangle'
  | 'Bull Flag'
  | 'Bear Flag'
  | 'Rising Wedge'
  | 'Falling Wedge'
  | 'Broadening Formation'
  | 'Double Top'
  | 'Double Bottom'
  | 'Triple Top'
  | 'Triple Bottom'
  | 'Head and Shoulders'
  | 'Inverse Head and Shoulders'
  | 'Range'
  | 'Channel Up'
  | 'Channel Down'
  | 'V Bottom'
  | 'V Top';

export type PivotPoint = { index: number; price: number; type: 'high' | 'low' };

export type PatternLine = { startIndex: number; startPrice: number; endIndex: number; endPrice: number; role: 'resistance' | 'support' | 'neckline' | 'entry' | 'target' | 'stop' };

export type PatternZone = { leftIndex: number; rightIndex: number; top: number; bottom: number };

/** 프로스님 자료: Entry/TP/SL 가격 (LuxAlgo 스타일) */
export type PatternTarget = { type: 'entry' | 'tp' | 'sl'; price: number; startIndex?: number; endIndex?: number };

export type PatternVisionResult = {
  id: string;
  type: PatternVisionType;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  startIndex: number;
  endIndex: number;
  pivotPoints: PivotPoint[];
  lines: PatternLine[];
  zones: PatternZone[];
  label: string;
  reason: string;
  /** LuxAlgo 스타일: Entry/TP/SL 가격 라인 */
  targets?: PatternTarget[];
};

export type DominantPattern = {
  type: string;
  confidence: number;
  bias: string;
  label?: string;
  reason?: string;
} | null;
