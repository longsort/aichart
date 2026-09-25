/**
 * 독수리1호 — PARALLEL CHANNEL ENGINE
 * Pivot 확정(미래참조 금지) · 다후보 점수경쟁 · Strong/Valid/Weak
 * CHANNEL DETECTED ≠ ENTRY (geometry only)
 */
import type { Candle, OverlayItem } from '@/types';
import { atrSeries } from '@/lib/indicators';
import { MERGED_DESK_RB_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';

export type ChannelType = 'ascending' | 'descending' | 'sideways';

export type ChannelState =
  | 'FORMING'
  | 'VALID'
  | 'STRONG'
  | 'UPPER_TEST'
  | 'LOWER_TEST'
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'RETEST_UPPER'
  | 'RETEST_LOWER'
  | 'FAILED_BREAKOUT'
  | 'FAILED_BREAKDOWN'
  | 'BROKEN';

export type ChannelGrade = 'STRONG' | 'VALID' | 'WEAK' | 'HIDDEN';

export type PivotKind = 'high' | 'low';
export type PivotStatus = 'PROVISIONAL' | 'CONFIRMED';

export type ChannelPivot = {
  index: number;
  price: number;
  kind: PivotKind;
  status: PivotStatus;
  time: number;
};

export type ParallelChannel = {
  id: string;
  type: ChannelType;
  slope: number;
  lowerIntercept: number;
  upperIntercept: number;
  midIntercept: number;
  channelHeight: number;
  startIndex: number;
  lastIndex: number;
  upperTouches: number;
  lowerTouches: number;
  insideRatio: number;
  bodyInsideRatio: number;
  wickInsideRatio: number;
  slopeStability: number;
  widthStability: number;
  score: number;
  grade: ChannelGrade;
  state: ChannelState;
  active: boolean;
  position: number;
  upperRejectionRate: number;
  lowerBounceRate: number;
  meanReaction: number;
  medianReaction: number;
  recentReactionLabel: string;
  breakConditionLabel: string;
  basePivotCount: number;
  oppositePivotCount: number;
  /** 기울기를 고정한 두 피벗 시각. 이 키가 같으면 선을 다시 긋지 않는다. */
  anchorKey: string;
};

export type ParallelChannelEngineOpts = {
  pivotLength?: number;
  minimumBasePivots?: number;
  minimumOppositePivots?: number;
  minimumUpperTouches?: number;
  minimumLowerTouches?: number;
  minimumBars?: number;
  touchToleranceATR?: number;
  breakoutBufferATR?: number;
  minimumInsideRatio?: number;
  strongInsideRatio?: number;
  maxSlopeDeviation?: number;
  maxDisplayedChannels?: number;
  minimumDisplayScore?: number;
  strongScore?: number;
  validScore?: number;
  weakScore?: number;
  touchCooldownBars?: number;
  acceptanceBars?: number;
  fakeBreakBars?: number;
  minimumWidthATR?: number;
  flatSlopeThreshold?: number;
  minimumSlope?: number;
  tipPad?: number;
  maxAsc?: number;
  maxDesc?: number;
  maxSide?: number;
  lookbackPivots?: number;
  /** 심볼|타임프레임. 같은 차트는 채널을 유지하고, 코인이 바뀌면 새로 고른다. */
  lockKey?: string;
};

export type ParallelChannelEnginePack = {
  pivots: ChannelPivot[];
  channels: ParallelChannel[];
  overlays: OverlayItem[];
};

const DEFAULTS: Required<
  Omit<ParallelChannelEngineOpts, 'flatSlopeThreshold' | 'minimumSlope'>
> & {
  flatSlopeThreshold: number | null;
  minimumSlope: number | null;
} = {
  pivotLength: 5,
  minimumBasePivots: 3,
  minimumOppositePivots: 2,
  minimumUpperTouches: 2,
  minimumLowerTouches: 2,
  minimumBars: 20,
  touchToleranceATR: 0.15,
  breakoutBufferATR: 0.15,
  minimumInsideRatio: 0.68,
  strongInsideRatio: 0.8,
  maxSlopeDeviation: 0.15,
  maxDisplayedChannels: 1,
  minimumDisplayScore: 60,
  strongScore: 85,
  validScore: 70,
  weakScore: 55,
  touchCooldownBars: 5,
  acceptanceBars: 3,
  fakeBreakBars: 3,
  minimumWidthATR: 0.35,
  flatSlopeThreshold: null,
  minimumSlope: null,
  tipPad: MERGED_DESK_RB_FUTURE_BARS,
  maxAsc: 1,
  maxDesc: 1,
  maxSide: 1,
  lookbackPivots: 10,
  lockKey: '',
};

type EngineCfg = typeof DEFAULTS;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
}

/** Theil–Sen robust slope */
function theilSenSlope(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j]! - xs[i]!;
      if (Math.abs(dx) < 1e-12) continue;
      slopes.push((ys[j]! - ys[i]!) / dx);
    }
  }
  if (!slopes.length) return null;
  const slope = median(slopes);
  const intercepts = ys.map((y, i) => y - slope * xs[i]!);
  return { slope, intercept: median(intercepts) };
}

function barStepSec(candles: Candle[]): number {
  if (candles.length < 2) return 3600;
  const d = Number(candles[candles.length - 1]!.time) - Number(candles[candles.length - 2]!.time);
  if (Number.isFinite(d) && d > 0) return d;
  return 3600;
}

function lastAtr(candles: Candle[]): number {
  const series = atrSeries(candles, 14);
  const v = series[series.length - 1] ?? 0;
  const mid = Number(candles[candles.length - 1]?.close) || 1;
  return Math.max(v, mid * 1e-4, 1e-9);
}

function volumeMa(candles: Candle[], i: number, period = 20): number {
  const a = Math.max(0, i - period + 1);
  let s = 0;
  let n = 0;
  for (let j = a; j <= i; j++) {
    s += Number(candles[j]?.volume) || 0;
    n++;
  }
  return n ? s / n : 0;
}

export function getLowerPrice(ch: Pick<ParallelChannel, 'lowerIntercept' | 'slope'>, index: number): number {
  return ch.lowerIntercept + ch.slope * index;
}

