/**
 * [_ParkF] Linreg & Trendlines (TradingView Pine) 포팅 — 앱 차트 오버레이용.
 * Lux 피벗 추세선 대신 이 엔진 결과를 analyze에서 붙인다.
 */

import type { Candle, OverlayItem } from '@/types';
import type { LuxTrendlineEngineResult, LuxTrendlineMeta } from './luxAlgoTrendlineEngine';
import {
  type ParkfTrendlineColorHex,
  hexToRgba,
  mergeParkfTrendlineColors,
  normalizeHex6,
} from './chartHexColor';

const EMPTY_META: LuxTrendlineMeta = {
  resistBrokenUp: false,
  supportBrokenDown: false,
  bouncedSupport: false,
  rejectedResistance: false,
};

/** TradingView 스크린샷 기준: 라벨 배경·글자 (선 색은 col.* 별도) */
const TV_LABEL = {
  lrCenterBg: '#EAB308',
  lrCenterFg: '#0F172A',
  lrResistBg: '#DC2626',
  lrResistFg: '#FFFFFF',
  lrSupportBg: '#16A34A',
  lrSupportFg: '#FFFFFF',
  tlResistBg: '#7C3AED',
  tlResistFg: '#FFFFFF',
  tlSupportBg: '#FACC15',
  tlSupportFg: '#0F172A',
  xsecResistBg: '#EA580C',
  xsecResistFg: '#FFFFFF',
  xsecSupportBg: '#2563EB',
  xsecSupportFg: '#FFFFFF',
} as const;

export type PivotTlSegment = { t1: number; p1: number; t2: number; p2: number };

function intersectInfiniteLines(
  t1: number,
  p1: number,
  t2: number,
  p2: number,
  t3: number,
  p3: number,
  t4: number,
  p4: number
): { t: number; p: number } | null {
  const dt1 = t2 - t1;
  const dt2 = t4 - t3;
  if (Math.abs(dt1) < 1e-9 || Math.abs(dt2) < 1e-9) return null;
  const m1 = (p2 - p1) / dt1;
  const m2 = (p4 - p3) / dt2;
  if (Math.abs(m1 - m2) < 1e-12) return null;
  const t = (p1 - p3 - m1 * t1 + m2 * t3) / (m2 - m1);
  const p = p1 + m1 * (t - t1);
  return { t, p };
}

function pushParkfPin(
  visible: Candle[],
  min: number,
  max: number,
  out: OverlayItem[],
  id: string,
  text: string,
  t: number,
  p: number,
  dotHex: string,
  labelBg: string,
  labelFg: string
): void {
  const n = visible.length;
  const denom = Math.max(1, n - 1);
  const idx = indexForTime(visible, t);
  const dh = normalizeHex6(dotHex, '#FFFFFF');
  out.push({
    id,
    kind: 'label',
    label: text,
    x1: idx / denom,
    y1: toRatio(p, min, max),
    confidence: 78,
    color: dh,
    lineLabelColor: labelFg,
    labelBackgroundColor: labelBg,
    labelTextColor: labelFg,
    category: 'labels',
  });
}

/** Pine [_ParkF] Linreg & Trendlines — line.style_* 대응 */
export type ParkfLineStyle = 'solid' | 'dashed' | 'dotted';

export type ParkfTrendlineOpts = {
  linregLength: number;
  useLargeLinReg: boolean;
  useMediumLinReg: boolean;
  useSmallLinReg: boolean;
  extendLinRegRight: boolean;
  extendLinRegLeft: boolean;
  /** Pine: upper/lower = mult × stdDev (3 / 2 / 1) */
  linRegLargeMult: number;
  linRegMediumMult: number;
  linRegSmallMult: number;
  /** Pine group5 — Large Dotted, Medium Solid, Small Dashed, Base Solid */
  linRegLargeStyle: ParkfLineStyle;
  linRegMediumStyle: ParkfLineStyle;
  linRegSmallStyle: ParkfLineStyle;
  linRegBaseStyle: ParkfLineStyle;
  /** Pine group4 — width 0이면 해당 선 생략 */
  linRegLargeWidth: number;
  linRegMediumWidth: number;
  linRegSmallWidth: number;
  linRegBaseWidth: number;
  primaryPivotLen: number;
  secondaryPivotLen: number;
  primaryExtension: string;
  secondaryExtension: string;
  useLogChart: boolean;
  showPrimaryTrendlines: boolean;
  showSecondaryTrendlines: boolean;
  /** Pine Primary Solid width 2 */
  primaryTrendlineStyle: ParkfLineStyle;
  primaryTrendlineWidth: number;
  /** Pine Secondary Dashed width 2 */
  secondaryTrendlineStyle: ParkfLineStyle;
  secondaryTrendlineWidth: number;
  /** 사용자·API에서 부분 지정 시 나머지는 기본 밝은 색 */
  colors?: Partial<ParkfTrendlineColorHex>;
};

