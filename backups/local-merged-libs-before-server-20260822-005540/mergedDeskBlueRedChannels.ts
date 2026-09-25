/**
 * 통합·분석 — 파란/빨간 평행 추세 채널 (업그레이드).
 * 스윙피벗 품질·터치수·폭 정규화 · 단기(주)·장기(보조) 계층.
 * geometry는 채널머니와 공유 · 확정 매매·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import {
  collectSwingPivots,
  pickSwingPivotPair,
  type CandlePivot,
} from '@/lib/mergedDeskCandleTrendline';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { mergedDesk4hReferencePivotWindowForTf } from '@/lib/mergedDesk4hReference';
import {
  explainMergedDeskRbLabel,
  mergedDeskRbTooltipLines,
} from '@/lib/mergedDeskBlueRedLabelGuide';
import { defaultSettings, loadSettings } from '@/lib/settings';
import { MERGED_DESK_RB_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { isMergedDeskRbDrawOverlay } from '@/lib/mergedAnalysisOverlayIds';
import {
  mergeRbVolumeSyncTooltip,
  rbVolumeSyncExtraClass,
  type MergedDeskRbVolumeSyncPack,
} from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';

export { MERGED_DESK_RB_FUTURE_BARS, isMergedDeskRbDrawOverlay };

export type MergedDeskChannelHorizon = 'short' | 'long' | 'fb';

export function mergedDeskBarStepSec(candles: Candle[], iEnd: number): number {
  if (iEnd >= 1) {
    const d = Number(candles[iEnd]!.time) - Number(candles[iEnd - 1]!.time);
    if (Number.isFinite(d) && d > 0) return d;
  }
  if (candles.length >= 2) {
    const d =
      Number(candles[candles.length - 1]!.time) - Number(candles[0]!.time);
    if (Number.isFinite(d) && d > 0) return d / Math.max(1, candles.length - 1);
  }
  return 3600;
}

export function mergedDeskRbFutureTime2(candles: Candle[], tEnd: number, iEnd: number, pad = MERGED_DESK_RB_FUTURE_BARS): number {
  const n = Math.max(0, Math.round(pad));
  return tEnd + mergedDeskBarStepSec(candles, iEnd) * n;
}

/** 마지막 종가가 채널 밖인지 */
export type MergedDeskChannelBreakout = 'none' | 'up' | 'down';

/** 파란·빨간 띠 사용자 조절값 (차트설정 → 파란·빨간 띠) */
export type MergedDeskRbStyle = {
  showShort: boolean;
  showLong: boolean;
  showConfluence: boolean;
  showEdges: boolean;
  showMid: boolean;
  showLabels: boolean;
  bullHex: string;
  bearHex: string;
  confluenceHex: string;
  /** 0~1 */
  fillOpacity: number;
  lineWidth: number;
  widthScale: number;
  minQuality: number;
  /** 레일을 캔들 꼬리에 붙일지 몸통에 붙일지 */
  anchorMode: MergedDeskRbAnchorMode;
};

export const DEFAULT_MERGED_DESK_RB_STYLE: MergedDeskRbStyle = {
  showShort: true,
  showLong: true,
  showConfluence: true,
  showEdges: true,
  showMid: true,
  showLabels: true,
  bullHex: defaultSettings.chartMergedDeskRbBullHex,
  bearHex: defaultSettings.chartMergedDeskRbBearHex,
  confluenceHex: defaultSettings.chartMergedDeskRbConfluenceHex,
  fillOpacity: defaultSettings.chartMergedDeskRbFillOpacity / 100,
  lineWidth: defaultSettings.chartMergedDeskRbLineWidth,
  widthScale: defaultSettings.chartMergedDeskRbWidthScale,
  minQuality: defaultSettings.chartMergedDeskRbMinQuality,
  anchorMode: 'auto',
};

function normalizeRbLegacyBullHex(raw: unknown): string {
  const h = String(raw || '').trim();
  const u = h.toUpperCase();
  if (!h || u === '#5B8EC4' || u === '#3B82F6' || u === '#60A5FA' || u === '#2563EB') return '#22C55E';
  return h;
}
function normalizeRbLegacyBearHex(raw: unknown): string {
  const h = String(raw || '').trim();
  const u = h.toUpperCase();
  if (!h || u === '#C98989') return '#EF4444';
  return h;
}
function normalizeRbLegacyConfHex(raw: unknown): string {
  const h = String(raw || '').trim();
  const u = h.toUpperCase();
  if (!h || u === '#9589B8') return '#CA8A04';
  return h;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** 저장된 설정 → 스타일. SSR·미저장이면 기본값 */
export function mergedDeskRbStyleFromSettings(): MergedDeskRbStyle {
  if (typeof window === 'undefined') return DEFAULT_MERGED_DESK_RB_STYLE;
  try {
    const s = loadSettings();
    return {
      showShort: s.chartMergedDeskRbShowShort !== false,
      showLong: s.chartMergedDeskRbShowLong !== false,
      showConfluence: s.chartMergedDeskRbShowConfluence !== false,
      showEdges: s.chartMergedDeskRbShowEdges !== false,
      showMid: s.chartMergedDeskRbShowMid !== false,
      showLabels: s.chartMergedDeskRbShowLabels !== false,
      bullHex: normalizeRbLegacyBullHex(s.chartMergedDeskRbBullHex) || DEFAULT_MERGED_DESK_RB_STYLE.bullHex,
      bearHex: normalizeRbLegacyBearHex(s.chartMergedDeskRbBearHex) || DEFAULT_MERGED_DESK_RB_STYLE.bearHex,
      confluenceHex:
        normalizeRbLegacyConfHex(s.chartMergedDeskRbConfluenceHex) ||
        DEFAULT_MERGED_DESK_RB_STYLE.confluenceHex,
      fillOpacity: clampNum(s.chartMergedDeskRbFillOpacity, 0, 60, 30) / 100,
      lineWidth: clampNum(s.chartMergedDeskRbLineWidth, 1, 4, 2.5),
      widthScale: clampNum(s.chartMergedDeskRbWidthScale, 0.5, 2, 1),
      minQuality: clampNum(s.chartMergedDeskRbMinQuality, 0, 90, 0),
      anchorMode:
        s.chartMergedDeskRbAnchorMode === 'wick' || s.chartMergedDeskRbAnchorMode === 'body'
          ? s.chartMergedDeskRbAnchorMode
          : 'auto',
    };
  } catch {
    return DEFAULT_MERGED_DESK_RB_STYLE;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = String(hex || '').replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 34, g: 197, b: 94 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** 아래쪽 경계선용 — 같은 계열 어두운 톤 */
function shade(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = Math.max(0, factor);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export type MergedDeskChannelGeom = {
  horizon: MergedDeskChannelHorizon;
  horizonKo: '단기' | '장기' | '스윙';
  descending: boolean;
  useBearFill: boolean;
  tipUpper: number;
  tipLower: number;
  tipMid: number;
  width: number;
  tStart: number;
  tEnd: number;
  up1: number;
  up2: number;
  lo1: number;
  lo2: number;
  /** 0~100 — 피벗·터치·폭 품질 */
  quality: number;
  touchHigh: number;
  touchLow: number;
  /** 게이트·면 강조 대상(결정 호라이즌). 기본 구축 시 단기=true, 이후 promote로 바뀔 수 있음 */
  primary: boolean;
  slopePct: number;
  /** 스윙 기준 보강 지표 — 없으면 구버전 팩 */
  /** 종가가 채널 안에 있던 비율 0~1 */
  containment?: number;
  /** 채널 구축에 쓰인 스윙 개수(고+저) */
  swingCount?: number;
  /** 기준 레일이 고점선인지 저점선인지 */
  baseRail?: 'high' | 'low';
  /** 마지막 종가의 채널 내 위치 % (0=하단, 100=상단) */
  posPct?: number;
  /** 종가 이탈 방향 */
  breakout?: MergedDeskChannelBreakout;
  /** 이탈 유지 봉수 */
  breakoutBars?: number;
};

/** 단기∩장기 중착 복도 (겹침이 있을 때만) */
export type MergedDeskChannelConfluence = {
  tipUpper: number;
  tipLower: number;
  tipMid: number;
  width: number;
  overlapPct: number;
  tStart: number;
  tEnd: number;
  aligned: boolean;
};

export type MergedDeskBlueRedChannelPack = {
  overlays: OverlayItem[];
  geoms: MergedDeskChannelGeom[];
  summaryKo: string;
  confluence: MergedDeskChannelConfluence | null;
};

function work(candles: Candle[], timeframe: string): Candle[] {
  return sanitizeChartCandlesForSeries(mergedWorkCandles(candles, timeframe), timeframe);
}

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const h = candles[i]!.high;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.high >= h) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.high > h) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i]!.low;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.low < lo) return false;
  }
  return true;
}