export function getUpperPrice(ch: Pick<ParallelChannel, 'upperIntercept' | 'slope'>, index: number): number {
  return ch.upperIntercept + ch.slope * index;
}

export function getMidPrice(
  ch: Pick<ParallelChannel, 'lowerIntercept' | 'upperIntercept' | 'slope'>,
  index: number
): number {
  return (getLowerPrice(ch, index) + getUpperPrice(ch, index)) / 2;
}

/**
 * Pivot High/Low — 오른쪽 N봉 마감 후에만 CONFIRMED (미래참조 금지).
 * 형성봉 기준 provisional은 탐지에만 쓰고 채널 적합에는 확정만 사용.
 */
export function detectChannelPivots(
  candles: Candle[],
  pivotLength = 5
): ChannelPivot[] {
  const N = Math.max(2, Math.floor(pivotLength));
  const n = candles.length;
  const out: ChannelPivot[] = [];
  if (n < N * 2 + 1) return out;

  const lastClosed = n - 1;
  for (let i = N; i <= lastClosed - N; i++) {
    const hi = Number(candles[i]!.high);
    const lo = Number(candles[i]!.low);
    let isH = true;
    let isL = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j === i) continue;
      if (Number(candles[j]!.high) >= hi) isH = false;
      if (Number(candles[j]!.low) <= lo) isL = false;
      if (!isH && !isL) break;
    }
    const confirmed = i + N <= lastClosed;
    const status: PivotStatus = confirmed ? 'CONFIRMED' : 'PROVISIONAL';
    if (isH) {
      out.push({
        index: i,
        price: hi,
        kind: 'high',
        status,
        time: Number(candles[i]!.time),
      });
    }
    if (isL) {
      out.push({
        index: i,
        price: lo,
        kind: 'low',
        status,
        time: Number(candles[i]!.time),
      });
    }
  }
  return out;
}

/**
 * 반대편 레일 거리.
 * 가장 바깥 꼬리 하나가 혼자 벗어나 있으면 그 다음 스윙에 붙인다.
 * 두 스윙이 ATR 안으로 모이면 더 바깥 꼬리에 붙인다.
 */
function outerRailDistance(dists: number[], atr: number, minWidthAtr: number): number | null {
  const minW = atr * minWidthAtr;
  const ok = dists.filter((d) => Number.isFinite(d) && d >= minW).sort((a, b) => b - a);
  if (ok.length < 2) return null;
  const cluster = Math.max(atr * 0.55, (ok[0] ?? 0) * 0.04);
  if ((ok[0] ?? 0) - (ok[1] ?? 0) <= cluster) return ok[0]!;
  return ok[1]!;
}

function touchWeight(barsAgo: number): number {
  if (barsAgo <= 20) return 1;
  if (barsAgo <= 50) return 0.8;
  if (barsAgo <= 100) return 0.5;
  return 0.3;
}

function countTouches(params: {
  candles: Candle[];
  start: number;
  end: number;
  slope: number;
  intercept: number;
  side: 'upper' | 'lower';
  atr: number;
  tolAtr: number;
  cooldown: number;
}): { count: number; weighted: number; indices: number[] } {
  const { candles, start, end, slope, intercept, side, atr, tolAtr, cooldown } = params;
  let count = 0;
  let weighted = 0;
  let lastTouch = -999;
  const indices: number[] = [];
  const lastI = candles.length - 1;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const line = intercept + slope * i;
    const mid = (Number(c.high) + Number(c.low)) / 2 || Number(c.close) || 1;
    const tol = Math.max(atr * tolAtr, mid * 0.001);
    const hit =
      side === 'upper'
        ? Math.abs(Number(c.high) - line) <= tol
        : Math.abs(Number(c.low) - line) <= tol;
    if (!hit) continue;
    if (i - lastTouch < cooldown) continue;
    lastTouch = i;
    count++;
    weighted += touchWeight(lastI - i);
    indices.push(i);
  }
  return { count, weighted, indices };
}

function insideRatios(params: {
  candles: Candle[];
  start: number;
  end: number;
  slope: number;
  lowerI: number;
  upperI: number;
  atr: number;
  tolAtr: number;
}): { body: number; wick: number } {
  const { candles, start, end, slope, lowerI, upperI, atr, tolAtr } = params;
  let bodyOk = 0;
  let wickOk = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const lo = lowerI + slope * i;
    const hi = upperI + slope * i;
    const mid = (Number(c.high) + Number(c.low)) / 2 || Number(c.close) || 1;
    const tol = Math.max(atr * tolAtr, mid * 0.001);
    const bodyLo = Math.min(Number(c.open), Number(c.close));
    const bodyHi = Math.max(Number(c.open), Number(c.close));
    n++;
    if (bodyLo >= lo - tol && bodyHi <= hi + tol) bodyOk++;
    if (Number(c.low) >= lo - tol && Number(c.high) <= hi + tol) wickOk++;
  }
  return { body: n ? bodyOk / n : 0, wick: n ? wickOk / n : 0 };
}

function slopeStabilityFromPivots(pivots: ChannelPivot[]): number {
  if (pivots.length < 3) return 0.5;
  const local: number[] = [];
  for (let i = 1; i < pivots.length; i++) {
    const dx = pivots[i]!.index - pivots[i - 1]!.index;
    if (Math.abs(dx) < 1) continue;
    local.push((pivots[i]!.price - pivots[i - 1]!.price) / dx);
  }
  if (local.length < 2) return 0.7;
  const m = mean(local.map(Math.abs)) || 1e-12;
  const dev = stdev(local) / m;
  if (dev <= 0.15) return 1;
  if (dev <= 0.3) return 0.7;
  if (dev <= 0.5) return 0.4;
  return 0.15;
}