export const DEFAULT_PARKF_TRENDLINE_OPTS: ParkfTrendlineOpts = {
  linregLength: 100,
  useLargeLinReg: true,
  useMediumLinReg: true,
  useSmallLinReg: true,
  extendLinRegRight: true,
  extendLinRegLeft: false,
  linRegLargeMult: 3,
  linRegMediumMult: 2,
  linRegSmallMult: 1,
  linRegLargeStyle: 'dotted',
  linRegMediumStyle: 'solid',
  linRegSmallStyle: 'dashed',
  linRegBaseStyle: 'solid',
  linRegLargeWidth: 2,
  linRegMediumWidth: 1,
  linRegSmallWidth: 1,
  linRegBaseWidth: 2,
  primaryPivotLen: 25,
  secondaryPivotLen: 10,
  primaryExtension: '50',
  secondaryExtension: '25',
  useLogChart: true,
  showPrimaryTrendlines: true,
  showSecondaryTrendlines: true,
  primaryTrendlineStyle: 'solid',
  primaryTrendlineWidth: 2,
  secondaryTrendlineStyle: 'dashed',
  secondaryTrendlineWidth: 2,
};

function extensionMultiplier(label: string): number {
  const m: Record<string, number> = {
    '25': 1,
    '50': 2,
    '75': 3,
    '100': 4,
    '150': 6,
    '200': 8,
    '300': 12,
    '400': 16,
    '500': 20,
    '750': 30,
    '1000': 40,
    Infinate: 0,
  };
  return m[label] ?? 2;
}

/** Pine: source[i] = i bars ago from last; per = i+1 */
function calcSlopePine(sourceOldestFirst: number[], length: number): { slope: number; average: number; intercept: number } | null {
  if (length <= 1 || sourceOldestFirst.length < length) return null;
  const slice = sourceOldestFirst.slice(-length);
  let sumX = 0;
  let sumY = 0;
  let sumXSqr = 0;
  let sumXY = 0;
  for (let i = 0; i < length; i++) {
    const val = slice[length - 1 - i];
    const per = i + 1;
    sumX += per;
    sumY += val;
    sumXSqr += per * per;
    sumXY += val * per;
  }
  const denom = length * sumXSqr - sumX * sumX;
  if (Math.abs(denom) < 1e-18) return null;
  const slope = (length * sumXY - sumX * sumY) / denom;
  const average = sumY / length;
  const intercept = average - (slope * sumX) / length + slope;
  return { slope, average, intercept };
}

function calcDevPine(
  sourceOldestFirst: number[],
  highs: number[],
  lows: number[],
  length: number,
  slope: number,
  average: number,
  intercept: number
): { stdDev: number; upDev: number; dnDev: number; bandDev: number } {
  const periods = length - 1;
  let upDev = 0;
  let dnDev = 0;
  let stdDevAcc = 0;
  const sliceSrc = sourceOldestFirst.slice(-length);
  const sliceH = highs.slice(-length);
  const sliceL = lows.slice(-length);
  const daY = intercept + (slope * periods) / 2;
  let val = intercept;
  for (let j = 0; j <= periods; j++) {
    const idx = length - 1 - j;
    let price = sliceH[idx] - val;
    if (price > upDev) upDev = price;
    price = val - sliceL[idx];
    if (price > dnDev) dnDev = price;
    price = sliceSrc[idx];
    const dxt = price - average;
    const dyt = val - daY;
    price -= val;
    stdDevAcc += price * price;
    val += slope;
  }
  const stdDev = Math.sqrt(stdDevAcc / (periods <= 0 ? 1 : periods));
  /**
   * 밴드 폭: 순수 σ만 쓰면 종가 기준이라 고·저 꼬리가 밖으로 자주 나갔다 들어오는 것처럼 보임.
   * 회귀선 대비 최대 고가·저가 이탈(upDev/dnDev)과 혼합해 통로를 약간 넓혀 같은 구간 내 해석 안정화.
   */
  const envelope = Math.max(upDev, dnDev, 1e-12);
  const bandDev = Math.max(stdDev * 1.06, envelope * 0.9);
  return { stdDev, upDev, dnDev, bandDev };
}

