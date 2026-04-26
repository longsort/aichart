/**
 * Chart Bible mode — 《차트분석 바이블》류 반전·지속 캔들 패턴 (휴리스틱·교육용, 자동 매매 신호 아님).
 * PDF 전체 OCR은 연결하지 않음; 교재·스캔 이미지에 맞춘 규칙을 코드로 유지·확장.
 */
import type { Candle, OverlayItem } from '@/types';

function bodyBounds(c: Candle): { bot: number; top: number } {
  return { bot: Math.min(c.open, c.close), top: Math.max(c.open, c.close) };
}

function bodySize(c: Candle): number {
  const b = bodyBounds(c);
  return Math.max(b.top - b.bot, 0);
}

function rangeSize(c: Candle): number {
  return Math.max(c.high - c.low, 0);
}

function isBull(c: Candle): boolean {
  return c.close > c.open;
}

function isBear(c: Candle): boolean {
  return c.close < c.open;
}

function bodyMid(c: Candle): number {
  const b = bodyBounds(c);
  return (b.top + b.bot) / 2;
}

function medianBody(candles: Candle[], end: number, lookback: number): number {
  const from = Math.max(0, end - lookback);
  const sizes: number[] = [];
  for (let i = from; i <= end; i++) {
    const s = bodySize(candles[i]);
    if (s > 0) sizes.push(s);
  }
  if (!sizes.length) return 0;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

function atrApprox(candles: Candle[], end: number, len: number): number {
  const from = Math.max(1, end - len + 1);
  let s = 0;
  let n = 0;
  for (let i = from; i <= end; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    s += tr;
    n++;
  }
  return n ? s / n : 0;
}

function isDoji(c: Candle, medBody: number): boolean {
  const r = rangeSize(c);
  if (r <= 0) return true;
  const b = bodySize(c);
  return b <= Math.max(r * 0.12, medBody * 0.15);
}

function isLongBody(c: Candle, med: number): boolean {
  return bodySize(c) >= med * 1.05;
}

function isSmallBody(c: Candle, med: number): boolean {
  const b = bodySize(c);
  return b > 0 && b <= med * 0.55;
}

function bodyEngulfs(a: Candle, b: Candle): boolean {
  const A = bodyBounds(a);
  const B = bodyBounds(b);
  return A.bot <= B.bot && A.top >= B.top;
}

function twoCandleBullEngulf(prev: Candle, cur: Candle, med: number): boolean {
  if (!isBear(prev) || !isBull(cur)) return false;
  if (!bodyEngulfs(cur, prev)) return false;
  return bodySize(cur) > Math.max(bodySize(prev) * 1.005, med * 0.35);
}

function twoCandleBearEngulf(prev: Candle, cur: Candle, med: number): boolean {
  if (!isBull(prev) || !isBear(cur)) return false;
  if (!bodyEngulfs(cur, prev)) return false;
  return bodySize(cur) > Math.max(bodySize(prev) * 1.005, med * 0.35);
}

/** Gapless FX-style engulfing allowed */
function bullEngulfing(prev: Candle, cur: Candle, med: number): boolean {
  return twoCandleBullEngulf(prev, cur, med);
}

function bearEngulfing(prev: Candle, cur: Candle, med: number): boolean {
  return twoCandleBearEngulf(prev, cur, med);
}

/** Morning star: long bear, small star below prior body, bull closes into first body midpoint+ */
function morningStar(c0: Candle, c1: Candle, c2: Candle, med: number): boolean {
  if (!isBear(c0) || !isBull(c2)) return false;
  if (!isLongBody(c0, med)) return false;
  if (!isSmallBody(c1, med)) return false;
  const B0 = bodyBounds(c0);
  const starBelow = c1.high < B0.top + med * 0.08;
  if (!starBelow) return false;
  const mid0 = bodyMid(c0);
  return c2.close >= mid0;
}

function eveningStar(c0: Candle, c1: Candle, c2: Candle, med: number): boolean {
  if (!isBull(c0) || !isBear(c2)) return false;
  if (!isLongBody(c0, med)) return false;
  if (!isSmallBody(c1, med)) return false;
  const B0 = bodyBounds(c0);
  const starAbove = c1.low > B0.bot - med * 0.08;
  if (!starAbove) return false;
  const mid0 = bodyMid(c0);
  return c2.close <= mid0;
}

function morningDojiStar(c0: Candle, c1: Candle, c2: Candle, med: number): boolean {
  return morningStar(c0, c1, c2, med) && isDoji(c1, med);
}

function eveningDojiStar(c0: Candle, c1: Candle, c2: Candle, med: number): boolean {
  return eveningStar(c0, c1, c2, med) && isDoji(c1, med);
}

function threeInsideUp(c0: Candle, c1: Candle, c2: Candle, med: number): boolean {
  if (!isBear(c0) || !isBull(c1) || !isBull(c2)) return false;
  if (!isLongBody(c0, med)) return false;
  const B0 = bodyBounds(c0);
  const B1 = bodyBounds(c1);
  if (!(B1.top <= B0.top && B1.bot >= B0.bot)) return false;
  if (!isSmallBody(c1, med)) return false;
  /** 3봉 종가가 2봉 고가 위(교재 Three Inside Up) */
  return c2.close > c1.high;
}

function threeInsideDown(c0: Candle, c1: Candle, c2: Candle, med: number): boolean {
  if (!isBull(c0) || !isBear(c1) || !isBear(c2)) return false;
  if (!isLongBody(c0, med)) return false;
  const B0 = bodyBounds(c0);
  const B1 = bodyBounds(c1);
  if (!(B1.top <= B0.top && B1.bot >= B0.bot)) return false;
  if (!isSmallBody(c1, med)) return false;
  /** 3봉 종가가 2봉 저가 아래 */
  return c2.close < c1.low;
}

function risingThreeMethods(cs: Candle[], e: number, med: number): boolean {
  if (e < 4) return false;
  const c0 = cs[e - 4];
  const c1 = cs[e - 3];
  const c2 = cs[e - 2];
  const c3 = cs[e - 1];
  const c4 = cs[e];
  if (!isBull(c0) || !isLongBody(c0, med)) return false;
  const momLo = c0.low;
  const momHi = c0.high;
  for (const x of [c1, c2, c3]) {
    if (!isBear(x)) return false;
    if (x.high > momHi + med * 0.06 || x.low < momLo - med * 0.06) return false;
    if (bodySize(x) > med * 0.75) return false;
  }
  if (!isBull(c4) || !isLongBody(c4, med)) return false;
  if (c4.open < cs[e - 1].close - med * 0.02) return false;
  return c4.close > c0.close;
}

function fallingThreeMethods(cs: Candle[], e: number, med: number): boolean {
  if (e < 4) return false;
  const c0 = cs[e - 4];
  const c1 = cs[e - 3];
  const c2 = cs[e - 2];
  const c3 = cs[e - 1];
  const c4 = cs[e];
  if (!isBear(c0) || !isLongBody(c0, med)) return false;
  const momLo = c0.low;
  const momHi = c0.high;
  for (const x of [c1, c2, c3]) {
    if (!isBull(x)) return false;
    if (x.high > momHi + med * 0.06 || x.low < momLo - med * 0.06) return false;
    if (bodySize(x) > med * 0.75) return false;
  }
  if (!isBear(c4) || !isLongBody(c4, med)) return false;
  return c4.close < c0.close;
}

function threeLineStrikeBull(cs: Candle[], e: number, med: number): boolean {
  if (e < 3) return false;
  const c0 = cs[e - 3];
  const c1 = cs[e - 2];
  const c2 = cs[e - 1];
  const c3 = cs[e];
  if (!isBull(c0) || !isBull(c1) || !isBull(c2)) return false;
  if (!(c0.close < c1.close && c1.close < c2.close)) return false;
  if (!isBear(c3) || !isLongBody(c3, med)) return false;
  if (c3.open < c2.close - med * 0.15) return false;
  return c3.close < c0.open;
}

function threeLineStrikeBear(cs: Candle[], e: number, med: number): boolean {
  if (e < 3) return false;
  const c0 = cs[e - 3];
  const c1 = cs[e - 2];
  const c2 = cs[e - 1];
  const c3 = cs[e];
  if (!isBear(c0) || !isBear(c1) || !isBear(c2)) return false;
  if (!(c0.close > c1.close && c1.close > c2.close)) return false;
  if (!isBull(c3) || !isLongBody(c3, med)) return false;
  if (c3.open > c2.close + med * 0.15) return false;
  return c3.close > c0.open;
}

function inNeck(cs: Candle[], e: number, med: number, atr: number): boolean {
  if (e < 1) return false;
  const c0 = cs[e - 1];
  const c1 = cs[e];
  if (!isBear(c0) || !isLongBody(c0, med)) return false;
  if (!isBull(c1) || !isSmallBody(c1, med)) return false;
  const gap = c1.open < c0.low - atr * 0.05;
  if (!gap) return false;
  const tol = Math.max(atr * 0.12, med * 0.1);
  const B0 = bodyBounds(c0);
  return Math.abs(c1.close - c0.close) <= tol && c1.close > B0.bot - tol && c1.close < B0.top + tol;
}

function onNeck(cs: Candle[], e: number, med: number, atr: number): boolean {
  if (e < 1) return false;
  const c0 = cs[e - 1];
  const c1 = cs[e];
  if (!isBear(c0) || !isLongBody(c0, med)) return false;
  if (!isBull(c1)) return false;
  const gap = c1.open < c0.low - atr * 0.05;
  if (!gap) return false;
  const tol = Math.max(atr * 0.1, med * 0.08);
  return Math.abs(c1.close - c0.low) <= tol;
}

export type BiblePatternHit = {
  key: string;
  priority: number;
  /** 패턴에 포함되는 첫 봉 인덱스 */
  startIndex: number;
  /** 패턴 완성 봉(마지막 봉) 인덱스 */
  endIndex: number;
  labelKo: string;
  labelEn: string;
  stars: 2 | 3;
  bull: boolean;
  tooltip: string;
};

function collectHits(candles: Candle[]): BiblePatternHit[] {
  const n = candles.length;
  const hits: BiblePatternHit[] = [];
  if (n < 5) return hits;

  for (let i = 4; i < n; i++) {
    const med = medianBody(candles, i, 96);
    if (!(med > 0)) continue;

    if (risingThreeMethods(candles, i, med)) {
      hits.push({
        key: 'rising-three-methods',
        priority: 60,
        startIndex: i - 4,
        endIndex: i,
        labelKo: 'Bible R3 \u2605\u2605\u2605',
        labelEn: 'Rising Three Methods',
        stars: 3,
        bull: true,
        tooltip:
          'Bullish continuation: long green, three small reds inside range, breakout green. Educational marker only.',
      });
    }
    if (fallingThreeMethods(candles, i, med)) {
      hits.push({
        key: 'falling-three-methods',
        priority: 60,
        startIndex: i - 4,
        endIndex: i,
        labelKo: 'Bible F3 \u2605\u2605\u2605',
        labelEn: 'Falling Three Methods',
        stars: 3,
        bull: false,
        tooltip:
          'Bearish continuation: long red, three small greens inside range, thrust red. Educational marker only.',
      });
    }
  }

  for (let i = 3; i < n; i++) {
    const med = medianBody(candles, i, 96);
    if (!(med > 0)) continue;

    if (threeLineStrikeBull(candles, i, med)) {
      hits.push({
        key: 'three-line-strike-bull',
        priority: 58,
        startIndex: i - 3,
        endIndex: i,
        labelKo: 'Bible 3LS+ \u2605\u2605\u2605',
        labelEn: 'Three Line Strike (Bull)',
        stars: 3,
        bull: true,
        tooltip: 'Bullish continuation: three advancing greens then large red under first open. Heuristic.',
      });
    }
    if (threeLineStrikeBear(candles, i, med)) {
      hits.push({
        key: 'three-line-strike-bear',
        priority: 58,
        startIndex: i - 3,
        endIndex: i,
        labelKo: 'Bible 3LS- \u2605\u2605\u2605',
        labelEn: 'Three Line Strike (Bear)',
        stars: 3,
        bull: false,
        tooltip: 'Bearish continuation: three declining reds then large green above first open. Heuristic.',
      });
    }
  }

  for (let i = 2; i < n; i++) {
    const med = medianBody(candles, i, 96);
    if (!(med > 0)) continue;
    const atr = atrApprox(candles, i, 14);

    const a0 = candles[i - 2];
    const a1 = candles[i - 1];
    const a2 = candles[i];

    if (morningDojiStar(a0, a1, a2, med)) {
      hits.push({
        key: 'morning-doji-star',
        priority: 72,
        startIndex: i - 2,
        endIndex: i,
        labelKo: 'Bible M.Doji \u2605\u2605\u2605',
        labelEn: 'Morning Doji Star',
        stars: 3,
        bull: true,
        tooltip: 'Bullish reversal family: morning star with doji middle. Educational.',
      });
    } else if (morningStar(a0, a1, a2, med)) {
      hits.push({
        key: 'morning-star',
        priority: 70,
        startIndex: i - 2,
        endIndex: i,
        labelKo: 'Bible M.Star \u2605\u2605\u2605',
        labelEn: 'Morning Star',
        stars: 3,
        bull: true,
        tooltip: 'Bullish reversal: long red, small star, green closing into first body. Educational.',
      });
    }

    if (eveningDojiStar(a0, a1, a2, med)) {
      hits.push({
        key: 'evening-doji-star',
        priority: 72,
        startIndex: i - 2,
        endIndex: i,
        labelKo: 'Bible E.Doji \u2605\u2605\u2605',
        labelEn: 'Evening Doji Star',
        stars: 3,
        bull: false,
        tooltip: 'Bearish reversal family: evening star with doji middle. Educational.',
      });
    } else if (eveningStar(a0, a1, a2, med)) {
      hits.push({
        key: 'evening-star',
        priority: 70,
        startIndex: i - 2,
        endIndex: i,
        labelKo: 'Bible E.Star \u2605\u2605\u2605',
        labelEn: 'Evening Star',
        stars: 3,
        bull: false,
        tooltip: 'Bearish reversal: long green, small star, red closing into first body. Educational.',
      });
    }

    if (threeInsideUp(a0, a1, a2, med)) {
      hits.push({
        key: 'three-inside-up',
        priority: 55,
        startIndex: i - 2,
        endIndex: i,
        labelKo: 'Bible 3InUp \u2605\u2605\u2605',
        labelEn: 'Three Inside Up',
        stars: 3,
        bull: true,
        tooltip: 'Bullish confirmation: harami then 3rd close above 2nd candle high. Educational.',
      });
    }
    if (threeInsideDown(a0, a1, a2, med)) {
      hits.push({
        key: 'three-inside-down',
        priority: 55,
        startIndex: i - 2,
        endIndex: i,
        labelKo: 'Bible 3InDn \u2605\u2605\u2605',
        labelEn: 'Three Inside Down',
        stars: 3,
        bull: false,
        tooltip: 'Bearish confirmation: harami then 3rd close below 2nd candle low. Educational.',
      });
    }

    if (inNeck(candles, i, med, atr)) {
      hits.push({
        key: 'in-neck',
        priority: 40,
        startIndex: i - 1,
        endIndex: i,
        labelKo: 'Bible In-Neck \u2605\u2605',
        labelEn: 'In-Neck',
        stars: 2,
        bull: false,
        tooltip: 'Weak bearish continuation: gap down, close near prior close into body. Heuristic.',
      });
    }
    if (onNeck(candles, i, med, atr)) {
      hits.push({
        key: 'on-neck',
        priority: 40,
        startIndex: i - 1,
        endIndex: i,
        labelKo: 'Bible On-Neck \u2605\u2605',
        labelEn: 'On-Neck',
        stars: 2,
        bull: false,
        tooltip: 'Weak bearish continuation: gap down, close at prior low. Heuristic.',
      });
    }

    const prev = candles[i - 1];
    const cur = candles[i];
    if (bullEngulfing(prev, cur, med)) {
      hits.push({
        key: 'bull-engulfing',
        priority: 50,
        startIndex: i - 1,
        endIndex: i,
        labelKo: 'Bible BullEng \u2605\u2605\u2605',
        labelEn: 'Bullish Engulfing',
        stars: 3,
        bull: true,
        tooltip: 'Bullish reversal: green body engulfs prior red body. Educational.',
      });
    }
    if (bearEngulfing(prev, cur, med)) {
      hits.push({
        key: 'bear-engulfing',
        priority: 50,
        startIndex: i - 1,
        endIndex: i,
        labelKo: 'Bible BearEng \u2605\u2605\u2605',
        labelEn: 'Bearish Engulfing',
        stars: 3,
        bull: false,
        tooltip: 'Bearish reversal: red body engulfs prior green body. Educational.',
      });
    }
  }

  return hits;
}

/** One pattern per completion bar — keep highest priority */
function dedupeByEnd(hits: BiblePatternHit[]): BiblePatternHit[] {
  const byEnd = new Map<number, BiblePatternHit>();
  const sorted = [...hits].sort((a, b) => b.priority - a.priority || b.endIndex - a.endIndex);
  for (const h of sorted) {
    if (!byEnd.has(h.endIndex)) byEnd.set(h.endIndex, h);
  }
  return [...byEnd.values()].sort((a, b) => b.endIndex - a.endIndex);
}

function spanPriceRange(candles: Candle[], from: number, to: number): { hi: number; lo: number } {
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    hi = Math.max(hi, c.high);
    lo = Math.min(lo, c.low);
  }
  return { hi, lo };
}