function reactionStats(params: {
  candles: Candle[];
  touchIdx: number[];
  side: 'upper' | 'lower';
}): { rate: number; meanPct: number; medianPct: number; lastLabel: string } {
  const { candles, touchIdx, side } = params;
  const reactions: number[] = [];
  for (const ti of touchIdx) {
    const base = Number(candles[ti]?.close) || 0;
    if (!(base > 0)) continue;
    let best = 0;
    const lim = Math.min(candles.length - 1, ti + 8);
    for (let j = ti + 1; j <= lim; j++) {
      const px = Number(candles[j]!.close);
      const pct = ((px - base) / base) * 100;
      if (side === 'upper') best = Math.min(best, pct);
      else best = Math.max(best, pct);
    }
    reactions.push(best);
  }
  if (!reactions.length) {
    return { rate: 0, meanPct: 0, medianPct: 0, lastLabel: '—' };
  }
  const ok =
    side === 'upper'
      ? reactions.filter((r) => r <= -0.3).length / reactions.length
      : reactions.filter((r) => r >= 0.3).length / reactions.length;
  const last = reactions[reactions.length - 1]!;
  const lastLabel =
    side === 'upper'
      ? `Upper Reject ${last.toFixed(2)}%`
      : `Lower Bounce ${last >= 0 ? '+' : ''}${last.toFixed(2)}%`;
  return {
    rate: ok,
    meanPct: mean(reactions),
    medianPct: median(reactions),
    lastLabel,
  };
}

function wickRejectBoost(
  candles: Candle[],
  i: number,
  side: 'upper' | 'lower',
  line: number
): number {
  const c = candles[i]!;
  const range = Math.max(1e-9, Number(c.high) - Number(c.low));
  const bodyTop = Math.max(Number(c.open), Number(c.close));
  const bodyBot = Math.min(Number(c.open), Number(c.close));
  if (side === 'upper') {
    const uw = Number(c.high) - bodyTop;
    const ratio = uw / range;
    if (ratio >= 0.35 && Number(c.close) < line) return 1;
    return 0;
  }
  const lw = bodyBot - Number(c.low);
  const ratio = lw / range;
  if (ratio >= 0.35 && Number(c.close) > line) return 1;
  return 0;
}

function sfpBoost(
  candles: Candle[],
  i: number,
  side: 'upper' | 'lower',
  upper: number,
  lower: number
): number {
  const c = candles[i]!;
  const close = Number(c.close);
  if (side === 'upper') {
    if (Number(c.high) > upper && close <= upper && close >= lower) return 1;
  } else {
    if (Number(c.low) < lower && close >= lower && close <= upper) return 1;
  }
  return 0;
}

function scoreChannel(parts: {
  basePivotCount: number;
  oppositePivotCount: number;
  upperTouchW: number;
  lowerTouchW: number;
  inside: number;
  slopeStab: number;
  widthStab: number;
  recentReaction: number;
  volumeConf: number;
}): number {
  const pivotQ = Math.min(15, parts.basePivotCount * 3 + parts.oppositePivotCount * 2);
  const upperT = Math.min(15, parts.upperTouchW * 4);
  const lowerT = Math.min(15, parts.lowerTouchW * 4);
  const inside = Math.min(20, parts.inside * 20);
  const slopeS = Math.min(10, parts.slopeStab * 10);
  const widthS = Math.min(10, parts.widthStab * 10);
  const recent = Math.min(10, parts.recentReaction * 10);
  const vol = Math.min(5, parts.volumeConf * 5);
  return Math.round(pivotQ + upperT + lowerT + inside + slopeS + widthS + recent + vol);
}

function classifyState(params: {
  candles: Candle[];
  start: number;
  end: number;
  slope: number;
  lowerI: number;
  upperI: number;
  atr: number;
  bufferAtr: number;
  acceptanceBars: number;
  fakeBreakBars: number;
  score: number;
  strongScore: number;
  validScore: number;
}): ChannelState {
  const {
    candles,
    end,
    slope,
    lowerI,
    upperI,
    atr,
    bufferAtr,
    acceptanceBars,
    fakeBreakBars,
    score,
    strongScore,
    validScore,
  } = params;
  const lastI = Math.min(end, candles.length - 1);
  const close = Number(candles[lastI]!.close);
  const mid = close || 1;
  const buf = Math.max(atr * bufferAtr, mid * 0.001);
  const up = upperI + slope * lastI;
  const lo = lowerI + slope * lastI;
  const tol = buf;

  const closesOutsideUp: number[] = [];
  const closesOutsideLo: number[] = [];
  for (let i = Math.max(0, lastI - 6); i <= lastI; i++) {
    const cl = Number(candles[i]!.close);
    const u = upperI + slope * i;
    const l = lowerI + slope * i;
    if (cl > u + buf) closesOutsideUp.push(i);
    if (cl < l - buf) closesOutsideLo.push(i);
  }

  const recentlyBrokeUp = closesOutsideUp.length > 0;
  const recentlyBrokeLo = closesOutsideLo.length > 0;

  if (recentlyBrokeUp) {
    const first = closesOutsideUp[0]!;
    let back = false;
    for (let i = first + 1; i <= Math.min(lastI, first + fakeBreakBars); i++) {
      const cl = Number(candles[i]!.close);
      const u = upperI + slope * i;
      const l = lowerI + slope * i;
      if (cl <= u && cl >= l) {
        back = true;
        break;
      }
    }
    if (back) return 'FAILED_BREAKOUT';
    if (closesOutsideUp.length >= acceptanceBars || lastI - first + 1 >= acceptanceBars) {
      const hi = Number(candles[lastI]!.high);
      const loW = Number(candles[lastI]!.low);
      if (Math.abs(loW - up) <= tol * 1.5 && close > up) return 'RETEST_UPPER';
      return 'BREAKOUT';
    }
    return 'BREAKOUT';
  }

  if (recentlyBrokeLo) {
    const first = closesOutsideLo[0]!;
    let back = false;
    for (let i = first + 1; i <= Math.min(lastI, first + fakeBreakBars); i++) {
      const cl = Number(candles[i]!.close);
      const u = upperI + slope * i;
      const l = lowerI + slope * i;
      if (cl <= u && cl >= l) {
        back = true;
        break;
      }
    }
    if (back) return 'FAILED_BREAKDOWN';
    if (closesOutsideLo.length >= acceptanceBars || lastI - first + 1 >= acceptanceBars) {
      const hi = Number(candles[lastI]!.high);
      if (Math.abs(hi - lo) <= tol * 1.5 && close < lo) return 'RETEST_LOWER';
      return 'BREAKDOWN';
    }
    return 'BREAKDOWN';
  }

  if (Math.abs(Number(candles[lastI]!.high) - up) <= tol) return 'UPPER_TEST';
  if (Math.abs(Number(candles[lastI]!.low) - lo) <= tol) return 'LOWER_TEST';
  if (score >= strongScore) return 'STRONG';
  if (score >= validScore) return 'VALID';
  return 'FORMING';
}