function toRatio(p: number, min: number, max: number): number {
  const r = max - min;
  return r > 0 ? (max - p) / r : 0.5;
}

function indexForTime(visible: Candle[], t: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < visible.length; k++) {
    const ct = visible[k].time as number;
    const d = Math.abs(ct - t);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

function pushTrendLineOverlay(
  visible: Candle[],
  min: number,
  max: number,
  out: OverlayItem[],
  id: string,
  label: string,
  t1: number,
  p1: number,
  t2: number,
  p2: number,
  hexStroke: string,
  strokeAlpha: number,
  dash: ParkfLineStyle,
  category: 'trendlineEngine',
  labelBg?: string,
  labelFg?: string,
  strokeWidth?: number
): void {
  if (typeof strokeWidth === 'number' && strokeWidth <= 0) return;
  const n = visible.length;
  const denom = Math.max(1, n - 1);
  const i1 = indexForTime(visible, t1);
  const i2 = indexForTime(visible, t2);
  const lineDash = dash === 'dashed' ? '6 5' : dash === 'dotted' ? '2 4' : undefined;
  const labelHex = normalizeHex6(hexStroke, '#E2E8F0');
  const fg = labelFg ? normalizeHex6(labelFg, '#FFFFFF') : labelHex;
  const item: OverlayItem = {
    id,
    kind: 'trendLine',
    label,
    x1: i1 / denom,
    y1: toRatio(p1, min, max),
    x2: i2 / denom,
    y2: toRatio(p2, min, max),
    time1: t1,
    time2: t2,
    price1: p1,
    price2: p2,
    confidence: 72,
    color: hexToRgba(labelHex, strokeAlpha),
    lineLabelColor: fg,
    ...(labelBg ? { labelBackgroundColor: labelBg } : {}),
    ...(labelFg ? { labelTextColor: fg } : {}),
    category,
    ...(lineDash ? { lineDash } : {}),
    ...(typeof strokeWidth === 'number' && strokeWidth > 0 ? { lineStrokeWidth: strokeWidth } : {}),
  };
  out.push(item);
}

/** Pine extend.left — 회귀 길이(봉 수)만큼 시각 좌측으로 기하 연장 */
function extendLinRegLeftAnchor(
  tL: number,
  pL: number,
  tR: number,
  pR: number,
  barMs: number,
  extendBars: number
): { tL: number; pL: number } {
  if (extendBars <= 0) return { tL, pL };
  const dt = tR - tL;
  if (Math.abs(dt) < 1e-9) return { tL, pL };
  const slope = (pR - pL) / dt;
  const tNew = tL - extendBars * barMs;
  return { tL: tNew, pL: pL + slope * (tNew - tL) };
}

/** Pine pivothigh: center strictly higher than leftbars before and rightbars after */
function collectPivotHighs(
  candles: Candle[],
  src: number[],
  left: number,
  right: number
): Array<{ idx: number; price: number; time: number }> {
  const n = candles.length;
  const out: Array<{ idx: number; price: number; time: number }> = [];
  for (let i = left; i <= n - 1 - right; i++) {
    const v = src[i];
    let ok = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k !== i && src[k] >= v) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ idx: i, price: v, time: candles[i].time as number });
  }
  return out;
}

function collectPivotLows(
  candles: Candle[],
  src: number[],
  left: number,
  right: number
): Array<{ idx: number; price: number; time: number }> {
  const n = candles.length;
  const out: Array<{ idx: number; price: number; time: number }> = [];
  for (let i = left; i <= n - 1 - right; i++) {
    const v = src[i];
    let ok = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k !== i && src[k] <= v) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ idx: i, price: v, time: candles[i].time as number });
  }
  return out;
}

/** Pine: o = open[1] at each bar — 여기서는 close[i] vs open[i-1] */
function pivotHighSrc(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i < 1) return c.high;
    return c.close > candles[i - 1].open ? c.high : c.low;
  });
}

function pivotLowSrc(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i < 1) return c.low;
    return c.close > candles[i - 1].open ? c.low : c.high;
  });
}

function barDurationMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 60_000;
  const d = (candles[n - 1].time as number) - (candles[n - 2].time as number);
  return Number.isFinite(d) && d > 0 ? d : 60_000;
}

