import type { Candle } from '@/types';
import type { PatternVisionResult, PatternVisionType, PivotPoint, PatternLine, PatternZone } from '@/types/patternVision';
import { extractPivots, localHighs, localLows, slope } from './patternGeometry';

const MIN_CONFIDENCE = 50;
const MAX_PATTERNS_RETURN = 3;
const VISIBLE_MIN = 20;

function line(
  startIndex: number,
  startPrice: number,
  endIndex: number,
  endPrice: number,
  role: 'resistance' | 'support' | 'neckline'
): PatternLine {
  return { startIndex, startPrice, endIndex, endPrice, role };
}

function zone(leftIndex: number, rightIndex: number, top: number, bottom: number): PatternZone {
  return { leftIndex, rightIndex, top, bottom };
}

export function runPatternVision(candles: Candle[]): PatternVisionResult[] {
  if (!candles.length || candles.length < VISIBLE_MIN) return [];
  const pivots = extractPivots(candles);
  const highs = localHighs(pivots);
  const lows = localLows(pivots);
  const results: PatternVisionResult[] = [];
  const visible = candles.slice(-Math.min(200, candles.length));
  const range = Math.max(1e-9, Math.max(...visible.map((c) => c.high)) - Math.min(...visible.map((c) => c.low)));

  // Triangle: 2 highs, 2 lows, 수렴
  if (highs.length >= 2 && lows.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const start = Math.min(h1.index, l1.index);
    const end = Math.max(h2.index, l2.index);
    const upperSlope = slope(h1.index, h1.price, h2.index, h2.price);
    const lowerSlope = slope(l1.index, l1.price, l2.index, l2.price);
    const widthStart = Math.abs(h1.price - l1.price);
    const widthEnd = Math.abs(h2.price - l2.price);
    const converging = widthEnd < widthStart * 0.95;

    if (converging && upperSlope < 0 && lowerSlope > 0) {
      const conf = Math.min(100, 60 + Math.round((1 - widthEnd / widthStart) * 25));
      results.push({
        id: `vision-sym-${start}-${end}`,
        type: 'Symmetrical Triangle',
        bias: 'neutral',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '대칭삼각형',
        reason: '고점 하락·저점 상승으로 수렴',
      });
    } else if (converging && upperSlope > 0 && lowerSlope > 0) {
      results.push({
        id: `vision-asc-${start}-${end}`,
        type: 'Ascending Triangle',
        bias: 'bullish',
        confidence: Math.min(100, 65 + Math.round((1 - widthEnd / widthStart) * 20)),
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '상승삼각형',
        reason: '수평 저항·상승 지지선',
      });
    } else if (converging && upperSlope < 0 && lowerSlope < 0) {
      results.push({
        id: `vision-desc-${start}-${end}`,
        type: 'Descending Triangle',
        bias: 'bearish',
        confidence: Math.min(100, 65 + Math.round((1 - widthEnd / widthStart) * 20)),
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '하락삼각형',
        reason: '하락 저항·수평 지지',
      });
    }
  }

  // Wedge: 두 선 기울기 같은 방향, 수렴
  if (highs.length >= 2 && lows.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const start = Math.min(h1.index, l1.index);
    const end = Math.max(h2.index, l2.index);
    const us = slope(h1.index, h1.price, h2.index, h2.price);
    const ls = slope(l1.index, l1.price, l2.index, l2.price);
    const widthStart = Math.abs(h1.price - l1.price);
    const widthEnd = Math.abs(h2.price - l2.price);
    if (widthEnd < widthStart * 0.9 && us > 0 && ls > 0 && us > ls * 0.5) {
      results.push({
        id: `vision-rw-${start}-${end}`,
        type: 'Rising Wedge',
        bias: 'bearish',
        confidence: 68,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '상승웨지',
        reason: '상승 채널 수렴',
      });
    } else if (widthEnd < widthStart * 0.9 && us < 0 && ls < 0 && us < ls * 0.5) {
      results.push({
        id: `vision-fw-${start}-${end}`,
        type: 'Falling Wedge',
        bias: 'bullish',
        confidence: 68,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '하락웨지',
        reason: '하락 채널 수렴',
      });
    }
  }

  // Range / Box: 고저점 수평
  if (highs.length >= 2 && lows.length >= 2) {
    const lastH = highs[highs.length - 1];
    const prevH = highs[highs.length - 2];
    const lastL = lows[lows.length - 1];
    const prevL = lows[lows.length - 2];
    const tol = range * 0.015;
    if (
      Math.abs(lastH.price - prevH.price) < tol &&
      Math.abs(lastL.price - prevL.price) < tol
    ) {
    const start = Math.min(prevH.index, prevL.index);
    const end = Math.max(lastH.index, lastL.index);
      results.push({
        id: `vision-range-${start}-${end}`,
        type: 'Range',
        bias: 'neutral',
        confidence: 62,
        startIndex: start,
        endIndex: end,
        pivotPoints: [prevH, lastH, prevL, lastL],
        lines: [
          line(prevH.index, prevH.price, lastH.index, lastH.price, 'resistance'),
          line(prevL.index, prevL.price, lastL.index, lastL.price, 'support'),
        ],
        zones: [zone(start, end, Math.max(prevH.price, lastH.price), Math.min(prevL.price, lastL.price))],
        label: '레인지',
        reason: '수평 고저점 박스',
      });
    }
  }

  // Double Top / Bottom
  if (highs.length >= 3) {
    const [a, b, c] = highs.slice(-3);
    const tol = range * 0.012;
    if (Math.abs(a.price - c.price) < tol && b.price > a.price && b.price > c.price) {
    const start = a.index;
    const end = c.index;
      results.push({
        id: `vision-dt-${start}-${end}`,
        type: 'Double Top',
        bias: 'bearish',
        confidence: 70,
        startIndex: start,
        endIndex: end,
        pivotPoints: [a, b, c],
        lines: [
          line(a.index, a.price, c.index, c.price, 'neckline'),
        ],
        zones: [],
        label: '더블탑',
        reason: '두 번 고점 터치 후 하락',
      });
    }
  }
  if (lows.length >= 3) {
    const [a, b, c] = lows.slice(-3);
    const tol = range * 0.012;
    if (Math.abs(a.price - c.price) < tol && b.price < a.price && b.price < c.price) {
    const start = a.index;
    const end = c.index;
      results.push({
        id: `vision-db-${start}-${end}`,
        type: 'Double Bottom',
        bias: 'bullish',
        confidence: 70,
        startIndex: start,
        endIndex: end,
        pivotPoints: [a, b, c],
        lines: [
          line(a.index, a.price, c.index, c.price, 'neckline'),
        ],
        zones: [],
        label: '더블바텀',
        reason: '두 번 저점 터치 후 상승',
      });
    }
  }

  // Channel: 평행 추세선
  if (highs.length >= 2 && lows.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const us = slope(h1.index, h1.price, h2.index, h2.price);
    const ls = slope(l1.index, l1.price, l2.index, l2.price);
    const parallel = Math.abs(us - ls) / (Math.abs(us) + 1e-9) < 0.15;
    if (parallel && us > 0) {
    const start = Math.min(h1.index, l1.index);
    const end = Math.max(h2.index, l2.index);
      results.push({
        id: `vision-chup-${start}-${end}`,
        type: 'Channel Up',
        bias: 'bullish',
        confidence: 65,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '상승채널',
        reason: '상승 평행 채널',
      });
    } else if (parallel && us < 0) {
    const start = Math.min(h1.index, l1.index);
    const end = Math.max(h2.index, l2.index);
      results.push({
        id: `vision-chdn-${start}-${end}`,
        type: 'Channel Down',
        bias: 'bearish',
        confidence: 65,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: '하락채널',
        reason: '하락 평행 채널',
      });
    }
  }

  const filtered = results.filter((r) => r.confidence >= MIN_CONFIDENCE);
  const deduped = deduplicateByOverlap(filtered);
  return deduped
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PATTERNS_RETURN);
}

function overlapRatio(a: PatternVisionResult, b: PatternVisionResult): number {
  const start = Math.max(a.startIndex, b.startIndex);
  const end = Math.min(a.endIndex, b.endIndex);
  if (end <= start) return 0;
  const lenA = a.endIndex - a.startIndex || 1;
  return (end - start) / lenA;
}

function deduplicateByOverlap(list: PatternVisionResult[]): PatternVisionResult[] {
  const out: PatternVisionResult[] = [];
  for (const p of list) {
    const sameZone = out.some((q) => overlapRatio(p, q) > 0.5);
    if (!sameZone) out.push(p);
  }
  return out;
}

export function getDominantPattern(results: PatternVisionResult[]): PatternVisionResult | null {
  if (!results.length) return null;
  return results[0];
}

export function getPatternVisionSummary(results: PatternVisionResult[]): string {
  const top = results[0];
  if (!top) return '';
  return `현재 구조는 ${top.label}과(와) 유사`;
}