function gradeFromScore(score: number, strong: number, valid: number, weak: number): ChannelGrade {
  if (score >= strong) return 'STRONG';
  if (score >= valid) return 'VALID';
  if (score >= weak) return 'WEAK';
  return 'HIDDEN';
}

type CandidateDraft = {
  type: ChannelType;
  slope: number;
  lowerIntercept: number;
  upperIntercept: number;
  channelHeight: number;
  startIndex: number;
  lastIndex: number;
  basePivots: ChannelPivot[];
  oppositePivots: ChannelPivot[];
  slopeStab: number;
  anchorKey: string;
};

function buildAscendingCandidates(
  lows: ChannelPivot[],
  highs: ChannelPivot[],
  candles: Candle[],
  atr: number,
  opts: EngineCfg
): CandidateDraft[] {
  const look = Math.max(3, opts.lookbackPivots ?? 10);
  const pool = lows.slice(-look);
  if (pool.length < 3) return [];
  const midPx = Number(candles[candles.length - 1]?.close) || 1;
  const minSlope =
    opts.minimumSlope != null ? opts.minimumSlope : (midPx * 0.00005) / Math.max(1, atr);
  const tol = Math.max(atr * 0.28, midPx * 0.0012);
  const minDx = Math.max(4, opts.pivotLength ?? 5);
  const windowEnd = candles.length - 1;
  const out: CandidateDraft[] = [];

  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      const p1 = pool[a]!;
      const p2 = pool[b]!;
      const dx = p2.index - p1.index;
      if (dx < minDx) continue;
      if (!(p2.price > p1.price)) continue;
      const slope = (p2.price - p1.price) / dx;
      if (!(slope > minSlope)) continue;
      const intercept = p1.price - slope * p1.index;
      const touches = pool.filter(
        (p) => Math.abs(p.price - (intercept + slope * p.index)) <= tol
      );
      if (touches.length < (opts.minimumBasePivots ?? 3)) continue;

      const windowStart = p1.index;
      if (windowEnd - windowStart + 1 < (opts.minimumBars ?? 20)) continue;

      const opp = highs.filter((h) => h.index >= windowStart && h.index <= windowEnd);
      if (opp.length < (opts.minimumOppositePivots ?? 2)) continue;

      const height = outerRailDistance(
        opp.map((h) => h.price - (intercept + slope * h.index)),
        atr,
        opts.minimumWidthATR ?? 0.35
      );
      if (height == null) continue;

      const sortedTouches = [...touches].sort((x, y) => x.index - y.index);
      out.push({
        type: 'ascending',
        slope,
        lowerIntercept: intercept,
        upperIntercept: intercept + height,
        channelHeight: height,
        startIndex: windowStart,
        lastIndex: windowEnd,
        basePivots: sortedTouches,
        oppositePivots: opp,
        slopeStab: slopeStabilityFromPivots(sortedTouches),
        anchorKey: `ascending|${p1.time}|${p2.time}`,
      });
    }
  }
  return out;
}

function buildDescendingCandidates(
  highs: ChannelPivot[],
  lows: ChannelPivot[],
  candles: Candle[],
  atr: number,
  opts: EngineCfg
): CandidateDraft[] {
  const look = Math.max(3, opts.lookbackPivots ?? 10);
  const pool = highs.slice(-look);
  if (pool.length < 3) return [];
  const midPx = Number(candles[candles.length - 1]?.close) || 1;
  const minSlopeAbs =
    opts.minimumSlope != null ? opts.minimumSlope : (midPx * 0.00005) / Math.max(1, atr);
  const tol = Math.max(atr * 0.28, midPx * 0.0012);
  const minDx = Math.max(4, opts.pivotLength ?? 5);
  const windowEnd = candles.length - 1;
  const out: CandidateDraft[] = [];

  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      const p1 = pool[a]!;
      const p2 = pool[b]!;
      const dx = p2.index - p1.index;
      if (dx < minDx) continue;
      if (!(p2.price < p1.price)) continue;
      const slope = (p2.price - p1.price) / dx;
      if (!(slope < -minSlopeAbs)) continue;
      const intercept = p1.price - slope * p1.index;
      const touches = pool.filter(
        (p) => Math.abs(p.price - (intercept + slope * p.index)) <= tol
      );
      if (touches.length < (opts.minimumBasePivots ?? 3)) continue;

      const windowStart = p1.index;
      if (windowEnd - windowStart + 1 < (opts.minimumBars ?? 20)) continue;

      const opp = lows.filter((l) => l.index >= windowStart && l.index <= windowEnd);
      if (opp.length < (opts.minimumOppositePivots ?? 2)) continue;

      const height = outerRailDistance(
        opp.map((l) => intercept + slope * l.index - l.price),
        atr,
        opts.minimumWidthATR ?? 0.35
      );
      if (height == null) continue;

      const sortedTouches = [...touches].sort((x, y) => x.index - y.index);
      out.push({
        type: 'descending',
        slope,
        lowerIntercept: intercept - height,
        upperIntercept: intercept,
        channelHeight: height,
        startIndex: windowStart,
        lastIndex: windowEnd,
        basePivots: sortedTouches,
        oppositePivots: opp,
        slopeStab: slopeStabilityFromPivots(sortedTouches),
        anchorKey: `descending|${p1.time}|${p2.time}`,
      });
    }
  }
  return out;
}