/** 핀은 패턴별 이모지 1개만 표시 — 클릭 시 labelTooltip 전체 */
const BIBLE_PIN_ICON: Record<string, string> = {
  'rising-three-methods': '📗',
  'falling-three-methods': '📕',
  'three-line-strike-bull': '⚡',
  'three-line-strike-bear': '⚡',
  'morning-doji-star': '🌅',
  'morning-star': '☀️',
  'evening-doji-star': '🌔',
  'evening-star': '🌙',
  'three-inside-up': '🔼',
  'three-inside-down': '🔽',
  'in-neck': '〰️',
  'on-neck': '➿',
  'bull-engulfing': '🐂',
  'bear-engulfing': '🐻',
};

function biblePinIcon(key: string, bull: boolean): string {
  return BIBLE_PIN_ICON[key] ?? (bull ? '🟩' : '🟥');
}

/** 교재 스타일: 패턴 구간 high~low — 롱=초록·숏=빨강 (차트 관례) */
function hitToFrameZone(candles: Candle[], h: BiblePatternHit): OverlayItem {
  const s = Math.max(0, h.startIndex);
  const e = Math.min(candles.length - 1, h.endIndex);
  const tStart = candles[s].time as number;
  const tEnd = candles[e].time as number;
  const { hi, lo } = spanPriceRange(candles, s, e);
  const bull = h.bull;
  const stroke = bull ? '#22C55E' : '#EF4444';
  return {
    id: `bible-cp-frame-${h.key}-${tEnd}`,
    kind: 'zone',
    label: '\u00a0',
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    time1: Math.min(tStart, tEnd),
    time2: Math.max(tStart, tEnd),
    price1: hi,
    price2: lo,
    confidence: 55,
    color: bull ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
    lineLabelColor: stroke,
    category: 'bibleMode',
    zoneSpanOnly: true,
    labelTooltip: `${h.labelEn} · 봉 ${s + 1}–${e + 1}`,
  };
}