function appendPivotTrendlines(
  visible: Candle[],
  min: number,
  max: number,
  out: OverlayItem[],
  opts: {
    pivotLen: number;
    extLabel: string;
    show: boolean;
    idPrefix: string;
    hexColor: string;
    strokeAlpha: number;
    highDash: ParkfLineStyle;
    lowDash: ParkfLineStyle;
    useLog: boolean;
    lineWidth: number;
  }
): { highSeg: PivotTlSegment | null; lowSeg: PivotTlSegment | null } {
  const empty = { highSeg: null as PivotTlSegment | null, lowSeg: null as PivotTlSegment | null };
  if (!opts.show || visible.length < opts.pivotLen + 3) return empty;
  const left = opts.pivotLen;
  const right = Math.max(1, Math.floor(opts.pivotLen / 2));
  const phSrc = pivotHighSrc(visible);
  const plSrc = pivotLowSrc(visible);
  const highs = collectPivotHighs(visible, phSrc, left, right);
  const lows = collectPivotLows(visible, plSrc, left, right);
  const mult = extensionMultiplier(opts.extLabel);
  const barMs = barDurationMs(visible);
  const extMs = mult * barMs * 25;

  let highSeg: PivotTlSegment | null = null;
  let lowSeg: PivotTlSegment | null = null;

  if (highs.length >= 2) {
    const B = highs[highs.length - 2];
    const A = highs[highs.length - 1];
    const slope = opts.useLog
      ? (Math.log(A.price) - Math.log(B.price)) / Math.max(1, A.time - B.time)
      : (A.price - B.price) / Math.max(1, A.time - B.time);
    const effMs = mult !== 0 ? extMs : barMs * 400;
    const t2 = A.time + effMs;
    const p2 = opts.useLog ? A.price * Math.exp(effMs * slope) : A.price + effMs * slope;
    highSeg = { t1: B.time, p1: B.price, t2, p2 };
    pushTrendLineOverlay(
      visible,
      min,
      max,
      out,
      `${opts.idPrefix}-ph`,
      'Trendlines Resistance',
      B.time,
      B.price,
      t2,
      p2,
      opts.hexColor,
      opts.strokeAlpha,
      opts.highDash,
      'trendlineEngine',
      TV_LABEL.tlResistBg,
      TV_LABEL.tlResistFg,
      opts.lineWidth
    );
  }
  if (lows.length >= 2) {
    const B = lows[lows.length - 2];
    const A = lows[lows.length - 1];
    const slope = opts.useLog
      ? (Math.log(A.price) - Math.log(B.price)) / Math.max(1, A.time - B.time)
      : (A.price - B.price) / Math.max(1, A.time - B.time);
    const effMs = mult !== 0 ? extMs : barMs * 400;
    const t2 = A.time + effMs;
    const p2 = opts.useLog ? A.price * Math.exp(effMs * slope) : A.price + effMs * slope;
    lowSeg = { t1: B.time, p1: B.price, t2, p2 };
    pushTrendLineOverlay(
      visible,
      min,
      max,
      out,
      `${opts.idPrefix}-pl`,
      'Trendlines Support',
      B.time,
      B.price,
      t2,
      p2,
      opts.hexColor,
      opts.strokeAlpha,
      opts.lowDash,
      'trendlineEngine',
      TV_LABEL.tlSupportBg,
      TV_LABEL.tlSupportFg,
      opts.lineWidth
    );
  }
  return { highSeg, lowSeg };
}

function linRegPriceAtNewest(intercept: number): number {
  return intercept;
}

function linRegPriceAtOldest(intercept: number, slope: number, length: number): number {
  return intercept + slope * (length - 1);
}

/** 차트 우측(최신 봉 시점) LinReg 밴드 가격 — SMC·근접 분석용 (선 오버레이와 동일 수학) */
export type ParkfLinRegBandSnapshot = {
  mid: number;
  resL: number;
  resM: number;
  resS: number;
  supL: number;
  supM: number;
  supS: number;
  stdDev: number;
  /** 밴드에 사용된 혼합 폭(σ·고저 이탈) */
  bandDev: number;
  eps: number;
  length: number;
};