export type SwingPoint = CandlePivot & { kind: 'high' | 'low' };

/** 최근 구간 ATR — 스윙 유의성·터치 허용오차 기준 */
function recentAtr(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < 3) return 0;
  const start = Math.max(1, n - period);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    cnt += 1;
  }
  return cnt ? sum / cnt : 0;
}

/**
 * 프랙탈 피벗 → 고·저 교대 스윙 시퀀스.
 * 같은 방향이 연속이면 더 극단만 남기고, ATR 미만 잔파동은 스윙으로 인정하지 않는다.
 */
function buildSwingSequence(
  candles: Candle[],
  timeframe: string,
  lookback: number,
  atr: number
): SwingPoint[] {
  const { L, R } = mergedDesk4hReferencePivotWindowForTf(timeframe);
  const start = Math.max(L, candles.length - lookback);
  const raw: SwingPoint[] = [];
  for (let i = start; i < candles.length - R; i++) {
    if (i - L < 0) continue;
    const c = candles[i]!;
    if (pivotHigh(candles, i, L, R)) {
      raw.push({ i, price: c.high, time: Number(c.time), kind: 'high' });
    }
    if (pivotLow(candles, i, L, R)) {
      raw.push({ i, price: c.low, time: Number(c.time), kind: 'low' });
    }
  }
  raw.sort((a, b) => a.i - b.i);

  const minLeg = atr > 0 ? atr * 0.55 : 0;
  const seq: SwingPoint[] = [];
  for (const p of raw) {
    const last = seq[seq.length - 1];
    if (!last) {
      seq.push(p);
      continue;
    }
    if (last.kind === p.kind) {
      const moreExtreme = p.kind === 'high' ? p.price > last.price : p.price < last.price;
      if (moreExtreme) seq[seq.length - 1] = p;
      continue;
    }
    if (Math.abs(p.price - last.price) < minLeg) continue;
    seq.push(p);
  }
  return seq;
}

/** 스윙 시퀀스에서 최근 n개의 고 또는 저 */
function lastSwings(seq: SwingPoint[], kind: 'high' | 'low', count: number): SwingPoint[] {
  const all = seq.filter((s) => s.kind === kind);
  return all.slice(Math.max(0, all.length - count));
}

/** 레일이 붙을 자리 — 꼬리(고·저) 또는 몸통(시·종가 극단) */
export type MergedDeskRbAnchorMode = 'auto' | 'wick' | 'body';
type AnchorSeries = 'wick' | 'body';

function anchorHigh(c: Candle, mode: AnchorSeries): number {
  return mode === 'wick' ? c.high : Math.max(Number(c.open), Number(c.close));
}
function anchorLow(c: Candle, mode: AnchorSeries): number {
  return mode === 'wick' ? c.low : Math.min(Number(c.open), Number(c.close));
}

type Tangent = {
  /** line(i) = intercept + slope * i */
  intercept: number;
  slope: number;
  touches: number;
  firstTouch: number;
  lastTouch: number;
  /** 선과 캔들 극단 사이 평균 간격 — 작을수록 밀착 */
  meanGap: number;
  at: (i: number) => number;
};

function tangentFromIntercept(
  candles: Candle[],
  iStart: number,
  iEnd: number,
  slope: number,
  side: 'high' | 'low',
  mode: AnchorSeries,
  intercept: number,
  tol: number
): Tangent | null {
  if (!Number.isFinite(intercept)) return null;
  const at = (i: number) => intercept + slope * i;
  let touches = 0;
  let firstTouch = -1;
  let lastTouch = -1;
  let gapSum = 0;
  let cnt = 0;
  let prevTouch = -99;
  for (let i = iStart; i <= iEnd; i++) {
    const c = candles[i];
    if (!c) continue;
    const v = side === 'high' ? anchorHigh(c, mode) : anchorLow(c, mode);
    if (!Number.isFinite(v)) continue;
    const gap = side === 'high' ? at(i) - v : v - at(i);
    gapSum += Math.max(0, gap);
    cnt += 1;
    if (Math.abs(gap) <= tol && i - prevTouch >= 2) {
      touches += 1;
      prevTouch = i;
      if (firstTouch < 0) firstTouch = i;
      lastTouch = i;
    }
  }
  if (!cnt) return null;
  return { intercept, slope, touches, firstTouch, lastTouch, meanGap: gapSum / cnt, at };
}

/**
 * 극단 꼬리 1개를 빼고 스윙에 붙는 오프셋.
 * 한 번 튀는 심지가 실선 레일을 밀어내는 걸 막는다.
 */
function robustOuterOffset(offs: number[]): number | null {
  const pos = offs.filter((o) => Number.isFinite(o) && o > 0).sort((a, b) => a - b);
  if (!pos.length) return null;
  if (pos.length === 1) return pos[0]!;
  if (pos.length === 2) return pos[1]!;
  const second = pos[pos.length - 2]!;
  const first = pos[pos.length - 1]!;
  if (first > second * 1.28 && first - second > 0) return second;
  return first;
}

/**
 * 기울기를 고정하고 선을 평행 이동해 캔들 극단에 **접**하게 만든다.
 * 상단은 어떤 봉도 위로 삐져나오지 않고, 하단은 어떤 봉도 아래로 빠지지 않는다.
 */
function fitTangent(
  candles: Candle[],
  iStart: number,
  iEnd: number,
  slope: number,
  side: 'high' | 'low',
  mode: AnchorSeries,
  tol: number
): Tangent | null {
  let intercept = side === 'high' ? -Infinity : Infinity;
  for (let i = iStart; i <= iEnd; i++) {
    const c = candles[i];
    if (!c) continue;
    const v = side === 'high' ? anchorHigh(c, mode) : anchorLow(c, mode);
    if (!Number.isFinite(v)) continue;
    const b = v - slope * i;
    if (side === 'high') {
      if (b > intercept) intercept = b;
    } else if (b < intercept) intercept = b;
  }
  return tangentFromIntercept(candles, iStart, iEnd, slope, side, mode, intercept, tol);
}