function hitToOverlay(candles: Candle[], h: BiblePatternHit): OverlayItem {
  const c = candles[h.endIndex];
  const t = c.time as number;
  const bull = h.bull;
  const price = bull ? c.high + rangeSize(c) * 0.02 : c.low - rangeSize(c) * 0.02;
  const lineLabelColor = bull ? '#22C55E' : '#EF4444';
  const tipKo = [
    '교육용 형태 인식 (매매 권유·확정 신호 아님)',
    '',
    `「${h.labelEn}」`,
    h.stars === 3 ? '중요도: ★★★' : '중요도: ★★',
    `봉 범위: ${h.startIndex + 1} ~ ${h.endIndex + 1}`,
    '',
    h.tooltip,
  ].join('\n');
  return {
    id: `bible-cp-${h.key}-${t}`,
    kind: 'label',
    label: biblePinIcon(h.key, bull),
    x1: 0,
    y1: 0,
    time1: t,
    price1: price,
    confidence: 68 + h.stars,
    lineLabelColor,
    labelTextColor: '#f8fafc',
    labelBackgroundColor: bull ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)',
    category: 'bibleMode',
    labelTooltip: tipKo,
  };
}

/** maxMarks = 패턴 개수 상한; 존(점선 프레임)+핀 라벨로 각 2개 오버레이 */
export function buildBibleModeOverlays(candles: Candle[], maxMarks = 16): OverlayItem[] {
  if (candles.length < 5) return [];
  const hits = dedupeByEnd(collectHits(candles));
  const slice = hits.slice(0, maxMarks);
  const out: OverlayItem[] = [];
  for (const h of slice) {
    out.push(hitToFrameZone(candles, h));
    out.push(hitToOverlay(candles, h));
  }
  return out;
}

/** 차트 상단 영어 블록 제거됨 — 요약은 핀 클릭 시에만 표시 */
export function buildBibleModeSummaryLines(_candles: Candle[]): string[] {
  return [];
}