export function computeParkfLinRegBandSnapshot(
  visible: Candle[],
  partial?: Partial<ParkfTrendlineOpts>
): ParkfLinRegBandSnapshot | null {
  const opts: ParkfTrendlineOpts = { ...DEFAULT_PARKF_TRENDLINE_OPTS, ...partial };
  const n = visible.length;
  if (n < 8) return null;
  const closes = visible.map((c) => c.close);
  const highs = visible.map((c) => c.high);
  const lows = visible.map((c) => c.low);
  const length = Math.max(2, Math.min(opts.linregLength, n));
  const lin = calcSlopePine(closes, length);
  if (!lin) return null;
  const { stdDev, bandDev } = calcDevPine(closes, highs, lows, length, lin.slope, lin.average, lin.intercept);
  const endP = linRegPriceAtNewest(lin.intercept);
  const last = visible[n - 1];
  let minR = Infinity;
  let maxR = -Infinity;
  for (const c of visible) {
    minR = Math.min(minR, c.low);
    maxR = Math.max(maxR, c.high);
  }
  const eps = Math.max((maxR - minR) * 0.0008, last.close * 0.0002);
  const mL = opts.linRegLargeMult;
  const mM = opts.linRegMediumMult;
  const mS = opts.linRegSmallMult;
  return {
    mid: endP,
    resL: endP + mL * bandDev,
    resM: endP + mM * bandDev,
    resS: endP + mS * bandDev,
    supL: endP - mL * bandDev,
    supM: endP - mM * bandDev,
    supS: endP - mS * bandDev,
    stdDev,
    bandDev,
    eps,
    length,
  };
}

/** LinReg **대(外)밴드** 상·하 경계 — 차트 선과 동일한 (tL,tR) 직선 보간. 거래량·채널 분석용 */
export type LinRegLargeChannelBounds = {
  tL: number;
  tR: number;
  /** 대밴드 폭 = linRegLargeMult × bandDev (bandDev는 σ와 고·저 이탈 혼합) */
  mult: number;
  stdDev: number;
  /** 밴드 오프셋에 실제로 쓰인 폭(≥ σ) */
  bandDev: number;
  length: number;
  startMid: number;
  endMid: number;
  upperAt: (t: number) => number;
  lowerAt: (t: number) => number;
};

/**
 * 차트에 그려지는 LinReg Large 밴드와 동일 기하(시작·끝 미드에 ± mult×σ).
 * useLargeLinReg가 꺼져 있어도 분석용으로는 Large 멀티플을 씀(바깥 보라/초록 띠와 맞춤).
 */
export function computeLinRegLargeChannelBounds(
  visible: Candle[],
  partial?: Partial<ParkfTrendlineOpts>
): LinRegLargeChannelBounds | null {
  const opts: ParkfTrendlineOpts = { ...DEFAULT_PARKF_TRENDLINE_OPTS, ...partial };
  const n = visible.length;
  if (n < 8) return null;
  const closes = visible.map((c) => c.close);
  const highs = visible.map((c) => c.high);
  const lows = visible.map((c) => c.low);
  const length = Math.max(2, Math.min(opts.linregLength, n));
  const lin = calcSlopePine(closes, length);
  if (!lin) return null;
  const { stdDev, bandDev } = calcDevPine(closes, highs, lows, length, lin.slope, lin.average, lin.intercept);
  const startMid = linRegPriceAtOldest(lin.intercept, lin.slope, length);
  const endMid = linRegPriceAtNewest(lin.intercept);
  const i0 = n - length;
  const tL = visible[i0].time as number;
  const tR = visible[n - 1].time as number;
  const dt = tR - tL;
  if (Math.abs(dt) < 1e-6) return null;
  const mult = opts.linRegLargeMult;
  const off = mult * bandDev;
  const upperAt = (t: number) => {
    const u0 = startMid + off;
    const u1 = endMid + off;
    return u0 + ((u1 - u0) * (t - tL)) / dt;
  };
  const lowerAt = (t: number) => {
    const l0 = startMid - off;
    const l1 = endMid - off;
    return l0 + ((l1 - l0) * (t - tL)) / dt;
  };
  return { tL, tR, mult, stdDev, bandDev, length, startMid, endMid, upperAt, lowerAt };
}

/** 돌파 메타(★ 라벨용) — LinReg 밴드 기준 단순 근사 */
function computeMetaFromLinReg(
  last: Candle,
  upperEnd: number,
  lowerEnd: number,
  midEnd: number,
  eps: number
): LuxTrendlineMeta {
  return {
    resistBrokenUp: last.close > upperEnd + eps,
    supportBrokenDown: last.close < lowerEnd - eps,
    bouncedSupport: last.low <= lowerEnd + eps * 0.85 && last.close > lowerEnd,
    rejectedResistance: last.high >= upperEnd - eps * 0.85 && last.close < upperEnd,
  };
}