/** 한 번 튀는 심지가 테두리를 밀어내지 않게 2번째 극단으로 접한다. */
function fitTangentRobust(
  candles: Candle[],
  iStart: number,
  iEnd: number,
  slope: number,
  side: 'high' | 'low',
  mode: AnchorSeries,
  tol: number,
  atr: number
): Tangent | null {
  const intercepts: number[] = [];
  for (let i = iStart; i <= iEnd; i++) {
    const c = candles[i];
    if (!c) continue;
    const v = side === 'high' ? anchorHigh(c, mode) : anchorLow(c, mode);
    if (!Number.isFinite(v)) continue;
    intercepts.push(v - slope * i);
  }
  if (!intercepts.length) return null;
  intercepts.sort((a, b) => (side === 'high' ? b - a : a - b));
  let pick = intercepts[0]!;
  if (intercepts.length >= 3) {
    const first = intercepts[0]!;
    const second = intercepts[1]!;
    const gap = Math.abs(first - second);
    const spike = atr > 0 ? atr * 0.32 : Math.abs(second) * 0.0012;
    if (gap > spike) pick = second;
  }
  return tangentFromIntercept(candles, iStart, iEnd, slope, side, mode, pick, tol);
}

/**
 * 최근 봉 고·저에 테두리를 붙인다. 기울기는 유지, 절편만 최근 구간에 재접.
 * 화면 오른쪽(마지막 캔들)이 떠 보이지 않게 한다.
 */
function hugChannelToCandles(params: {
  candles: Candle[];
  iStart: number;
  iEnd: number;
  slope: number;
  mode: AnchorSeries;
  atr: number;
  tol: number;
  upper: Tangent;
  lower: Tangent;
}): { upper: Tangent; lower: Tangent; width: number } {
  const { candles, iStart, iEnd, slope, mode, atr, upper, lower } = params;
  const span = Math.max(1, iEnd - iStart);
  const hugN = Math.max(10, Math.min(24, Math.floor(span * 0.38)));
  const hugFrom = Math.max(iStart, iEnd - hugN);
  const tolTight = Math.max(params.atr * 0.1, params.tol * 0.45);
  const ru =
    fitTangentRobust(candles, hugFrom, iEnd, slope, 'high', mode, tolTight, atr) ??
    fitTangent(candles, hugFrom, iEnd, slope, 'high', mode, tolTight) ??
    upper;
  const rl =
    fitTangentRobust(candles, hugFrom, iEnd, slope, 'low', mode, tolTight, atr) ??
    fitTangent(candles, hugFrom, iEnd, slope, 'low', mode, tolTight) ??
    lower;
  const blend = 0.78;
  let uInt = upper.intercept * (1 - blend) + ru.intercept * blend;
  let lInt = lower.intercept * (1 - blend) + rl.intercept * blend;

  const pad = Math.max(atr * 0.02, 1e-8);
  const lastFrom = Math.max(hugFrom, iEnd - 1);
  let maxH = -Infinity;
  let minL = Infinity;
  for (let i = lastFrom; i <= iEnd; i++) {
    const c = candles[i];
    if (!c) continue;
    const h = Number(c.high);
    const l = Number(c.low);
    if (Number.isFinite(h)) maxH = Math.max(maxH, h);
    if (Number.isFinite(l)) minL = Math.min(minL, l);
  }
  if (Number.isFinite(maxH)) {
    const uNow = uInt + slope * iEnd;
    if (uNow - maxH > atr * 0.1 || maxH > uNow) uInt = maxH + pad - slope * iEnd;
  }
  if (Number.isFinite(minL)) {
    const lNow = lInt + slope * iEnd;
    if (minL - lNow > atr * 0.1 || minL < lNow) lInt = minL - pad - slope * iEnd;
  }

  const minW = Math.max(atr * 0.28, 1e-8);
  if (uInt - lInt < minW) {
    const mid = (uInt + lInt) / 2;
    uInt = mid + minW / 2;
    lInt = mid - minW / 2;
  }

  const nextU = tangentFromIntercept(candles, iStart, iEnd, slope, 'high', mode, uInt, params.tol) ?? upper;
  const nextL = tangentFromIntercept(candles, iStart, iEnd, slope, 'low', mode, lInt, params.tol) ?? lower;
  const width = nextU.intercept - nextL.intercept;
  if (!(width > 0)) return { upper, lower, width: upper.intercept - lower.intercept };
  return { upper: nextU, lower: nextL, width };
}

/** 점선 중선은 유지하고, 위·아래 실선만 스윙 봉투로 밀착 */
function fitSwingRails(
  candles: Candle[],
  highs: SwingPoint[],
  lows: SwingPoint[],
  iStart: number,
  iEnd: number,
  slope: number,
  mode: AnchorSeries,
  tol: number
): { upper: Tangent; lower: Tangent; width: number } | null {
  const hs = highs.filter((p) => p.i >= iStart && p.i <= iEnd);
  const ls = lows.filter((p) => p.i >= iStart && p.i <= iEnd);
  if (hs.length < 2 || ls.length < 2) return null;

  let midSum = 0;
  let midN = 0;
  const nPair = Math.min(hs.length, ls.length);
  for (let k = 0; k < nPair; k++) {
    const h = hs[hs.length - 1 - k]!;
    const l = ls[ls.length - 1 - k]!;
    const mid = (h.price + l.price) / 2;
    const iMid = (h.i + l.i) / 2;
    midSum += mid - slope * iMid;
    midN += 1;
  }
  if (!midN) return null;
  const midIntercept = midSum / midN;

  const upOffs = hs.map((p) => p.price - (midIntercept + slope * p.i));
  const loOffs = ls.map((p) => midIntercept + slope * p.i - p.price);
  const upOff = robustOuterOffset(upOffs);
  const loOff = robustOuterOffset(loOffs);
  if (upOff == null || loOff == null) return null;

  const upper = tangentFromIntercept(
    candles,
    iStart,
    iEnd,
    slope,
    'high',
    mode,
    midIntercept + upOff,
    tol
  );
  const lower = tangentFromIntercept(
    candles,
    iStart,
    iEnd,
    slope,
    'low',
    mode,
    midIntercept - loOff,
    tol
  );
  if (!upper || !lower) return null;
  const width = upper.intercept - lower.intercept;
  if (!(width > 0)) return null;
  return { upper, lower, width };
}

type ChannelFit = {
  mode: AnchorSeries;
  slope: number;
  upper: Tangent;
  lower: Tangent;
  width: number;
  score: number;
};

/** 후보 기울기 — 같은 편 스윙 쌍 + 수평 */
function candidateSlopes(pts: SwingPoint[], minBars: number): number[] {
  const out = new Set<number>([0]);
  for (let a = 0; a < pts.length - 1; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const p1 = pts[a]!;
      const p2 = pts[b]!;
      const span = p2.i - p1.i;
      if (span < minBars) continue;
      const s = (p2.price - p1.price) / span;
      if (Number.isFinite(s)) out.add(s);
    }
  }
  return [...out];
}

function scoreChannelFit(
  upper: Tangent,
  lower: Tangent,
  width: number,
  iStart: number,
  iEnd: number,
  minBars: number,
  atrSafe: number,
  mode: AnchorSeries,
  hugBonus: number
): number {
  const spread =
    Math.max(upper.lastTouch, lower.lastTouch) -
    Math.min(upper.firstTouch < 0 ? iStart : upper.firstTouch, lower.firstTouch < 0 ? iStart : lower.firstTouch);
  const spreadScore = Math.min(1.5, spread / (minBars * 2)) * 3;
  const recency = (Math.max(upper.lastTouch, lower.lastTouch) / Math.max(1, iEnd)) * 2.5;
  const widthPenalty = (width / atrSafe) * 0.85;
  const modeBonus = mode === 'wick' ? 0.9 : 0.15;
  const gapPenalty = ((upper.meanGap + lower.meanGap) / atrSafe) * 3.4;
  const touchFloor = upper.touches < 2 || lower.touches < 2 ? -2.4 : 0;
  return (
    (upper.touches + lower.touches) * 2.1 +
    spreadScore +
    recency -
    widthPenalty -
    gapPenalty +
    modeBonus +
    hugBonus +
    touchFloor
  );
}