function buildSidewaysCandidates(
  highs: ChannelPivot[],
  lows: ChannelPivot[],
  candles: Candle[],
  atr: number,
  opts: EngineCfg
): CandidateDraft[] {
  const look = Math.max(4, opts.lookbackPivots ?? 10);
  const hiPool = highs.slice(-look);
  const loPool = lows.slice(-look);
  if (hiPool.length < 2 || loPool.length < 2) return [];
  const midPx = Number(candles[candles.length - 1]?.close) || 1;
  const flat =
    opts.flatSlopeThreshold != null
      ? opts.flatSlopeThreshold
      : (midPx * 0.00015) / Math.max(1, atr);

  const allHi = hiPool.map((p) => p.price);
  const allLo = loPool.map((p) => p.price);
  if (stdev(allHi) > atr * 1.2 || stdev(allLo) > atr * 1.2) return [];

  const upper = median(allHi);
  const lower = median(allLo);
  const height = upper - lower;
  if (!(height > atr * (opts.minimumWidthATR ?? 0.35))) return [];

  const start = Math.min(
    ...hiPool.map((p) => p.index),
    ...loPool.map((p) => p.index)
  );
  const end = candles.length - 1;
  if (end - start + 1 < (opts.minimumBars ?? 20)) return [];

  /** near-zero slope from mid of highs+lows Theil-Sen */
  const pts = [...hiPool, ...loPool].sort((a, b) => a.index - b.index);
  const fit = theilSenSlope(
    pts.map((p) => p.index),
    pts.map((p) => p.price)
  );
  const slope = fit && Math.abs(fit.slope) <= flat ? fit.slope : 0;
  if (Math.abs(slope) > flat) return [];

  const midI = (start + end) / 2;
  const midY = (upper + lower) / 2;
  const lowerI = midY - height / 2 - slope * midI;
  const upperI = lowerI + height;

  return [
    {
      type: 'sideways',
      slope,
      lowerIntercept: lowerI,
      upperIntercept: upperI,
      channelHeight: height,
      startIndex: start,
      lastIndex: end,
      basePivots: loPool.slice(-3),
      oppositePivots: hiPool.slice(-3),
      slopeStab: 0.95,
      anchorKey: 'sideways',
    },
  ];
}

function finalizeCandidate(
  draft: CandidateDraft,
  candles: Candle[],
  atr: number,
  opts: EngineCfg,
  id: string
): ParallelChannel | null {
  const {
    slope,
    lowerIntercept,
    upperIntercept,
    channelHeight,
    startIndex,
    lastIndex,
    type,
    basePivots,
    oppositePivots,
    slopeStab,
  } = draft;

  const bars = lastIndex - startIndex + 1;
  if (bars < (opts.minimumBars ?? 20)) return null;
  if (basePivots.length < (opts.minimumBasePivots ?? 3)) return null;
  if (oppositePivots.length < (opts.minimumOppositePivots ?? 2)) return null;

  const upperTouches = countTouches({
    candles,
    start: startIndex,
    end: lastIndex,
    slope,
    intercept: upperIntercept,
    side: 'upper',
    atr,
    tolAtr: opts.touchToleranceATR ?? 0.15,
    cooldown: opts.touchCooldownBars ?? 5,
  });
  const lowerTouches = countTouches({
    candles,
    start: startIndex,
    end: lastIndex,
    slope,
    intercept: lowerIntercept,
    side: 'lower',
    atr,
    tolAtr: opts.touchToleranceATR ?? 0.15,
    cooldown: opts.touchCooldownBars ?? 5,
  });

  if (upperTouches.count < (opts.minimumUpperTouches ?? 2)) return null;
  if (lowerTouches.count < (opts.minimumLowerTouches ?? 2)) return null;

  const insides = insideRatios({
    candles,
    start: startIndex,
    end: lastIndex,
    slope,
    lowerI: lowerIntercept,
    upperI: upperIntercept,
    atr,
    tolAtr: opts.touchToleranceATR ?? 0.15,
  });
  const insideRatio = insides.body * 0.65 + insides.wick * 0.35;
  if (insideRatio < (opts.minimumInsideRatio ?? 0.68)) return null;

  /** width stability — parallel → constant height; sample residual spread */
  const widthSamples: number[] = [];
  for (let i = startIndex; i <= lastIndex; i += Math.max(1, Math.floor(bars / 12))) {
    widthSamples.push(channelHeight);
  }
  const widthStab = 1; /** true parallel → perfect; keep geometry honest */
  void widthSamples;

  let volBoost = 0;
  let wickBoost = 0;
  let sfp = 0;
  for (const ti of [...upperTouches.indices, ...lowerTouches.indices].slice(-8)) {
    const vma = volumeMa(candles, ti);
    const vol = Number(candles[ti]?.volume) || 0;
    if (vma > 0 && vol / vma >= 1.35) volBoost += 0.2;
    const up = upperIntercept + slope * ti;
    const lo = lowerIntercept + slope * ti;
    const side = upperTouches.indices.includes(ti) ? 'upper' : 'lower';
    wickBoost += 0.15 * wickRejectBoost(candles, ti, side, side === 'upper' ? up : lo);
    sfp += 0.2 * sfpBoost(candles, ti, side, up, lo);
  }
  const volumeConf = Math.min(1, volBoost + wickBoost * 0.5);
  const recentReaction = Math.min(
    1,
    mean([
      reactionStats({ candles, touchIdx: upperTouches.indices, side: 'upper' }).rate,
      reactionStats({ candles, touchIdx: lowerTouches.indices, side: 'lower' }).rate,
      Math.min(1, sfp),
    ])
  );

  const score = scoreChannel({
    basePivotCount: basePivots.length,
    oppositePivotCount: oppositePivots.length,
    upperTouchW: upperTouches.weighted,
    lowerTouchW: lowerTouches.weighted,
    inside: insideRatio,
    slopeStab,
    widthStab,
    recentReaction,
    volumeConf,
  });

  const strongScore = opts.strongScore ?? 85;
  const validScore = opts.validScore ?? 70;
  const weakScore = opts.weakScore ?? 55;
  const grade = gradeFromScore(score, strongScore, validScore, weakScore);
  if (score < (opts.minimumDisplayScore ?? 60) || grade === 'HIDDEN') return null;

  const state = classifyState({
    candles,
    start: startIndex,
    end: lastIndex,
    slope,
    lowerI: lowerIntercept,
    upperI: upperIntercept,
    atr,
    bufferAtr: opts.breakoutBufferATR ?? 0.15,
    acceptanceBars: opts.acceptanceBars ?? 3,
    fakeBreakBars: opts.fakeBreakBars ?? 3,
    score,
    strongScore,
    validScore,
  });

  const active =
    state !== 'BROKEN' &&
    state !== 'BREAKOUT' &&
    state !== 'BREAKDOWN' &&
    insideRatio >= (opts.minimumInsideRatio ?? 0.68) * 0.85;

  const lastI = candles.length - 1;
  const loP = getLowerPrice({ lowerIntercept, slope }, lastI);
  const upP = getUpperPrice({ upperIntercept, slope }, lastI);
  const close = Number(candles[lastI]!.close);
  const position = upP > loP ? (close - loP) / (upP - loP) : 0.5;

  const upperReact = reactionStats({
    candles,
    touchIdx: upperTouches.indices,
    side: 'upper',
  });
  const lowerReact = reactionStats({
    candles,
    touchIdx: lowerTouches.indices,
    side: 'lower',
  });
  const recentReactionLabel =
    Math.abs(lowerReact.medianPct) >= Math.abs(upperReact.medianPct)
      ? lowerReact.lastLabel
      : upperReact.lastLabel;

  const buf = Math.max(atr * (opts.breakoutBufferATR ?? 0.15), close * 0.001);
  const breakConditionLabel =
    type === 'descending'
      ? `Upper Close > ${(upP + buf).toFixed(0)}`
      : `Lower Close < ${(loP - buf).toFixed(0)}`;

  return {
    id,
    type,
    slope,
    lowerIntercept,
    upperIntercept,
    midIntercept: (lowerIntercept + upperIntercept) / 2,
    channelHeight,
    startIndex,
    lastIndex,
    upperTouches: upperTouches.count,
    lowerTouches: lowerTouches.count,
    insideRatio,
    bodyInsideRatio: insides.body,
    wickInsideRatio: insides.wick,
    slopeStability: slopeStab,
    widthStability: widthStab,
    score,
    grade,
    state,
    active,
    position,
    upperRejectionRate: upperReact.rate,
    lowerBounceRate: lowerReact.rate,
    meanReaction: mean([upperReact.meanPct, lowerReact.meanPct]),
    medianReaction: median([upperReact.medianPct, lowerReact.medianPct]),
    recentReactionLabel,
    breakConditionLabel,
    basePivotCount: basePivots.length,
    oppositePivotCount: oppositePivots.length,
    anchorKey: draft.anchorKey,
  };
}