export function computeParkfTrendlineOverlays(
  visible: Candle[],
  min: number,
  max: number,
  partial?: Partial<ParkfTrendlineOpts>
): LuxTrendlineEngineResult {
  const opts: ParkfTrendlineOpts = { ...DEFAULT_PARKF_TRENDLINE_OPTS, ...partial };
  const col = mergeParkfTrendlineColors(opts.colors);
  const n = visible.length;
  if (n < 8) {
    return { overlays: [], meta: { ...EMPTY_META }, hasLargeStructure: false };
  }

  const closes = visible.map(c => c.close);
  const highs = visible.map(c => c.high);
  const lows = visible.map(c => c.low);
  const length = Math.max(2, Math.min(opts.linregLength, n));

  /** Pine: LinReg·calcDev는 종가·고저 **선형** (log_chart는 피벗 추세선에만 사용) */
  const lin = calcSlopePine(closes, length);
  const out: OverlayItem[] = [];

  if (lin) {
    const { stdDev, upDev, dnDev, bandDev } = calcDevPine(closes, highs, lows, length, lin.slope, lin.average, lin.intercept);

    const startP = linRegPriceAtOldest(lin.intercept, lin.slope, length);
    const endP = linRegPriceAtNewest(lin.intercept);
    const i0 = n - length;
    let tL = visible[i0].time as number;
    const tR = visible[n - 1].time as number;
    const barMs = barDurationMs(visible);

    let startPrice = startP;
    const endPrice = endP;
    if (opts.extendLinRegLeft) {
      const ext = extendLinRegLeftAnchor(tL, startPrice, tR, endPrice, barMs, length);
      tL = ext.tL;
      startPrice = ext.pL;
    }

    const pushBand = (
      id: string,
      labelStem: string,
      upOff: number,
      dnOff: number,
      hex: string,
      bandAlpha: number,
      dash: ParkfLineStyle,
      on: boolean,
      lineW: number
    ) => {
      if (!on) return;
      const uS = startPrice + upOff;
      const uE = endPrice + upOff;
      const lS = startPrice - dnOff;
      const lE = endPrice - dnOff;
      pushTrendLineOverlay(
        visible,
        min,
        max,
        out,
        `${id}-u`,
        `${labelStem} Resistance`,
        tL,
        uS,
        tR,
        uE,
        hex,
        bandAlpha,
        dash,
        'trendlineEngine',
        TV_LABEL.lrResistBg,
        TV_LABEL.lrResistFg,
        lineW
      );
      pushTrendLineOverlay(
        visible,
        min,
        max,
        out,
        `${id}-d`,
        `${labelStem} Support`,
        tL,
        lS,
        tR,
        lE,
        hex,
        bandAlpha,
        dash,
        'trendlineEngine',
        TV_LABEL.lrSupportBg,
        TV_LABEL.lrSupportFg,
        lineW
      );
    };

    pushTrendLineOverlay(
      visible,
      min,
      max,
      out,
      'parkf-lr-base',
      'LinReg Mid',
      tL,
      startPrice,
      tR,
      endPrice,
      col.linRegBaseHex,
      0.95,
      opts.linRegBaseStyle,
      'trendlineEngine',
      TV_LABEL.lrCenterBg,
      TV_LABEL.lrCenterFg,
      opts.linRegBaseWidth
    );

    const uLg = opts.linRegLargeMult * bandDev;
    const uMd = opts.linRegMediumMult * bandDev;
    const uSm = opts.linRegSmallMult * bandDev;
    pushBand('parkf-lr-lg', 'LinReg (L)', uLg, uLg, col.linRegLargeHex, 0.9, opts.linRegLargeStyle, opts.useLargeLinReg, opts.linRegLargeWidth);
    pushBand('parkf-lr-md', 'LinReg (M)', uMd, uMd, col.linRegMediumHex, 0.9, opts.linRegMediumStyle, opts.useMediumLinReg, opts.linRegMediumWidth);
    pushBand('parkf-lr-sm', 'LinReg (S)', uSm, uSm, col.linRegSmallHex, 0.88, opts.linRegSmallStyle, opts.useSmallLinReg, opts.linRegSmallWidth);

    void upDev;
    void dnDev;

    const last = visible[n - 1];
    const eps = Math.max((max - min) * 0.0008, last.close * 0.0002);
    const bandMult = opts.useLargeLinReg
      ? opts.linRegLargeMult
      : opts.useMediumLinReg
        ? opts.linRegMediumMult
        : opts.linRegSmallMult;
    const upperEnd = endPrice + bandMult * bandDev;
    const lowerEnd = endPrice - bandMult * bandDev;
    const meta = computeMetaFromLinReg(last, upperEnd, lowerEnd, endPrice, eps);

    const priSeg = appendPivotTrendlines(visible, min, max, out, {
      pivotLen: opts.primaryPivotLen,
      extLabel: opts.primaryExtension,
      show: opts.showPrimaryTrendlines,
      idPrefix: 'parkf-pri',
      hexColor: col.trendPrimaryHex,
      strokeAlpha: 0.92,
      highDash: opts.primaryTrendlineStyle,
      lowDash: opts.primaryTrendlineStyle,
      useLog: opts.useLogChart,
      lineWidth: opts.primaryTrendlineWidth,
    });

    appendPivotTrendlines(visible, min, max, out, {
      pivotLen: opts.secondaryPivotLen,
      extLabel: opts.secondaryExtension,
      show: opts.showSecondaryTrendlines,
      idPrefix: 'parkf-sec',
      hexColor: col.trendSecondaryHex,
      strokeAlpha: 0.88,
      highDash: opts.secondaryTrendlineStyle,
      lowDash: opts.secondaryTrendlineStyle,
      useLog: opts.useLogChart,
      lineWidth: opts.secondaryTrendlineWidth,
    });

    const lrT1 = tL;
    const lrP1 = startPrice;
    const lrT2 = tR;
    const lrP2 = endPrice;
    const pushX = (seg: PivotTlSegment | null, resist: boolean) => {
      if (!seg) return;
      const hit = intersectInfiniteLines(seg.t1, seg.p1, seg.t2, seg.p2, lrT1, lrP1, lrT2, lrP2);
      if (!hit) return;
      const t0 = visible[0].time as number;
      const tLast = visible[visible.length - 1].time as number;
      const bms = barDurationMs(visible);
      if (hit.t < t0 - bms * 2 || hit.t > tLast + bms * 120) return;
      const rng = max - min;
      if (hit.p < min - rng * 0.2 || hit.p > max + rng * 0.2) return;
      if (resist) {
        pushParkfPin(
          visible,
          min,
          max,
          out,
          'parkf-xsec-res',
          'LR · TL Resistance',
          hit.t,
          hit.p,
          '#FB923C',
          TV_LABEL.xsecResistBg,
          TV_LABEL.xsecResistFg
        );
      } else {
        pushParkfPin(
          visible,
          min,
          max,
          out,
          'parkf-xsec-sup',
          'LR · TL Support',
          hit.t,
          hit.p,
          '#3B82F6',
          TV_LABEL.xsecSupportBg,
          TV_LABEL.xsecSupportFg
        );
      }
    };
    pushX(priSeg.highSeg, true);
    pushX(priSeg.lowSeg, false);

    return { overlays: out, meta, hasLargeStructure: false };
  }

  appendPivotTrendlines(visible, min, max, out, {
    pivotLen: opts.primaryPivotLen,
    extLabel: opts.primaryExtension,
    show: opts.showPrimaryTrendlines,
    idPrefix: 'parkf-pri',
    hexColor: col.trendPrimaryHex,
    strokeAlpha: 0.92,
    highDash: opts.primaryTrendlineStyle,
    lowDash: opts.primaryTrendlineStyle,
    useLog: opts.useLogChart,
    lineWidth: opts.primaryTrendlineWidth,
  });

  appendPivotTrendlines(visible, min, max, out, {
    pivotLen: opts.secondaryPivotLen,
    extLabel: opts.secondaryExtension,
    show: opts.showSecondaryTrendlines,
    idPrefix: 'parkf-sec',
    hexColor: col.trendSecondaryHex,
    strokeAlpha: 0.88,
    highDash: opts.secondaryTrendlineStyle,
    lowDash: opts.secondaryTrendlineStyle,
    useLog: opts.useLogChart,
    lineWidth: opts.secondaryTrendlineWidth,
  });

  return { overlays: out, meta: { ...EMPTY_META }, hasLargeStructure: false };
}
