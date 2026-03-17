/** 패턴 비전 엔진 감지 결과 */
export type PatternVisionType =
  | 'Ascending Triangle'
  | 'Descending Triangle'
  | 'Symmetrical Triangle'
  | 'Bull Flag'
  | 'Bear Flag'
  | 'Rising Wedge'
  | 'Falling Wedge'
  | 'Double Top'
  | 'Double Bottom'
  | 'Head and Shoulders'
  | 'Inverse Head and Shoulders'
  | 'Range'
  | 'Channel Up'
  | 'Channel Down'
  | 'V Bottom'
  | 'V Top';

export type PivotPoint = { index: number; price: number; type: 'high' | 'low' };

export type PatternLine = { startIndex: number; startPrice: number; endIndex: number; endPrice: number; role: 'resistance' | 'support' | 'neckline' };

export type PatternZone = { leftIndex: number; rightIndex: number; top: number; bottom: number };

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
};

export type DominantPattern = {
  type: string;
  confidence: number;
  bias: string;
  label?: string;
  reason?: string;
} | null;