function dedupeChannels(channels: ParallelChannel[], atr: number): ParallelChannel[] {
  const sorted = [...channels].sort((a, b) => b.score - a.score);
  const kept: ParallelChannel[] = [];
  for (const ch of sorted) {
    const midI = (ch.startIndex + ch.lastIndex) / 2;
    const center = getMidPrice(ch, midI);
    let dup = false;
    for (const k of kept) {
      const kMidI = (k.startIndex + k.lastIndex) / 2;
      const kCenter = getMidPrice(k, kMidI);
      const slopeRef = Math.max(Math.abs(k.slope), Math.abs(ch.slope), 1e-12);
      const slopeDiff = Math.abs(ch.slope - k.slope) / slopeRef;
      const centerDist = Math.abs(center - kCenter);
      const startClose = Math.abs(ch.startIndex - k.startIndex) <= 12;
      if (slopeDiff < 0.1 && centerDist < atr * 0.3 && startClose && ch.type === k.type) {
        dup = true;
        break;
      }
    }
    if (!dup) kept.push(ch);
  }
  return kept;
}

function selectForDisplay(
  channels: ParallelChannel[],
  opts: EngineCfg
): ParallelChannel[] {
  /** 최신 AI 트레이더 스타일: 점수 1위 채널만 · 상·하 한 쌍 */
  const ranked = [...channels].sort((a, b) => b.score - a.score);
  const max = Math.max(1, opts.maxDisplayedChannels ?? 1);
  return ranked.slice(0, max);
}

function colorsFor(type: ChannelType): {
  upper: string;
  lower: string;
  mid: string;
  fill: string;
  zone: string;
} {
  /** 저항=빨강 · 지지=초록 (채널 방향과 무관) */
  return {
    upper: 'rgba(239,68,68,0.92)',
    lower: 'rgba(34,197,94,0.92)',
    mid: 'rgba(161,161,170,0.45)',
    fill:
      type === 'descending'
        ? 'rgba(239,68,68,0.06)'
        : type === 'ascending'
          ? 'rgba(34,197,94,0.06)'
          : 'rgba(161,161,170,0.05)',
    zone: 'rgba(161,161,170,0.08)',
  };
}

function typeShort(type: ChannelType): string {
  if (type === 'ascending') return 'ASC';
  if (type === 'descending') return 'DESC';
  return 'SIDE';
}