/**
 * 평행 채널 적합 — 점선 중선 기울기는 스윙쌍, 실선 레일은 스윙 봉투 우선.
 * 한 봉 극단 접선은 예비(스윙이 부족할 때).
 */
function fitParallelChannel(params: {
  candles: Candle[];
  highs: SwingPoint[];
  lows: SwingPoint[];
  iStart: number;
  iEnd: number;
  minBars: number;
  atr: number;
  tol: number;
  midPx: number;
  anchorMode: MergedDeskRbAnchorMode;
}): ChannelFit | null {
  const { candles, highs, lows, iStart, iEnd, minBars, atr, tol, midPx } = params;
  const slopes = [...candidateSlopes(highs, minBars), ...candidateSlopes(lows, minBars)];
  if (!slopes.length) return null;

  const modes: AnchorSeries[] =
    params.anchorMode === 'wick' ? ['wick'] : params.anchorMode === 'body' ? ['body'] : ['wick', 'body'];
  const atrSafe = Math.max(atr, midPx * 1e-4, 1e-9);
  const spanBars = Math.max(1, iEnd - iStart);
  let best: ChannelFit | null = null;

  for (const mode of modes) {
    for (const slope of slopes) {
      /** 기울기가 구간 전체 가격의 절반을 넘게 움직이면 채널이 아니다 */
      if (Math.abs(slope) * spanBars > midPx * 0.5) continue;

      const swing = fitSwingRails(candles, highs, lows, iStart, iEnd, slope, mode, tol);
      if (swing) {
        const score = scoreChannelFit(
          swing.upper,
          swing.lower,
          swing.width,
          iStart,
          iEnd,
          minBars,
          atrSafe,
          mode,
          3.2
        );
        if (!best || score > best.score) {
          best = { mode, slope, upper: swing.upper, lower: swing.lower, width: swing.width, score };
        }
      }

      const upper = fitTangent(candles, iStart, iEnd, slope, 'high', mode, tol);
      const lower = fitTangent(candles, iStart, iEnd, slope, 'low', mode, tol);
      if (!upper || !lower) continue;
      const width = upper.intercept - lower.intercept;
      if (!(width > 0)) continue;
      const score = scoreChannelFit(upper, lower, width, iStart, iEnd, minBars, atrSafe, mode, 0);
      if (!best || score > best.score) {
        best = { mode, slope, upper, lower, width, score };
      }
    }
  }
  return best;
}

type ChannelBuild = {
  overlays: OverlayItem[];
  geom: MergedDeskChannelGeom;
};

