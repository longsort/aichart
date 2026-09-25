import type { Candle } from '@/types';
import type { PatternVisionResult, PivotPoint, PatternLine, PatternZone, PatternTarget } from '@/types/patternVision';
import { extractPivots, localHighs, localLows, slope } from './patternGeometry';

const MIN_CONFIDENCE = 70;
const MAX_PATTERNS_RETURN = 2;
const VISIBLE_MIN = 20;

/** 프로스님 자료: 고점/저점 편차 ±3~4% */
const PEAK_DEVIATION = 0.04;
/** 프로스님 자료: 되돌림 10~20% */
const RETRACE_MIN = 0.10;
const RETRACE_MAX = 0.20;

type LineRole = PatternLine['role'];

function line(startIndex: number, startPrice: number, endIndex: number, endPrice: number, role: LineRole): PatternLine {
  return { startIndex, startPrice, endIndex, endPrice, role };
}

function zone(leftIndex: number, rightIndex: number, top: number, bottom: number): PatternZone {
  return { leftIndex, rightIndex, top, bottom };
}

/** 피벗을 인덱스 순으로 정렬 후 H/L 시퀀스 검색용 */
function pivotsInOrder(pivots: PivotPoint[]): PivotPoint[] {
  return [...pivots].sort((a, b) => a.index - b.index);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function avgVolume(candles: Candle[], from: number, to: number): number {
  const s = candles.slice(Math.max(0, from), Math.min(candles.length, to));
  if (!s.length) return 0;
  const sum = s.reduce((acc, c) => acc + (c.volume ?? 0), 0);
  return sum / s.length;
}

function gradeFromConfidence(confidence: number): 'A' | 'B' | 'C' {
  if (confidence >= 80) return 'A';
  if (confidence >= 65) return 'B';
  return 'C';
}

function appendOrReplaceGrade(label: string, grade: 'A' | 'B' | 'C'): string {
  if (/\[[ABC]\]/.test(label)) return label.replace(/\[[ABC]\]/, `[${grade}]`);
  return `${label} [${grade}]`;
}

function unifyPatternScore(candles: Candle[], p: PatternVisionResult): {
  confidence: number;
  grade: 'A' | 'B' | 'C';
  breakout: boolean;
  volumeOk: boolean;
  htfAligned: boolean;
} {
  const neckline = p.lines.find((l) => l.role === 'neckline');
  const maxPivot = p.pivotPoints.length ? Math.max(...p.pivotPoints.map((q) => q.price)) : 0;
  const minPivot = p.pivotPoints.length ? Math.min(...p.pivotPoints.map((q) => q.price)) : 0;
  const ref =
    neckline?.startPrice ??
    (p.bias === 'bullish' ? maxPivot : p.bias === 'bearish' ? minPivot : (maxPivot + minPivot) / 2);
  const after = candles.slice(p.endIndex + 1);
  const upBreak = after.find((c) => c.close > ref * 1.0005);
  const downBreak = after.find((c) => c.close < ref * 0.9995);
  const breakout =
    p.bias === 'bullish'
      ? !!upBreak
      : p.bias === 'bearish'
        ? !!downBreak
        : !!upBreak || !!downBreak;
  const breakCandle = p.bias === 'bullish' ? upBreak : p.bias === 'bearish' ? downBreak : (upBreak ?? downBreak);
  const breakIdx = breakCandle ? candles.indexOf(breakCandle) : p.endIndex;
  const breakVol = breakCandle?.volume ?? 0;
  const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
  const volumeOk = breakout && avgVol20 > 0 && breakVol / avgVol20 >= 1.05;
  const trendWindow = candles.slice(Math.max(0, p.startIndex - 60), p.startIndex);
  const trendSlope =
    trendWindow.length > 1
      ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close)
      : 0;
  const htfAligned =
    p.bias === 'bullish' ? trendSlope >= 0 : p.bias === 'bearish' ? trendSlope <= 0 : Math.abs(trendSlope) < 0.03;
  const shapeScore = ((p.confidence - 50) / 50) * 25;
  const total = 48 + shapeScore + (breakout ? 12 : -6) + (volumeOk ? 8 : 0) + (htfAligned ? 7 : 0);
  const confidence = clamp(Math.round(total), 50, 95);
  return { confidence, grade: gradeFromConfidence(confidence), breakout, volumeOk, htfAligned };
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
    const converging = widthEnd < widthStart * 0.93;

    if (converging && upperSlope < 0 && lowerSlope > 0) {
      const conf = Math.min(100, 60 + Math.round((1 - widthEnd / widthStart) * 25));
      const patternLen = end - start;
      const breakout80Idx = start + Math.round(patternLen * 0.8);
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
        zones: [zone(breakout80Idx, end, h2.price, l2.price)],
        label: '대칭삼각형 (80% 돌파구간)',
        reason: '고점 하락·저점 상승 수렴, 80% 근처 이탈 다발',
      });
    } else if (converging && upperSlope > 0 && lowerSlope > 0) {
      const patternLen = end - start;
      const breakout80Idx = start + Math.round(patternLen * 0.8);
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
        zones: [zone(breakout80Idx, end, h2.price, l2.price)],
        label: '상승삼각형 (80% 돌파)',
        reason: '수평 저항·상승 지지, 80% 근처 상방 돌파',
      });
    } else if (converging && upperSlope < 0 && lowerSlope < 0) {
      const patternLen = end - start;
      const breakout80Idx = start + Math.round(patternLen * 0.8);
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
        zones: [zone(breakout80Idx, end, h2.price, l2.price)],
        label: '하락삼각형 (80% 돌파)',
        reason: '하락 저항·수평 지지, 80% 근처 하방 돌파',
      });
    }
  }

  // Flag (깃발) — 프로스님 5점: pole + 평행 채널, 되돌림 ≤50%(이상 38%), Entry/TP
  if (highs.length >= 2 && lows.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const us = slope(h1.index, h1.price, h2.index, h2.price);
    const ls = slope(l1.index, l1.price, l2.index, l2.price);
    const parallel = Math.abs(us - ls) / (Math.abs(us) + 1e-9) < 0.12;
    const start = Math.min(h1.index, l1.index);
    const poleLow = Math.min(...candles.slice(Math.max(0, start - 30), start).map((c) => c.low), l1.price);
    const poleHigh = Math.max(...candles.slice(Math.max(0, start - 30), start).map((c) => c.high), h1.price);
    const poleRange = poleHigh - poleLow;
    const flagTop = Math.max(h1.price, h2.price);
    const flagBottom = Math.min(l1.price, l2.price);
    const retracement = poleRange > 0 ? (poleHigh - flagBottom) / poleRange : 0;
    const retracementBear = poleRange > 0 ? (flagTop - poleLow) / poleRange : 0;
    if (parallel && poleRange > range * 0.05) {
      const end = Math.max(h2.index, l2.index);
      const isBull = us <= 0 && ls <= 0 && retracement <= 0.5 && retracement >= 0.05;
      const isBear = us >= 0 && ls >= 0 && retracementBear <= 0.5 && retracementBear >= 0.05;
      if (isBull || isBear) {
        const rt = isBull ? retracement : retracementBear;
        const entryPrice = isBull ? (l1.price + l2.price) / 2 : (h1.price + h2.price) / 2;
        const tpPrice = isBull ? entryPrice + poleRange : entryPrice - poleRange;
        results.push({
          id: `vision-flag-${start}-${end}`,
          type: isBull ? 'Bull Flag' : 'Bear Flag',
          bias: isBull ? 'bullish' : 'bearish',
          confidence: Math.min(100, 65 + Math.round((0.5 - rt) * 40)),
          startIndex: start,
          endIndex: end,
          pivotPoints: [h1, h2, l1, l2],
          lines: [
            line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
            line(l1.index, l1.price, l2.index, l2.price, 'support'),
          ],
          zones: [zone(start, end, flagTop, flagBottom)],
          label: isBull ? '불플래그 (목표참고)' : '베어플래그 (목표참고)',
          reason: `되돌림 ${Math.round(rt * 100)}% ≤50%, 평행채널`,
          targets: [
            { type: 'entry', price: entryPrice, startIndex: end },
            { type: 'tp', price: tpPrice, startIndex: end },
          ],
        });
      }
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
    if (widthEnd < widthStart * 0.85 && us > 0 && ls > 0 && us > ls * 0.5) {
      const breakCandle = candles.slice(end + 1).find((c) => c.close < l2.price * 0.9995);
      const breakout = !!breakCandle;
      const breakIdx = breakout ? candles.indexOf(breakCandle) : end;
      const breakVol = breakout ? (breakCandle?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volumeOk = breakout && avgVol20 > 0 && breakVol / avgVol20 >= 1.05;
      const trendWindow = candles.slice(Math.max(0, start - 40), start);
      const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
      const htfAligned = trendSlope > 0;
      const score = 56 + (1 - widthEnd / Math.max(1e-9, widthStart)) * 18 + (breakout ? 14 : -4) + (volumeOk ? 5 : 0) + (htfAligned ? 4 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      results.push({
        id: `vision-rw-${start}-${end}`,
        type: 'Rising Wedge',
        bias: 'bearish',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: `상승웨지 (${breakout ? '하방 이탈 확인' : '이탈 대기'}) [${grade}]`,
        reason: `상승 채널 수렴${breakout ? ', 하방 이탈 확인' : ''}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
      });
    } else if (widthEnd < widthStart * 0.85 && us < 0 && ls < 0 && us < ls * 0.5) {
      const breakCandle = candles.slice(end + 1).find((c) => c.close > h2.price * 1.0005);
      const breakout = !!breakCandle;
      const breakIdx = breakout ? candles.indexOf(breakCandle) : end;
      const breakVol = breakout ? (breakCandle?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volumeOk = breakout && avgVol20 > 0 && breakVol / avgVol20 >= 1.05;
      const trendWindow = candles.slice(Math.max(0, start - 40), start);
      const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
      const htfAligned = trendSlope < 0;
      const score = 56 + (1 - widthEnd / Math.max(1e-9, widthStart)) * 18 + (breakout ? 14 : -4) + (volumeOk ? 5 : 0) + (htfAligned ? 4 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      results.push({
        id: `vision-fw-${start}-${end}`,
        type: 'Falling Wedge',
        bias: 'bullish',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: `하락웨지 (${breakout ? '상방 이탈 확인' : '이탈 대기'}) [${grade}]`,
        reason: `하락 채널 수렴${breakout ? ', 상방 이탈 확인' : ''}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
      });
    } else if (widthEnd > widthStart * 1.1 && us > 0 && ls < 0) {
      const breakAbove = candles.slice(end + 1).find((c) => c.close > h2.price * 1.0008);
      const breakBelow = candles.slice(end + 1).find((c) => c.close < l2.price * 0.9992);
      const bullishBreak = !!breakAbove && (!breakBelow || (breakAbove.time ?? 0) <= (breakBelow.time ?? 0));
      const bearishBreak = !!breakBelow && (!breakAbove || (breakBelow.time ?? 0) < (breakAbove.time ?? 0));
      const breakIdx = bullishBreak ? candles.indexOf(breakAbove!) : bearishBreak ? candles.indexOf(breakBelow!) : end;
      const breakVol = bullishBreak ? (breakAbove?.volume ?? 0) : bearishBreak ? (breakBelow?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volumeOk = (bullishBreak || bearishBreak) && avgVol20 > 0 && breakVol / avgVol20 >= 1.05;
      const score = 54 + (widthEnd / Math.max(1e-9, widthStart) - 1) * 24 + ((bullishBreak || bearishBreak) ? 14 : -4) + (volumeOk ? 6 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      results.push({
        id: `vision-brd-${start}-${end}`,
        type: 'Broadening Formation',
        bias: bullishBreak ? 'bullish' : bearishBreak ? 'bearish' : 'neutral',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [zone(start, end, Math.max(h1.price, h2.price), Math.min(l1.price, l2.price))],
        label: `확장형 (${bullishBreak ? '상방 이탈 확인' : bearishBreak ? '하방 이탈 확인' : '이탈 대기'}) [${grade}]`,
        reason: `변동폭 확대 구조${bullishBreak ? ', 상방 이탈 확인' : bearishBreak ? ', 하방 이탈 확인' : ''}${volumeOk ? ', 거래량 확인' : ''}`,
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

  // Double Top (M) — 프로스님: 2 peaks, valley between, 10-20% retracement, ±3-4% peak deviation
  const ordered = pivotsInOrder(pivots);
  const visibleEnd = candles.length - 1;
  for (let i = ordered.length - 3; i >= 0; i--) {
    const [p1, p2, p3] = [ordered[i], ordered[i + 1], ordered[i + 2]];
    if (p3.index < visibleEnd - 50) break;
    if (p1.type === 'high' && p2.type === 'low' && p3.type === 'high') {
      const peakAvg = (p1.price + p3.price) / 2;
      const deviation = Math.abs(p1.price - p3.price) / peakAvg;
      const retracement = (peakAvg - p2.price) / peakAvg;
      if (deviation <= PEAK_DEVIATION && retracement >= RETRACE_MIN && retracement <= RETRACE_MAX) {
        const neck = p2.price;
        const tp = neck - (peakAvg - neck);
        const sl = Math.max(p1.price, p3.price) * 1.002;
        const breakCandle = candles.slice(p3.index + 1).find((c) => c.close < neck * 0.9995);
        const necklineBroken = !!breakCandle;
        const breakIdx = necklineBroken ? candles.indexOf(breakCandle) : p3.index;
        const breakVol = necklineBroken ? (breakCandle?.volume ?? 0) : 0;
        const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
        const volRatio = avgVol20 > 0 ? breakVol / avgVol20 : 1;
        const volumeOk = necklineBroken && volRatio >= 1.05;
        const trendWindow = candles.slice(Math.max(0, p1.index - 40), p1.index);
        const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
        const htfAligned = trendSlope > 0;
        const score =
          55
          + (1 - deviation / PEAK_DEVIATION) * 12
          + (1 - Math.abs(retracement - 0.15) / 0.15) * 10
          + (necklineBroken ? 16 : -6)
          + (volumeOk ? 5 : 0)
          + (htfAligned ? 4 : 0);
        const conf = clamp(Math.round(score), 50, 95);
        const grade = gradeFromConfidence(conf);
        results.push({
          id: `vision-dt-${p1.index}-${p3.index}`,
          type: 'Double Top',
          bias: 'bearish',
          confidence: conf,
          startIndex: p1.index,
          endIndex: p3.index,
          pivotPoints: [p1, p2, p3],
          lines: [line(p1.index, neck, p3.index, neck, 'neckline')],
          zones: [],
          label: `더블탑 (M, ${necklineBroken ? '넥라인 하향 이탈 확인' : '넥라인 이탈 대기'}) [${grade}]`,
          reason: `10-20% 되돌림, 고점 편차 ±4%, 넥라인 ${necklineBroken ? '하향 이탈 확인' : '대기'}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
          targets: [
            { type: 'entry', price: neck, startIndex: p3.index },
            { type: 'tp', price: tp, startIndex: p3.index },
            { type: 'sl', price: sl, startIndex: p3.index },
          ],
        });
        break;
      }
    }
  }

  // Double Bottom (W) — 프로스님: 2 valleys, peak between
  for (let i = ordered.length - 3; i >= 0; i--) {
    const [p1, p2, p3] = [ordered[i], ordered[i + 1], ordered[i + 2]];
    if (p3.index < visibleEnd - 50) break;
    if (p1.type === 'low' && p2.type === 'high' && p3.type === 'low') {
      const valleyAvg = (p1.price + p3.price) / 2;
      const deviation = Math.abs(p1.price - p3.price) / (valleyAvg || 1e-9);
      const retracement = (p2.price - valleyAvg) / (valleyAvg || 1e-9);
      if (deviation <= PEAK_DEVIATION && retracement >= RETRACE_MIN && retracement <= RETRACE_MAX) {
        const neck = p2.price;
        const tp = neck + (neck - valleyAvg);
        const sl = Math.min(p1.price, p3.price) * 0.998;
        const breakCandle = candles.slice(p3.index + 1).find((c) => c.close > neck * 1.0005);
        const necklineBroken = !!breakCandle;
        const breakIdx = necklineBroken ? candles.indexOf(breakCandle) : p3.index;
        const breakVol = necklineBroken ? (breakCandle?.volume ?? 0) : 0;
        const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
        const volRatio = avgVol20 > 0 ? breakVol / avgVol20 : 1;
        const volumeOk = necklineBroken && volRatio >= 1.05;
        const trendWindow = candles.slice(Math.max(0, p1.index - 40), p1.index);
        const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
        const htfAligned = trendSlope < 0;
        const score =
          55
          + (1 - deviation / PEAK_DEVIATION) * 12
          + (1 - Math.abs(retracement - 0.15) / 0.15) * 10
          + (necklineBroken ? 16 : -6)
          + (volumeOk ? 5 : 0)
          + (htfAligned ? 4 : 0);
        const conf = clamp(Math.round(score), 50, 95);
        const grade = gradeFromConfidence(conf);
        results.push({
          id: `vision-db-${p1.index}-${p3.index}`,
          type: 'Double Bottom',
          bias: 'bullish',
          confidence: conf,
          startIndex: p1.index,
          endIndex: p3.index,
          pivotPoints: [p1, p2, p3],
          lines: [line(p1.index, neck, p3.index, neck, 'neckline')],
          zones: [],
          label: `더블바텀 (W, ${necklineBroken ? '넥라인 상향 이탈 확인' : '넥라인 이탈 대기'}) [${grade}]`,
          reason: `10-20% 되돌림, 저점 편차 ±4%, 넥라인 ${necklineBroken ? '상향 이탈 확인' : '대기'}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
          targets: [
            { type: 'entry', price: neck, startIndex: p3.index },
            { type: 'tp', price: tp, startIndex: p3.index },
            { type: 'sl', price: sl, startIndex: p3.index },
          ],
        });
        break;
      }
    }
  }

  // Triple Top — H-L-H-L-H, neckline(two lows) 하향 이탈 확인
  for (let i = ordered.length - 5; i >= 0; i--) {
    const [p1, p2, p3, p4, p5] = [ordered[i], ordered[i + 1], ordered[i + 2], ordered[i + 3], ordered[i + 4]];
    if (p5.index < visibleEnd - 80) break;
    if (p1.type === 'high' && p2.type === 'low' && p3.type === 'high' && p4.type === 'low' && p5.type === 'high') {
      const peaks = [p1.price, p3.price, p5.price];
      const peakAvg = peaks.reduce((a, b) => a + b, 0) / peaks.length;
      const peakDeviation = Math.max(...peaks.map((x) => Math.abs(x - peakAvg) / Math.max(1e-9, peakAvg)));
      const neck = (p2.price + p4.price) / 2;
      const retracement = (peakAvg - neck) / Math.max(1e-9, peakAvg);
      if (peakDeviation <= 0.05 && retracement >= 0.08 && retracement <= 0.28) {
        const tp = neck - (peakAvg - neck);
        const sl = Math.max(...peaks) * 1.002;
        const breakCandle = candles.slice(p5.index + 1).find((c) => c.close < neck * 0.9995);
        const necklineBroken = !!breakCandle;
        const breakIdx = necklineBroken ? candles.indexOf(breakCandle) : p5.index;
        const breakVol = necklineBroken ? (breakCandle?.volume ?? 0) : 0;
        const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
        const volRatio = avgVol20 > 0 ? breakVol / avgVol20 : 1;
        const volumeOk = necklineBroken && volRatio >= 1.05;
        const trendWindow = candles.slice(Math.max(0, p1.index - 40), p1.index);
        const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
        const htfAligned = trendSlope > 0;
        const score =
          57
          + (1 - peakDeviation / 0.05) * 10
          + (1 - Math.abs(retracement - 0.15) / 0.2) * 9
          + (necklineBroken ? 16 : -6)
          + (volumeOk ? 5 : 0)
          + (htfAligned ? 4 : 0);
        const conf = clamp(Math.round(score), 50, 95);
        const grade = gradeFromConfidence(conf);
        results.push({
          id: `vision-tt-${p1.index}-${p5.index}`,
          type: 'Triple Top',
          bias: 'bearish',
          confidence: conf,
          startIndex: p1.index,
          endIndex: p5.index,
          pivotPoints: [p1, p2, p3, p4, p5],
          lines: [line(p2.index, neck, p5.index, neck, 'neckline')],
          zones: [],
          label: `삼중천정 (${necklineBroken ? '넥라인 하향 이탈 확인' : '넥라인 이탈 대기'}) [${grade}]`,
          reason: `세 고점 정렬, 넥라인 ${necklineBroken ? '하향 이탈 확인' : '대기'}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
          targets: [
            { type: 'entry', price: neck, startIndex: p5.index },
            { type: 'tp', price: tp, startIndex: p5.index },
            { type: 'sl', price: sl, startIndex: p5.index },
          ],
        });
        break;
      }
    }
  }

  // Triple Bottom — L-H-L-H-L, neckline(two highs) 상향 이탈 확인
  for (let i = ordered.length - 5; i >= 0; i--) {
    const [p1, p2, p3, p4, p5] = [ordered[i], ordered[i + 1], ordered[i + 2], ordered[i + 3], ordered[i + 4]];
    if (p5.index < visibleEnd - 80) break;
    if (p1.type === 'low' && p2.type === 'high' && p3.type === 'low' && p4.type === 'high' && p5.type === 'low') {
      const valleys = [p1.price, p3.price, p5.price];
      const valleyAvg = valleys.reduce((a, b) => a + b, 0) / valleys.length;
      const valleyDeviation = Math.max(...valleys.map((x) => Math.abs(x - valleyAvg) / Math.max(1e-9, valleyAvg)));
      const neck = (p2.price + p4.price) / 2;
      const retracement = (neck - valleyAvg) / Math.max(1e-9, valleyAvg);
      if (valleyDeviation <= 0.05 && retracement >= 0.08 && retracement <= 0.28) {
        const tp = neck + (neck - valleyAvg);
        const sl = Math.min(...valleys) * 0.998;
        const breakCandle = candles.slice(p5.index + 1).find((c) => c.close > neck * 1.0005);
        const necklineBroken = !!breakCandle;
        const breakIdx = necklineBroken ? candles.indexOf(breakCandle) : p5.index;
        const breakVol = necklineBroken ? (breakCandle?.volume ?? 0) : 0;
        const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
        const volRatio = avgVol20 > 0 ? breakVol / avgVol20 : 1;
        const volumeOk = necklineBroken && volRatio >= 1.05;
        const trendWindow = candles.slice(Math.max(0, p1.index - 40), p1.index);
        const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
        const htfAligned = trendSlope < 0;
        const score =
          57
          + (1 - valleyDeviation / 0.05) * 10
          + (1 - Math.abs(retracement - 0.15) / 0.2) * 9
          + (necklineBroken ? 16 : -6)
          + (volumeOk ? 5 : 0)
          + (htfAligned ? 4 : 0);
        const conf = clamp(Math.round(score), 50, 95);
        const grade = gradeFromConfidence(conf);
        results.push({
          id: `vision-tb-${p1.index}-${p5.index}`,
          type: 'Triple Bottom',
          bias: 'bullish',
          confidence: conf,
          startIndex: p1.index,
          endIndex: p5.index,
          pivotPoints: [p1, p2, p3, p4, p5],
          lines: [line(p2.index, neck, p5.index, neck, 'neckline')],
          zones: [],
          label: `삼중바닥 (${necklineBroken ? '넥라인 상향 이탈 확인' : '넥라인 이탈 대기'}) [${grade}]`,
          reason: `세 저점 정렬, 넥라인 ${necklineBroken ? '상향 이탈 확인' : '대기'}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
          targets: [
            { type: 'entry', price: neck, startIndex: p5.index },
            { type: 'tp', price: tp, startIndex: p5.index },
            { type: 'sl', price: sl, startIndex: p5.index },
          ],
        });
        break;
      }
    }
  }

  // Head & Shoulders — 프로스님 6점: LS < Head > RS, Neck, Stop=RS, Target=Head-Neck
  if (highs.length >= 3) {
    const [a, b, c] = highs.slice(-3);
    if (b.price > a.price && b.price > c.price) {
      const lowsBetween = lows.filter((l) => l.index > a.index && l.index < c.index);
      const neckPrice = lowsBetween.length ? lowsBetween.reduce((s, x) => s + x.price, 0) / lowsBetween.length : (a.price + c.price) / 2;
      const targetPrice = neckPrice - (b.price - neckPrice);
      const stopPrice = c.price * 1.002;
      const shoulderDelta = Math.abs(a.price - c.price) / Math.max(1e-9, (a.price + c.price) / 2);
      const breakCandle = candles.slice(c.index + 1).find((x) => x.close < neckPrice * 0.9995);
      const necklineBroken = !!breakCandle;
      const breakIdx = necklineBroken ? candles.indexOf(breakCandle) : c.index;
      const breakVol = necklineBroken ? (breakCandle?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volRatio = avgVol20 > 0 ? breakVol / avgVol20 : 1;
      const volumeOk = necklineBroken && volRatio >= 1.05;
      const trendWindow = candles.slice(Math.max(0, a.index - 40), a.index);
      const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
      const htfAligned = trendSlope > 0;
      const score =
        56
        + (1 - shoulderDelta / 0.06) * 10
        + (necklineBroken ? 16 : -6)
        + (volumeOk ? 6 : 0)
        + (htfAligned ? 5 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      const start = a.index;
      const end = c.index;
      results.push({
        id: `vision-hs-${start}-${end}`,
        type: 'Head and Shoulders',
        bias: 'bearish',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [a, b, c],
        lines: [
          line(a.index, neckPrice, c.index, neckPrice, 'neckline'),
          line(c.index, stopPrice, end + 20, stopPrice, 'stop'),
        ],
        zones: [],
        label: `헤드앤숄더 (${necklineBroken ? '넥라인 하향 이탈 확인' : '넥라인 이탈 대기'}) [${grade}]`,
        reason: `Head·LS·RS, Neck 하방 목표, 넥라인 ${necklineBroken ? '하향 이탈 확인' : '대기'}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
        targets: [
          { type: 'entry', price: neckPrice, startIndex: c.index },
          { type: 'tp', price: targetPrice, startIndex: c.index },
          { type: 'sl', price: stopPrice, startIndex: c.index },
        ],
      });
    }
  }
  // Inverse Head & Shoulders
  if (lows.length >= 3) {
    const [a, b, c] = lows.slice(-3);
    if (b.price < a.price && b.price < c.price) {
      const highsBetween = highs.filter((h) => h.index > a.index && h.index < c.index);
      const neckPrice = highsBetween.length ? highsBetween.reduce((s, x) => s + x.price, 0) / highsBetween.length : (a.price + c.price) / 2;
      const targetPrice = neckPrice + (neckPrice - b.price);
      const stopPrice = c.price * 0.998;
      const shoulderDelta = Math.abs(a.price - c.price) / Math.max(1e-9, (a.price + c.price) / 2);
      const breakCandle = candles.slice(c.index + 1).find((x) => x.close > neckPrice * 1.0005);
      const necklineBroken = !!breakCandle;
      const breakIdx = necklineBroken ? candles.indexOf(breakCandle) : c.index;
      const breakVol = necklineBroken ? (breakCandle?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volRatio = avgVol20 > 0 ? breakVol / avgVol20 : 1;
      const volumeOk = necklineBroken && volRatio >= 1.05;
      const trendWindow = candles.slice(Math.max(0, a.index - 40), a.index);
      const trendSlope = trendWindow.length > 1 ? (trendWindow[trendWindow.length - 1].close - trendWindow[0].close) / Math.max(1e-9, trendWindow[0].close) : 0;
      const htfAligned = trendSlope < 0;
      const score =
        56
        + (1 - shoulderDelta / 0.06) * 10
        + (necklineBroken ? 16 : -6)
        + (volumeOk ? 6 : 0)
        + (htfAligned ? 5 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      const start = a.index;
      const end = c.index;
      results.push({
        id: `vision-ihs-${start}-${end}`,
        type: 'Inverse Head and Shoulders',
        bias: 'bullish',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [a, b, c],
        lines: [
          line(a.index, neckPrice, c.index, neckPrice, 'neckline'),
          line(c.index, stopPrice, end + 20, stopPrice, 'stop'),
        ],
        zones: [],
        label: `역헤드앤숄더 (${necklineBroken ? '넥라인 상향 이탈 확인' : '넥라인 이탈 대기'}) [${grade}]`,
        reason: `Head·LS·RS, Neck 상방 목표, 넥라인 ${necklineBroken ? '상향 이탈 확인' : '대기'}${volumeOk ? ', 거래량 확인' : ''}${htfAligned ? ', HTF 정렬' : ''}`,
        targets: [
          { type: 'entry', price: neckPrice, startIndex: c.index },
          { type: 'tp', price: targetPrice, startIndex: c.index },
          { type: 'sl', price: stopPrice, startIndex: c.index },
        ],
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
    const parallel = Math.abs(us - ls) / (Math.abs(us) + 1e-9) < 0.1;
    if (parallel && us > 0) {
      const start = Math.min(h1.index, l1.index);
      const end = Math.max(h2.index, l2.index);
      const breakCandle = candles.slice(end + 1).find((c) => c.close < l2.price * 0.9995);
      const breakout = !!breakCandle;
      const breakIdx = breakout ? candles.indexOf(breakCandle) : end;
      const breakVol = breakout ? (breakCandle?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volumeOk = breakout && avgVol20 > 0 && breakVol / avgVol20 >= 1.05;
      const score = 55 + (parallel ? 10 : 0) + (breakout ? 14 : -3) + (volumeOk ? 6 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      results.push({
        id: `vision-chup-${start}-${end}`,
        type: 'Channel Up',
        bias: 'bullish',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: `상승채널 (${breakout ? '하방 이탈 확인' : '이탈 대기'}) [${grade}]`,
        reason: `상승 평행 채널${breakout ? ', 하방 이탈 확인' : ''}${volumeOk ? ', 거래량 확인' : ''}`,
      });
    } else if (parallel && us < 0) {
      const start = Math.min(h1.index, l1.index);
      const end = Math.max(h2.index, l2.index);
      const breakCandle = candles.slice(end + 1).find((c) => c.close > h2.price * 1.0005);
      const breakout = !!breakCandle;
      const breakIdx = breakout ? candles.indexOf(breakCandle) : end;
      const breakVol = breakout ? (breakCandle?.volume ?? 0) : 0;
      const avgVol20 = avgVolume(candles, Math.max(0, breakIdx - 20), breakIdx);
      const volumeOk = breakout && avgVol20 > 0 && breakVol / avgVol20 >= 1.05;
      const score = 55 + (parallel ? 10 : 0) + (breakout ? 14 : -3) + (volumeOk ? 6 : 0);
      const conf = clamp(Math.round(score), 50, 95);
      const grade = gradeFromConfidence(conf);
      results.push({
        id: `vision-chdn-${start}-${end}`,
        type: 'Channel Down',
        bias: 'bearish',
        confidence: conf,
        startIndex: start,
        endIndex: end,
        pivotPoints: [h1, h2, l1, l2],
        lines: [
          line(h1.index, h1.price, h2.index, h2.price, 'resistance'),
          line(l1.index, l1.price, l2.index, l2.price, 'support'),
        ],
        zones: [],
        label: `하락채널 (${breakout ? '상방 이탈 확인' : '이탈 대기'}) [${grade}]`,
        reason: `하락 평행 채널${breakout ? ', 상방 이탈 확인' : ''}${volumeOk ? ', 거래량 확인' : ''}`,
      });
    }
  }

  const unified = results.map((r) => {
    const s = unifyPatternScore(candles, r);
    return {
      ...r,
      confidence: s.confidence,
      label: appendOrReplaceGrade(r.label, s.grade),
      reason: `${r.reason}${s.breakout ? ', 이탈확인' : ', 이탈대기'}${s.volumeOk ? ', 거래량확인' : ''}${s.htfAligned ? ', HTF정렬' : ''}`,
    };
  });
  const filtered = unified.filter((r) => r.confidence >= MIN_CONFIDENCE);
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