export function parallelChannelToOverlays(
  ch: ParallelChannel,
  candles: Candle[],
  atr: number,
  tipPad = MERGED_DESK_RB_FUTURE_BARS
): OverlayItem[] {
  if (!candles.length) return [];
  void atr;
  const i0 = Math.max(0, Math.min(ch.startIndex, candles.length - 1));
  const i1 = Math.max(0, Math.min(ch.lastIndex, candles.length - 1));
  const t1 = Number(candles[i0]!.time);
  const step = barStepSec(candles);
  const t2 = Number(candles[i1]!.time) + tipPad * step;
  const iEnd = i1 + tipPad;

  const lo1 = getLowerPrice(ch, i0);
  const lo2 = getLowerPrice(ch, iEnd);
  const up1 = getUpperPrice(ch, i0);
  const up2 = getUpperPrice(ch, iEnd);
  const mid2 = getMidPrice(ch, iEnd);
  const col = colorsFor(ch.type);
  const posPct = Math.round(Math.max(0, Math.min(1, ch.position)) * 100);
  const tip = [
    `${typeShort(ch.type)} CHANNEL`,
    `Score ${ch.score} · ${ch.grade}`,
    `Position ${posPct}%`,
    `Upper ${up2.toFixed(0)} · Mid ${mid2.toFixed(0)} · Lower ${lo2.toFixed(0)}`,
    `Touch U${ch.upperTouches}/L${ch.lowerTouches} · Inside ${(ch.insideRatio * 100).toFixed(0)}%`,
    `State ${ch.state}`,
    `최근 반응: ${ch.recentReactionLabel}`,
    `Break: ${ch.breakConditionLabel}`,
  ].join('\n');

  const overlays: OverlayItem[] = [];
  const baseId = `eagle1-pce-${ch.id}`;

  /** 최신형: 연한 채널면 1개 + 상단선 1 + 하단선 1 (중선·존·핀 라벨 없음) */
  overlays.push({
    id: `${baseId}-band`,
    kind: 'channelBand',
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: t2,
    price1: up1,
    price2: up2,
    confidence: Math.min(0.99, ch.score / 100),
    color: col.fill,
    category: 'parallelChannelEngine',
    noProject: true,
    channelBand: {
      time1: t1,
      time2: t2,
      priceHigh1: up1,
      priceHigh2: up2,
      priceLow1: lo1,
      priceLow2: lo2,
    },
    labelTooltip: tip,
    lineLabelColor: col.upper,
    overlayZoneExtraClass: `eagle1-pce eagle1-pce-clean eagle1-pce-${ch.type} eagle1-pce-${ch.grade.toLowerCase()}`,
    zoneFillPreserve: true,
  });

  const pushEdge = (suffix: 'upper' | 'lower', p1: number, p2: number, color: string) => {
    overlays.push({
      id: `${baseId}-${suffix}`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      price1: p1,
      time2: t2,
      price2: p2,
      confidence: Math.min(0.99, ch.score / 100),
      color,
      category: 'parallelChannelEngine',
      lineStrokeWidth: 2,
      noProject: true,
      labelTooltip: tip,
      lineLabelColor: color,
      overlayZoneExtraClass: `eagle1-pce eagle1-pce-edge eagle1-pce-${suffix} eagle1-pce-${ch.type}`,
    });
  };

  pushEdge('upper', up1, up2, col.upper);
  pushEdge('lower', lo1, lo2, col.lower);
  const mid1 = getMidPrice(ch, i0);
  overlays.push({
    id: `${baseId}-mid`,
    kind: 'trendLine',
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    price1: mid1,
    time2: t2,
    price2: mid2,
    confidence: Math.min(0.99, ch.score / 100),
    color: col.mid,
    category: 'parallelChannelEngine',
    lineStrokeWidth: 1,
    lineDash: '5 4',
    noProject: true,
    labelTooltip: tip,
    lineLabelColor: col.mid,
    overlayZoneExtraClass: `eagle1-pce eagle1-pce-edge eagle1-pce-mid eagle1-pce-${ch.type}`,
  });

  return overlays;
}

const SWITCH_MARGIN = 12;
const LOCK_MISS_BARS = 6;

type ChannelLock = {
  anchorKey: string;
  score: number;
  channel: ParallelChannel;
  misses: number;
  /** 이 시각의 마감봉에서만 miss 를 1 올린다. 형성봉 틱에는 유지. */
  structureTime: number;
};

const channelLocks = new Map<string, ChannelLock>();