function buildOneParallelChannel(params: {
  candles: Candle[];
  highs: SwingPoint[];
  lows: SwingPoint[];
  idPrefix: string;
  horizon: MergedDeskChannelHorizon;
  horizonKo: '단기' | '장기' | '스윙';
  minBars: number;
  atr: number;
  forceBearFill?: boolean;
  moneyCaptionKo?: string | null;
  primary: boolean;
  /** 보조 채널 라벨 숨김 */
  hideBandLabel?: boolean;
  style: MergedDeskRbStyle;
}): ChannelBuild | null {
  const { candles, highs, lows, idPrefix, horizon, horizonKo, minBars, atr, primary, style } =
    params;
  if (candles.length < 8 || highs.length < 2 || lows.length < 2) return null;

  const iEnd = candles.length - 1;
  const lastClose = Number(candles[iEnd]!.close);
  const midPx = Math.abs(lastClose) || 1;
  const tol = Math.max(atr * 0.28, midPx * 0.0009);

  /** 적합·작도 구간은 동일하게 — 스윙이 시작된 봉부터 마지막 봉까지 */
  const anchorIdx = [...highs, ...lows].map((p) => p.i).filter((i) => Number.isFinite(i));
  if (!anchorIdx.length) return null;
  const iStart = Math.max(0, Math.min(...anchorIdx));
  if (iEnd - iStart < minBars) return null;

  const rawFit = fitParallelChannel({
    candles,
    highs,
    lows,
    iStart,
    iEnd,
    minBars,
    atr,
    tol,
    midPx,
    anchorMode: style.anchorMode,
  });
  if (!rawFit) return null;

  const hugged = hugChannelToCandles({
    candles,
    iStart,
    iEnd,
    slope: rawFit.slope,
    mode: rawFit.mode,
    atr,
    tol,
    upper: rawFit.upper,
    lower: rawFit.lower,
  });
  const fit = { ...rawFit, upper: hugged.upper, lower: hugged.lower, width: hugged.width };

  const slope = fit.slope;
  const descending = slope < 0;
  const slopePct = (slope / midPx) * 100;
  const width = fit.width;
  const anchorKo = fit.mode === 'wick' ? '꼬리' : '몸통';

  const tStart = Number(candles[iStart]!.time);
  const tEnd = Number(candles[iEnd]!.time);
  /** 테두리는 마지막 생신 캔들까지 — 빈 우측 축으로 라벨이 떨어지지 않게 */
  const tDrawEnd = tEnd;

  const upAt = fit.upper.at;
  const loAt = fit.lower.at;

  const up1 = upAt(iStart);
  const up2Last = upAt(iEnd);
  const lo1 = loAt(iStart);
  const lo2Last = loAt(iEnd);
  const up2 = up2Last;
  const lo2 = lo2Last;
  const tipUpper = up2Last;
  const tipLower = lo2Last;
  const tipMid = (tipUpper + tipLower) / 2;

  const touches = { hi: fit.upper.touches, lo: fit.lower.touches };

  /** 채널이 실제로 가격을 담았는지 — 종가 기준 포함률 */
  let inside = 0;
  let total = 0;
  for (let i = iStart; i <= iEnd; i++) {
    const c = candles[i];
    if (!c) continue;
    total += 1;
    if (c.close <= upAt(i) + tol && c.close >= loAt(i) - tol) inside += 1;
  }
  const containment = total > 0 ? inside / total : 0;

  /** 마지막 종가가 채널 밖이면 몇 봉째인지 */
  let breakout: MergedDeskChannelBreakout = 'none';
  let breakoutBars = 0;
  if (lastClose > upAt(iEnd) + tol) breakout = 'up';
  else if (lastClose < loAt(iEnd) - tol) breakout = 'down';
  if (breakout !== 'none') {
    for (let i = iEnd; i >= iStart; i--) {
      const c = candles[i];
      if (!c) break;
      const out = breakout === 'up' ? c.close > upAt(i) + tol : c.close < loAt(i) - tol;
      if (!out) break;
      breakoutBars += 1;
    }
  }

  const span = Math.max(1, tipUpper - tipLower);
  const posPct = Math.max(-40, Math.min(140, ((lastClose - tipLower) / span) * 100));
  const swingCount = highs.length + lows.length;

  /**
   * 접선이라 이탈량은 0 — 대신 캔들이 채널을 얼마나 채우는지로 밀착을 본다.
   * fillRatio = 평균 봉 범위 / 채널 폭. 1에 가까울수록 레일이 캔들에 붙어 있다.
   */
  const fillRatio = Math.max(
    0,
    Math.min(1, 1 - (fit.upper.meanGap + fit.lower.meanGap) / Math.max(width, 1e-9))
  );
  const baseIsHigh = fit.upper.touches >= fit.lower.touches;

  let quality = 26;
  quality += Math.min(26, (touches.hi + touches.lo) * 4);
  quality += Math.round(containment * 24);
  quality += Math.min(10, swingCount * 1.2);
  quality += Math.abs(slopePct) > 0.002 && Math.abs(slopePct) < 0.35 ? 6 : 0;
  /** 봉이 채널 폭의 1/4도 못 채우면 레일이 캔들에서 떠 있는 셈 */
  quality -= Math.min(14, Math.round(Math.max(0, 0.28 - fillRatio) * 50));
  if (touches.hi < 2 || touches.lo < 2) quality -= 6;
  if (width / midPx > 0.055) quality -= 6;
  quality = Math.max(20, Math.min(96, Math.round(quality)));

  const lastBelowRail = lastClose < lo2Last;
  const lastAboveRail = lastClose > up2Last;
  const useBear =
    params.forceBearFill != null
      ? params.forceBearFill
      : lastBelowRail
        ? true
        : lastAboveRail
          ? false
          : descending;
  /**
   * 겹침 가독성 계층:
   * - 주(단기): 진한 면
   * - 보조(장기): 거의 투명 면 + 윤곽 강조(엣지선이 본체)
   */
  const baseHex = useBear ? style.bearHex : style.bullHex;
  const deepHex = shade(baseHex, 0.62);
  const fill = rgba(baseHex, primary ? style.fillOpacity : style.fillOpacity * 0.23);
  const edgeUp = primary ? baseHex : rgba(baseHex, 0.82);
  const edgeLo = primary ? baseHex : rgba(deepHex, 0.78);
  const dirKo = descending ? '하락' : '상승';
  const money = String(params.moneyCaptionKo || '').trim();
  const captionKo = params.hideBandLabel
    ? ''
    : money
      ? `${horizonKo}${dirKo}·${money}`
      : `${horizonKo}${dirKo}채널`;
  const tipBase = mergedDeskRbTooltipLines([
    `${horizonKo}${dirKo}채널 · 스윙 ${swingCount}개 기준`,
    `${anchorKo} 스윙레일 · 기준 ${baseIsHigh ? '상단' : '하단'} · 점선=중선`,
    `품질${quality} · 포함 ${(containment * 100).toFixed(0)}%`,
    `터치 상${touches.hi}/하${touches.lo} · 밀착 ${(fillRatio * 100).toFixed(0)}%`,
    breakout === 'none'
      ? `채널 내 위치 ${posPct.toFixed(0)}%`
      : `${breakout === 'up' ? '상단' : '하단'} 이탈 ${breakoutBars}봉 — 무효화 확인 필요`,
    primary ? '강조면' : '윤곽',
    money || '',
    '클릭=상세',
  ]);
  const tip = explainMergedDeskRbLabel(captionKo || `${horizonKo}${dirKo}채널`, tipBase);

  const geom: MergedDeskChannelGeom = {
    horizon,
    horizonKo,
    descending,
    useBearFill: useBear,
    tipUpper,
    tipLower,
    tipMid,
    width,
    tStart,
    tEnd: tDrawEnd,
    up1,
    up2,
    lo1,
    lo2,
    quality,
    touchHigh: touches.hi,
    touchLow: touches.lo,
    primary,
    slopePct,
    containment,
    swingCount,
    baseRail: baseIsHigh ? 'high' : 'low',
    posPct,
    breakout,
    breakoutBars,
  };

  const band: OverlayItem = {
    id: `${idPrefix}-band`,
    kind: 'channelBand',
    label: captionKo,
    zoneFaceBase: captionKo || undefined,
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: tStart,
    time2: tDrawEnd,
    price1: Math.max(up1, up2),
    price2: Math.min(lo1, lo2),
    confidence: quality,
    color: fill,
    category: 'chartPrimeTrendChannels',
    structureBias: descending ? 'bearish' : 'bullish',
    zoneFillPreserve: true,
    channelBand: {
      time1: tStart,
      time2: tDrawEnd,
      priceHigh1: up1,
      priceHigh2: up2,
      priceLow1: lo1,
      priceLow2: lo2,
    },
    overlayZoneExtraClass: [
      'merged-desk-rb-channel',
      'merged-swing-channel',
      'merged-desk-blue-red-channel',
      primary ? 'merged-desk-rb-primary' : 'merged-desk-rb-secondary',
      primary ? 'merged-desk-rb-fill' : 'merged-desk-rb-outline',
      useBear ? 'merged-desk-rb-bear' : 'merged-desk-rb-bull',
    ].join(' '),
    labelTooltip: tip,
    lineLabelColor: useBear ? '#fecaca' : '#bbf7d0',
    labelBackgroundColor: rgba(shade(baseHex, 0.42), primary ? 0.92 : 0.55),
    labelTextColor: '#f8fafc',
  };

  const strokeW = primary ? Math.max(2.4, style.lineWidth + 0.6) : Math.max(1.4, style.lineWidth - 0.2);
  const edge = (
    id: string,
    edgeTag: '상' | '하',
    p1: number,
    p2: number,
    color: string
  ): OverlayItem => ({
    id,
    kind: 'trendLine',
    label: `${horizonKo}${edgeTag}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tStart,
    price1: p1,
    time2: tDrawEnd,
    price2: p2,
    confidence: quality,
    color,
    category: 'chartPrimeTrendChannels',
    lineStrokeWidth: strokeW,
    lineDash: primary ? undefined : '7 5',
    noProject: true,
    overlayZoneExtraClass: [
      'merged-desk-rb-channel',
      'merged-swing-channel',
      'merged-desk-blue-red-channel',
      primary ? 'merged-desk-rb-primary' : 'merged-desk-rb-secondary',
      primary ? 'merged-desk-rb-edge-pri' : 'merged-desk-rb-edge-sec',
      `merged-desk-rb-edge-${edgeTag === '상' ? 'up' : 'dn'}`,
    ].join(' '),
    labelTooltip: tip,
    lineLabelColor: primary ? '#f8fafc' : '#cbd5e1',
  });

  /** 주 채널만 상·하 실선 — 장기 점선 레일은 같은 자리에 겹쳐 선이 두 겹이 됨 */
  const overlays: OverlayItem[] = primary
    ? [band, edge(`${idPrefix}-upper`, '상', up1, up2, edgeUp), edge(`${idPrefix}-lower`, '하', lo1, lo2, edgeLo)]
    : [band];

  /** 주 채널만 중선 */
  if (primary) {
    overlays.push({
      id: `${idPrefix}-mid`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tStart,
      price1: (up1 + lo1) / 2,
      time2: tDrawEnd,
      price2: (up2 + lo2) / 2,
      confidence: quality,
      color: 'rgba(226,232,240,0.5)',
      category: 'chartPrimeTrendChannels',
      lineStrokeWidth: 1,
      lineDash: '2 6',
      noProject: true,
      overlayZoneExtraClass:
        'merged-desk-rb-channel merged-desk-rb-primary merged-desk-rb-mid',
      labelTooltip: tip,
    });
  }

  return { geom, overlays };
}

/** 단기∩장기 tip 중착 복도 — 겹침 구간에 제3의 강조 띠 */
function buildConfluenceCorridor(
  shortG: MergedDeskChannelGeom,
  longG: MergedDeskChannelGeom,
  candles: Candle[],
  style: MergedDeskRbStyle
): { confluence: MergedDeskChannelConfluence; overlay: OverlayItem } | null {
  const tipHi = Math.min(shortG.tipUpper, longG.tipUpper);
  const tipLo = Math.max(shortG.tipLower, longG.tipLower);
  if (!(tipHi > tipLo)) return null;
  const width = tipHi - tipLo;
  const midPx = Math.abs(shortG.tipMid) || 1;
  if (width / midPx < 0.0015) return null;

  const shortSpan = Math.max(1, shortG.width);
  const overlapPct = Math.min(1, width / shortSpan);
  if (overlapPct < 0.12) return null;

  const aligned =
    shortG.descending === longG.descending ||
    Math.sign(shortG.slopePct) === Math.sign(longG.slopePct);

  const n = candles.length;
  const iEnd = n - 1;
  const iStart = Math.max(0, iEnd - Math.max(18, Math.floor(n * 0.18)));
  const tStart = Number(candles[iStart]?.time) || shortG.tStart;
  const tLast = Number(candles[iEnd]?.time) || shortG.tEnd;
  const tDrawEnd = tLast;

  /** 중착 폭을 마지막 봉까지 — 예측 여백으로 테두리를 밀지 않음 */
  const bars = Math.max(1, iEnd - iStart);
  const slopePerBar = (shortG.tipUpper - shortG.up1) / bars;
  const up2 = tipHi;
  const lo2 = tipLo;
  const up1 = tipHi - slopePerBar * bars;
  const lo1 = tipLo - slopePerBar * bars;

  const confluence: MergedDeskChannelConfluence = {
    tipUpper: tipHi,
    tipLower: tipLo,
    tipMid: (tipHi + tipLo) / 2,
    width,
    overlapPct,
    tStart,
    tEnd: tDrawEnd,
    aligned,
  };

  const confLabel = aligned ? '◆중착복도·정렬' : '◆중착복도·혼조';
  const overlay: OverlayItem = {
    id: 'merged-desk-rb-confluence-band',
    kind: 'channelBand',
    label: style.showLabels ? confLabel : '',
    zoneFaceBase: '중착복도',
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: tStart,
    time2: tDrawEnd,
    price1: Math.max(up1, up2),
    price2: Math.min(lo1, lo2),
    confidence: Math.round(55 + overlapPct * 35),
    color: aligned
      ? rgba(style.confluenceHex, Math.max(0.08, style.fillOpacity * 1.13))
      : rgba('#FBBF24', Math.max(0.06, style.fillOpacity * 0.93)),
    category: 'chartPrimeTrendChannels',
    structureBias: shortG.descending ? 'bearish' : 'bullish',
    zoneFillPreserve: true,
    channelBand: {
      time1: tStart,
      time2: tDrawEnd,
      priceHigh1: up1,
      priceHigh2: up2,
      priceLow1: lo1,
      priceLow2: lo2,
    },
    overlayZoneExtraClass:
      'merged-desk-rb-channel merged-desk-rb-confluence merged-desk-blue-red-channel merged-desk-rb-primary',
    labelTooltip: explainMergedDeskRbLabel(
      confLabel,
      mergedDeskRbTooltipLines([
        '단기 tip ∩ 장기 tip 겹침 복도',
        aligned ? '방향 정렬' : '방향 혼조',
        `겹침 ${(overlapPct * 100).toFixed(0)}%`,
        '게이트 가점만 · 클릭=상세',
      ])
    ),
    labelBackgroundColor: aligned
      ? rgba(shade(style.confluenceHex, 0.42), 0.92)
      : 'rgba(120,53,15,0.9)',
    labelTextColor: '#f8fafc',
  };

  return { confluence, overlay };
}

function applyMoneyCaptionToOverlays(
  overlays: OverlayItem[],
  geom: MergedDeskChannelGeom,
  moneyCaptionKo: string | null | undefined,
  opts?: { clear?: boolean }
): OverlayItem[] {
  if (opts?.clear) {
    return overlays.map((o) =>
      o.kind === 'channelBand'
        ? { ...o, label: '', zoneFaceBase: undefined }
        : o
    );
  }
  const money = String(moneyCaptionKo || '').trim();
  if (!money) return overlays;
  const dirKo = geom.descending ? '하락' : '상승';
  const captionKo = geom.primary
    ? `★${geom.horizonKo}${dirKo}·${money}`
    : `${geom.horizonKo}${dirKo}·${money}`;
  return overlays.map((o) => {
    if (o.kind !== 'channelBand') return o;
    return {
      ...o,
      label: captionKo,
      zoneFaceBase: captionKo,
      labelTooltip: explainMergedDeskRbLabel(captionKo, money),
    };
  });
}

/** 구조 라벨만 (게이트 캡션 없는 쪽) */
function applyStructureCaptionToBand(
  o: OverlayItem,
  geom: MergedDeskChannelGeom
): OverlayItem {
  if (o.kind !== 'channelBand') return o;
  const dirKo = geom.descending ? '하락' : '상승';
  const captionKo = `${geom.horizonKo}${dirKo}채널`;
  return {
    ...o,
    label: captionKo,
    zoneFaceBase: captionKo,
    labelTooltip: explainMergedDeskRbLabel(
      captionKo,
      mergedDeskRbTooltipLines([
        `품질${geom.quality} · 스윙 ${geom.swingCount ?? 0}개`,
        `터치 상${geom.touchHigh}/하${geom.touchLow}`,
        geom.containment != null ? `포함 ${(geom.containment * 100).toFixed(0)}%` : '',
        geom.breakout && geom.breakout !== 'none'
          ? `${geom.breakout === 'up' ? '상단' : '하단'} 이탈 ${geom.breakoutBars ?? 0}봉`
          : geom.posPct != null
            ? `채널 내 ${geom.posPct.toFixed(0)}%`
            : '',
        geom.primary ? '게이트결정·강조' : '구조윤곽',
        '클릭=상세',
      ])
    ),
  };
}

/**
 * 게이트·엣지 판정으로 이긴 호라이즌을 면 강조(primary)로 승격.
 * 억지로 단기에 붙이지 않고, 단기면 단기·장기면 장기.
 */
export function promoteMergedDeskChannelPrimary(
  pack: MergedDeskBlueRedChannelPack,
  horizon: MergedDeskChannelHorizon
): MergedDeskBlueRedChannelPack {
  if (!pack.geoms.some((g) => g.horizon === horizon)) return pack;
  const geoms = pack.geoms.map((g) => ({
    ...g,
    primary: g.horizon === horizon,
  }));
  const overlays = pack.overlays.map((o) => {
    const id = String(o.id || '');
    if (id.includes('confluence') || String(o.overlayZoneExtraClass || '').includes('merged-desk-rb-confluence')) {
      return o;
    }
    let h: MergedDeskChannelHorizon | null = null;
    if (id.includes('-short-')) h = 'short';
    else if (id.includes('-long-')) h = 'long';
    else if (id.includes('-fb-')) h = 'fb';
    if (!h) return o;
    const isPri = h === horizon;
    const prev = String(o.overlayZoneExtraClass || '');
    const next = prev
      .replace(/\bmerged-desk-rb-primary\b/g, '')
      .replace(/\bmerged-desk-rb-secondary\b/g, '')
      .replace(/\bmerged-desk-rb-fill\b/g, '')
      .replace(/\bmerged-desk-rb-outline\b/g, '')
      .replace(/\bmerged-desk-rb-edge-pri\b/g, '')
      .replace(/\bmerged-desk-rb-edge-sec\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tags = [
      next,
      isPri ? 'merged-desk-rb-primary' : 'merged-desk-rb-secondary',
      o.kind === 'channelBand'
        ? isPri
          ? 'merged-desk-rb-fill'
          : 'merged-desk-rb-outline'
        : isPri
          ? 'merged-desk-rb-edge-pri'
          : 'merged-desk-rb-edge-sec',
    ]
      .filter(Boolean)
      .join(' ');
    return { ...o, overlayZoneExtraClass: tags };
  });
  return { ...pack, geoms, overlays };
}

function rbOverlayHorizon(id: string): MergedDeskChannelHorizon | null {
  if (id.includes('-short-')) return 'short';
  if (id.includes('-long-')) return 'long';
  if (id.includes('-fb-')) return 'fb';
  return null;
}

/**
 * 작도 직전 사용자 스타일 적용 — 표시 여부·색·굵기·폭·라벨.
 * 게이트/판정용 geom은 건드리지 않고 그리는 것만 바꾼다. 여러 번 적용해도 결과 동일.
 */
export function applyMergedDeskRbStyleToOverlays(
  overlays: OverlayItem[],
  style?: MergedDeskRbStyle,
  volSync?: MergedDeskRbVolumeSyncPack | null,
  paint?: MergedDeskRbCorridorPaint | null
): OverlayItem[] {
  if (!overlays.length) return overlays;
  const st = style ?? mergedDeskRbStyleFromSettings();
  const out: OverlayItem[] = [];

  /** 폭 배율은 상단선 기준으로 아래를 밀어야 해서 상단 좌표를 먼저 모은다 */
  const upperByPrefix = new Map<string, { p1: number; p2: number }>();
  if (st.widthScale !== 1) {
    for (const o of overlays) {
      const id = String(o.id || '');
      if (!id.endsWith('-upper')) continue;
      const p1 = Number(o.price1);
      const p2 = Number(o.price2);
      if (Number.isFinite(p1) && Number.isFinite(p2)) {
        upperByPrefix.set(id.slice(0, -'-upper'.length), { p1, p2 });
      }
    }
  }
  /** 상단선에서의 거리 d를 배율만큼 늘림 — 하단선·중심선 모두 같은 규칙 */
  const scaleFromUpper = (prefix: string, p1: number, p2: number) => {
    const up = upperByPrefix.get(prefix);
    if (!up) return null;
    return {
      price1: up.p1 - (up.p1 - p1) * st.widthScale,
      price2: up.p2 - (up.p2 - p2) * st.widthScale,
    };
  };

  for (const o of overlays) {
    const id = String(o.id || '');
    const cls = String(o.overlayZoneExtraClass || '');
    const isRb = cls.includes('merged-desk-rb-channel') || id.startsWith('merged-desk-rb-');
    if (!isRb) {
      out.push(o);
      continue;
    }

    /** 게이트 스포트·핵심·진입핀은 상태색 유지. 목표존만 수급 팔레트에 맞춤 */
    if (
      id.startsWith('merged-desk-rb-core-') ||
      id.startsWith('merged-desk-rb-gate') ||
      id.startsWith('merged-desk-rb-entry') ||
      id.startsWith('merged-desk-rb-master') ||
      id.startsWith('merged-desk-rb-ai-') ||
      cls.includes('merged-desk-rb-signal-pin')
    ) {
      out.push(o);
      continue;
    }

    if (id.startsWith('merged-desk-rb-tp')) {
      if (!volSync) {
        out.push(o);
        continue;
      }
      const bear = o.structureBias === 'bearish' || cls.includes('--short');
      const pal = bear ? volSync.downPalette : volSync.upPalette;
      const nextTp: OverlayItem = {
        ...o,
        color: rgba(pal.fillHex, Math.max(0.14, st.fillOpacity * 1.05)),
        labelBackgroundColor: rgba(shade(pal.upperHex, 0.42), 0.92),
        overlayZoneExtraClass: `${cls} ${rbVolumeSyncExtraClass(volSync, bear)}`.trim(),
      };
      out.push(mergeRbVolumeSyncTooltip(nextTp, volSync));
      continue;
    }

    const isConfluence = id.includes('confluence') || cls.includes('merged-desk-rb-confluence');
    if (isConfluence) continue;
    const horizon = rbOverlayHorizon(id);
    const isBand = o.kind === 'channelBand';
    const isPriBand = cls.includes('merged-desk-rb-primary');
    /** 주 띠 + 장기 보조 띠 1장은 남긴다. 먼 띠는 money-pressure에서 자른다. */
    if (isBand && !isPriBand && horizon !== 'long') continue;
    if (horizon === 'short' && !st.showShort) continue;
    if (horizon === 'long' && !st.showLong) continue;
    if (id.endsWith('-mid') && !st.showMid) continue;
    if ((id.endsWith('-upper') || id.endsWith('-lower')) && !st.showEdges) continue;
    if ((id.endsWith('-upper') || id.endsWith('-lower')) && id.includes('-long-')) continue;
    if (Number(o.confidence ?? 100) < st.minQuality) continue;

    const primary = cls.includes('merged-desk-rb-primary');
    const bear =
      paint != null
        ? paint.bear
        : cls.includes('merged-desk-rb-bear') || o.structureBias === 'bearish';
    const dual = volSync ? (bear ? volSync.downPalette : volSync.upPalette) : null;
    const baseHex = dual ? dual.fillHex : bear ? st.bearHex : st.bullHex;
    const deepHex = dual ? dual.lowerHex : shade(baseHex, 0.62);
    const upperHex = dual ? dual.upperHex : baseHex;
    const paintCls = paint
      ? paint.bear
        ? ' merged-desk-rb-paint-bear merged-desk-rb-bear'
        : ' merged-desk-rb-paint-bull merged-desk-rb-bull'
      : '';
    const syncCls = volSync ? ` ${rbVolumeSyncExtraClass(volSync, bear)}` : '';
    const fillOp =
      volSync?.confirm === 'confirm'
        ? st.fillOpacity * 1.12
        : volSync?.confirm === 'diverge'
          ? st.fillOpacity * 0.72
          : st.fillOpacity;

    if (o.kind === 'channelBand') {
      const cb = o.channelBand;
      let next: OverlayItem = {
        ...o,
        label: st.showLabels ? o.label : '',
        color: rgba(baseHex, primary ? fillOp : fillOp * 0.23),
        labelBackgroundColor: rgba(shade(dual ? upperHex : baseHex, 0.42), primary ? 0.92 : 0.55),
        overlayZoneExtraClass: `${cls}${paintCls}${syncCls}`
          .replace(/\bmerged-desk-rb-bull\b/g, bear ? 'merged-desk-rb-bear' : 'merged-desk-rb-bull')
          .replace(/\bmerged-desk-rb-bear\b/g, bear ? 'merged-desk-rb-bear' : 'merged-desk-rb-bull')
          .trim(),
        structureBias: bear ? 'bearish' : 'bullish',
        lineLabelColor: bear ? '#fecaca' : '#bbf7d0',
      };
      if (cb && st.widthScale !== 1) {
        const low1 = cb.priceHigh1 - (cb.priceHigh1 - cb.priceLow1) * st.widthScale;
        const low2 = cb.priceHigh2 - (cb.priceHigh2 - cb.priceLow2) * st.widthScale;
          next = {
          ...next,
          channelBand: { ...cb, priceLow1: low1, priceLow2: low2 },
          price1: Math.max(cb.priceHigh1, cb.priceHigh2),
          price2: Math.min(low1, low2),
        };
      }
      out.push(volSync ? mergeRbVolumeSyncTooltip(next, volSync) : next);
      continue;
    }

    if (id.endsWith('-mid')) {
      const scaled =
        st.widthScale !== 1
          ? scaleFromUpper(id.slice(0, -'-mid'.length), Number(o.price1), Number(o.price2))
          : null;
      const midNext: OverlayItem = {
        ...o,
        ...(scaled || {}),
        color: rgba(baseHex, primary ? 0.72 : 0.45),
        overlayZoneExtraClass: `${cls}${paintCls}${syncCls}`.trim(),
        structureBias: bear ? 'bearish' : 'bullish',
      };
      out.push(volSync ? mergeRbVolumeSyncTooltip(midNext, volSync) : midNext);
      continue;
    }

    const isLower = id.endsWith('-lower');
    const scaled =
      isLower && st.widthScale !== 1
        ? scaleFromUpper(id.slice(0, -'-lower'.length), Number(o.price1), Number(o.price2))
        : null;
    const edgeItem: OverlayItem = {
      ...o,
      ...(scaled || {}),
      label: st.showLabels ? o.label : '',
      color: primary
        ? upperHex
        : rgba(isLower ? deepHex : upperHex, 0.8),
      lineStrokeWidth: primary ? Math.max(2.4, st.lineWidth + 0.6) : Math.max(1.4, st.lineWidth - 0.2),
      overlayZoneExtraClass: `${cls}${paintCls}${syncCls}`.trim(),
      structureBias: bear ? 'bearish' : 'bullish',
      lineLabelColor: bear ? '#fecaca' : '#bbf7d0',
    };
    out.push(volSync ? mergeRbVolumeSyncTooltip(edgeItem, volSync) : edgeItem);
  }

  return out;
}

export function buildMergedDeskBlueRedChannels(
  candles: Candle[],
  timeframe: string,
  opts?: {
    moneyCaptionByHorizon?: Partial<Record<MergedDeskChannelHorizon, string>>;
    /** 보조 채널 라벨 숨김(우선상태 1개 정책) */
    hideSecondaryLabel?: boolean;
    /** 차트설정 값. 없으면 저장된 설정에서 읽음 */
    style?: MergedDeskRbStyle;
  }
): MergedDeskBlueRedChannelPack {
  const style = opts?.style ?? mergedDeskRbStyleFromSettings();
  const safe = work(candles, timeframe);
  if (safe.length < 24) {
    return { overlays: [], geoms: [], summaryKo: '파란·빨간 채널 — 봉 부족', confluence: null };
  }

  const atr = recentAtr(safe, 14);
  /** 스윙 시퀀스는 넓게 한 번만 뽑고, 단기·장기는 스윙 개수로 자른다 */
  const seqLookback = Math.min(safe.length - 2, Math.max(90, Math.floor(safe.length * 0.75)));
  const seq = buildSwingSequence(safe, timeframe, seqLookback, atr);

  const short = { highs: lastSwings(seq, 'high', 5), lows: lastSwings(seq, 'low', 5) };
  const long = { highs: lastSwings(seq, 'high', 11), lows: lastSwings(seq, 'low', 11) };
  const caps = opts?.moneyCaptionByHorizon;
  /** 기본: 단기·장기 모두 구조 라벨 표시(억지 숨김 없음). 명시 true일 때만 보조 숨김 */
  const hideSec = opts?.hideSecondaryLabel === true;

  const shortBuilt = buildOneParallelChannel({
    candles: safe,
    highs: short.highs,
    lows: short.lows,
    idPrefix: 'merged-desk-rb-short',
    horizon: 'short',
    horizonKo: '단기',
    minBars: 5,
    atr,
    moneyCaptionKo: caps?.short,
    primary: true,
    style,
  });

  const longBuilt = buildOneParallelChannel({
    candles: safe,
    highs: long.highs,
    lows: long.lows,
    idPrefix: 'merged-desk-rb-long',
    horizon: 'long',
    horizonKo: '장기',
    minBars: 8,
    atr,
    moneyCaptionKo: hideSec ? null : caps?.long,
    primary: false,
    hideBandLabel: hideSec,
    style,
  });

  const built = [longBuilt, shortBuilt].filter(Boolean) as ChannelBuild[];
  if (!built.length) {
    const { highs, lows } = collectSwingPivots(candles, timeframe);
    const hi = pickSwingPivotPair(highs, timeframe);
    if (hi) {
      const fb = buildOneParallelChannel({
        candles: safe,
        highs: highs.map((p) => ({ ...p, kind: 'high' as const })),
        lows: lows.map((p) => ({ ...p, kind: 'low' as const })),
        idPrefix: 'merged-desk-rb-fb',
        horizon: 'fb',
        horizonKo: '스윙',
        minBars: 6,
        atr,
        moneyCaptionKo: caps?.fb,
        primary: true,
        style,
      });
      if (fb) {
        return {
          overlays: fb.overlays,
          geoms: [fb.geom],
          summaryKo: `스윙채널 1본 · 품질${fb.geom.quality}`,
          confluence: null,
        };
      }
    }
    return { overlays: [], geoms: [], summaryKo: '파란·빨간 채널 — 피벗 부족', confluence: null };
  }

  /**
   * 엔진은 단기·장기 geom을 모두 유지.
   * 차트 면은 주 통로 1본만 — 큰 통로 안에 작은 통로를 겹치지 않음.
   */
  const overlays = built.flatMap((b) => b.overlays);
  const geoms = built.map((b) => b.geom);
  const shortG = geoms.find((g) => g.horizon === 'short');
  const longG = geoms.find((g) => g.horizon === 'long');
  let confluence: MergedDeskChannelConfluence | null = null;
  if (shortG && longG) {
    const conf = buildConfluenceCorridor(shortG, longG, safe, style);
    if (conf) confluence = conf.confluence;
  }

  const qAvg = Math.round(geoms.reduce((s, g) => s + g.quality, 0) / geoms.length);
  const swingTotal = seq.length;
  return {
    overlays,
    geoms,
    confluence,
    summaryKo: confluence
      ? `파란·빨간 ${geoms.length}본 · 스윙${swingTotal} · 중착${(confluence.overlapPct * 100).toFixed(0)}% · 품질≈${qAvg}`
      : `파란·빨간채널 ${geoms.length}본 · 스윙${swingTotal} 기준 · 품질≈${qAvg}`,
  };
}

/**
 * 게이트 캡션: 결정 호라이즌에만.
 * 나머지(단기/장기)는 구조 라벨 유지 — 억지로 지우거나 단기에만 붙이지 않음.
 */
export function stampMergedDeskBlueRedMoneyCaptions(
  pack: MergedDeskBlueRedChannelPack,
  captionByHorizon: Partial<Record<MergedDeskChannelHorizon, string>>,
  opts?: {
    /** @deprecated keepStructureOnOthers 권장. true면 비결정 쪽 라벨을 비움(구버전) */
    primaryOnly?: boolean;
    /** 게이트 없는 쪽은 단기/장기 구조 라벨 유지(기본 true) */
    keepStructureOnOthers?: boolean;
  }
): MergedDeskBlueRedChannelPack {
  if (!pack.overlays.length) return pack;
  const keepStructure = opts?.keepStructureOnOthers !== false && opts?.primaryOnly !== true;
  const overlays = pack.overlays.map((o) => {
    const id = String(o.id || '');
    /** 중착 복도 라벨은 항상 유지 + 설명 보강 */
    if (id.includes('confluence') || String(o.overlayZoneExtraClass || '').includes('merged-desk-rb-confluence')) {
      const lab = String(o.label || '중착복도');
      return {
        ...o,
        labelTooltip: explainMergedDeskRbLabel(lab, String(o.labelTooltip || '')),
      };
    }
    let horizon: MergedDeskChannelHorizon | null = null;
    if (id.includes('-short-')) horizon = 'short';
    else if (id.includes('-long-')) horizon = 'long';
    else if (id.includes('-fb-')) horizon = 'fb';
    if (!horizon || o.kind !== 'channelBand') return o;
    const geom = pack.geoms.find((g) => g.horizon === horizon);
    if (!geom) return o;
    const cap = captionByHorizon[horizon];
    if (cap) return applyMoneyCaptionToOverlays([o], geom, cap)[0]!;
    if (keepStructure) return applyStructureCaptionToBand(o, geom);
    return applyMoneyCaptionToOverlays([o], geom, null, { clear: true })[0]!;
  });
  return { ...pack, overlays };
}