function anchorTimes(key: string): number[] {
  return key
    .split('|')
    .slice(1)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function latestAnchorTime(key: string): number {
  const xs = anchorTimes(key);
  return xs.length ? Math.max(...xs) : 0;
}

function lockAnchorsAlive(anchorKey: string, times: Set<number>): boolean {
  const xs = anchorTimes(anchorKey);
  if (!xs.length) return true;
  return xs.every((t) => times.has(t));
}

function acceptedOutside(
  ch: ParallelChannel,
  candles: Candle[],
  atr: number,
  bufferAtr: number,
  need: number
): boolean {
  const end = candles.length - 1;
  if (end < 0) return false;
  const bufPx = Math.max(atr * bufferAtr, (Number(candles[end]?.close) || 1) * 0.001);
  let n = 0;
  for (let i = end; i >= Math.max(0, end - 8); i--) {
    const cl = Number(candles[i]?.close);
    const up = ch.upperIntercept + ch.slope * i;
    const lo = ch.lowerIntercept + ch.slope * i;
    if (cl > up + bufPx || cl < lo - bufPx) n++;
    else break;
  }
  return n >= Math.max(2, need);
}

function sameChannelFamily(next: ParallelChannel, prev: ParallelChannel): boolean {
  if (next.type !== prev.type) return false;
  if (next.type === 'sideways') return true;
  const have = new Set(anchorTimes(next.anchorKey).map(String));
  let share = 0;
  for (const t of anchorTimes(prev.anchorKey)) {
    if (have.has(String(t))) share++;
  }
  if (share < 1) return false;
  const slopeRef = Math.max(Math.abs(prev.slope), Math.abs(next.slope), 1e-12);
  return Math.abs(next.slope - prev.slope) / slopeRef <= 0.18;
}

function rememberLock(key: string, ch: ParallelChannel, structureTime: number): ParallelChannel {
  if (channelLocks.size > 32 && !channelLocks.has(key)) {
    const first = channelLocks.keys().next().value;
    if (first) channelLocks.delete(first);
  }
  channelLocks.set(key, {
    anchorKey: ch.anchorKey,
    score: ch.score,
    channel: ch,
    misses: 0,
    structureTime,
  });
  return ch;
}

/**
 * 점수 1~2점 차이로 채널이 갈아끼워지지 않게 고정한다.
 * 형성봉은 여기 오기 전에 이미 빠져 있다.
 */
function applyChannelLock(params: {
  lockKey: string;
  best: ParallelChannel | null;
  sameNow: ParallelChannel | null;
  confirmedTimes: Set<number>;
  drawEnd: number;
  atr: number;
  freshState: ChannelState | null;
  structureTime: number;
  acceptedBreak: boolean;
}): ParallelChannel | null {
  const {
    lockKey,
    best,
    sameNow,
    confirmedTimes,
    drawEnd,
    atr,
    freshState,
    structureTime,
    acceptedBreak,
  } = params;
  const prev = channelLocks.get(lockKey);
  const extend = (ch: ParallelChannel, state?: ChannelState): ParallelChannel => ({
    ...ch,
    lastIndex: Math.max(ch.lastIndex, drawEnd),
    state: state ?? ch.state,
  });

  if (!prev || !lockAnchorsAlive(prev.anchorKey, confirmedTimes)) {
    if (!best) {
      channelLocks.delete(lockKey);
      return null;
    }
    return rememberLock(lockKey, extend(best), structureTime);
  }

  const lockedScore = sameNow?.score ?? prev.score;
  const barAdvanced = prev.structureTime !== structureTime;
  if (!best) {
    const held = extend(prev.channel, freshState ?? undefined);
    channelLocks.set(lockKey, {
      ...prev,
      channel: held,
      score: lockedScore,
      structureTime,
    });
    return held;
  }

  if (acceptedBreak && best.active) {
    return rememberLock(lockKey, extend(best), structureTime);
  }

  if (best.anchorKey === prev.anchorKey) {
    if (best.type === 'sideways') {
      const shift = Math.max(
        Math.abs(best.upperIntercept - prev.channel.upperIntercept),
        Math.abs(best.lowerIntercept - prev.channel.lowerIntercept)
      );
      if (shift < atr * 0.45 && best.score < lockedScore + SWITCH_MARGIN) {
        const held = extend(prev.channel, freshState ?? undefined);
        channelLocks.set(lockKey, {
          ...prev,
          channel: held,
          score: lockedScore,
          misses: 0,
          structureTime,
        });
        return held;
      }
    }
    return rememberLock(lockKey, extend(best), structureTime);
  }

  if (sameChannelFamily(best, prev.channel)) {
    const newer = latestAnchorTime(best.anchorKey) > latestAnchorTime(prev.anchorKey);
    if (newer || best.score >= lockedScore + SWITCH_MARGIN) {
      return rememberLock(lockKey, extend(best), structureTime);
    }
  } else if (best.score >= lockedScore + SWITCH_MARGIN) {
    return rememberLock(lockKey, extend(best), structureTime);
  }

  const misses = sameNow ? 0 : barAdvanced ? prev.misses + 1 : prev.misses;
  if (misses >= LOCK_MISS_BARS && best.active) {
    return rememberLock(lockKey, extend(best), structureTime);
  }
  const held = extend(prev.channel, freshState ?? undefined);
  channelLocks.set(lockKey, { ...prev, channel: held, score: lockedScore, misses, structureTime });
  return held;
}

/**
 * 메인 엔트리 — 마감봉의 확정 피벗만으로 후보를 만들고, 고른 채널은 고정한다.
 * 형성봉의 꼬리는 기울기를 바꾸지 않는다. 새 스윙이 확정되거나 점수가 확실히 벌어질 때만 교체.
 */
export function buildParallelChannelEngine(
  candles: Candle[],
  opts?: ParallelChannelEngineOpts
): ParallelChannelEnginePack {
  const cfg = { ...DEFAULTS, ...opts };
  const empty: ParallelChannelEnginePack = { pivots: [], channels: [], overlays: [] };
  const need = (cfg.minimumBars ?? 20) + (cfg.pivotLength ?? 5) * 2;
  if (!candles || candles.length < need + 1) {
    return empty;
  }

  /** 마지막 봉은 형성 중일 수 있다. 꼬리가 피벗·점수를 뒤집지 못하게 마감봉만 쓴다. */
  const structure = candles.slice(0, -1);
  const pivotsAll = detectChannelPivots(structure, cfg.pivotLength);
  const confirmed = pivotsAll.filter((p) => p.status === 'CONFIRMED');
  const highs = confirmed.filter((p) => p.kind === 'high').sort((a, b) => a.index - b.index);
  const lows = confirmed.filter((p) => p.kind === 'low').sort((a, b) => a.index - b.index);
  const atr = lastAtr(structure);

  const drafts: CandidateDraft[] = [
    ...buildAscendingCandidates(lows, highs, structure, atr, cfg),
    ...buildDescendingCandidates(highs, lows, structure, atr, cfg),
    ...buildSidewaysCandidates(highs, lows, structure, atr, cfg),
  ];

  const finalized: ParallelChannel[] = [];
  let seq = 0;
  for (const d of drafts) {
    seq++;
    const id = (d.anchorKey || `${String(d.type || 'ch').slice(0, 3)}-${d.startIndex}-${seq}`).replace(
      /\|/g,
      '-'
    );
    const ch = finalizeCandidate(d, structure, atr, cfg, id);
    if (ch) finalized.push(ch);
  }

  const deduped = dedupeChannels(finalized, atr);
  const shown = selectForDisplay(deduped, cfg);
  const best = shown[0] ?? null;
  const lockKey =
    (opts?.lockKey || '').trim() ||
    `${Number(candles[0]?.time) || 0}|${Math.round(barStepSec(candles))}`;
  const confirmedTimes = new Set(confirmed.map((p) => p.time).filter((t) => t > 0));
  const prev = channelLocks.get(lockKey);
  const sameNow = prev ? (finalized.find((c) => c.anchorKey === prev.anchorKey) ?? null) : null;
  let freshState: ChannelState | null = null;
  if (prev) {
    const end = Math.min(Math.max(prev.channel.startIndex, structure.length - 1), structure.length - 1);
    freshState = classifyState({
      candles: structure,
      start: Math.max(0, Math.min(prev.channel.startIndex, end)),
      end,
      slope: prev.channel.slope,
      lowerI: prev.channel.lowerIntercept,
      upperI: prev.channel.upperIntercept,
      atr,
      bufferAtr: cfg.breakoutBufferATR,
      acceptanceBars: cfg.acceptanceBars,
      fakeBreakBars: cfg.fakeBreakBars,
      score: prev.score,
      strongScore: cfg.strongScore,
      validScore: cfg.validScore,
    });
  }
  const picked = applyChannelLock({
    lockKey,
    best,
    sameNow,
    confirmedTimes,
    drawEnd: candles.length - 1,
    atr,
    freshState,
    structureTime: Number(structure[structure.length - 1]?.time) || 0,
    acceptedBreak: prev
      ? acceptedOutside(
          prev.channel,
          structure,
          atr,
          cfg.breakoutBufferATR,
          cfg.acceptanceBars
        )
      : false,
  });
  const channels = picked ? [picked] : [];
  const overlays = channels.flatMap((ch) =>
    parallelChannelToOverlays(ch, candles, atr, cfg.tipPad)
  );

  return {
    pivots: pivotsAll,
    channels,
    overlays,
  };
}
