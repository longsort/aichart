/**
 * Parallel Pivot Lines — LuxAlgo Pine 수식 1:1 포팅 (타점·차트용).
 *
 * 원작: Parallel Pivot Lines [LuxAlgo]
 * © LuxAlgo — CC BY-NC-SA 4.0
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 *
 * 확정 승률·수익 아님. 상업 배포 시 라이선스 확인 필요.
 */
import type { Candle, OverlayItem } from '@/types';
import { MERGED_DESK_RB_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';

export const PPL_DEFAULT_LENGTH = 30;
export const PPL_DEFAULT_LOOKBACK = 3;
export const PPL_DEFAULT_SLOPE_MULT = 1;
export const PPL_PH_COLOR = '#2157f3';
export const PPL_PL_COLOR = '#ff1100';

export type ParallelPivotLine = {
  kind: 'ph' | 'pl';
  /** 피벗 봉 인덱스 (bar_index) */
  x1: number;
  /** 피벗 가격 */
  y0: number;
  /** 봉당 기울기 (Pine slope) */
  slope: number;
  /** 마지막 실봉에서의 선 가격 */
  tipPrice: number;
};

export type ParallelPivotLinesPack = {
  slope: number;
  k: number;
  lines: ParallelPivotLine[];
  overlays: OverlayItem[];
  /** LuxAlgo 귀속 */
  attribution: string;
};

function smaFromCum(cum: number[], i: number, p: number): number {
  const len = Math.max(p, 0);
  if (len <= 0 || i < 0) return 0;
  const a = cum[i] ?? 0;
  const aPrev = i - len >= 0 ? cum[i - len]! : 0;
  return (a - aPrev) / len;
}

/** Pine: Variance(src,p) */
function varianceFromCum(
  cumSrc: number[],
  cumSrc2: number[],
  i: number,
  p: number
): number {
  if (p === 1) return 0;
  const m = smaFromCum(cumSrc, i, p);
  const m2 = smaFromCum(cumSrc2, i, p);
  return m2 - m * m;
}

/** Pine: Covariance(x,y,p) */
function covarianceFromCum(
  cumX: number[],
  cumY: number[],
  cumXY: number[],
  i: number,
  p: number
): number {
  return (
    smaFromCum(cumXY, i, p) -
    smaFromCum(cumX, i, p) * smaFromCum(cumY, i, p)
  );
}

/**
 * Pine pivothigh(length,length) / pivotlow — 확정봉 i 에서
 * 피벗은 i-length, 값은 high/low.
 */
function detectPivots(
  candles: Candle[],
  length: number
): { ph: Array<{ n: number; price: number }>; pl: Array<{ n: number; price: number }> } {
  const ph: Array<{ n: number; price: number }> = [];
  const pl: Array<{ n: number; price: number }> = [];
  const nBars = candles.length;
  if (nBars < length * 2 + 1) return { ph, pl };

  for (let i = length; i < nBars; i++) {
    const pivotI = i - length;
    const hi = Number(candles[pivotI]!.high);
    const lo = Number(candles[pivotI]!.low);
    let isPh = true;
    let isPl = true;
    for (let j = pivotI - length; j <= pivotI + length; j++) {
      if (j < 0 || j >= nBars || j === pivotI) continue;
      if (Number(candles[j]!.high) >= hi) isPh = false;
      if (Number(candles[j]!.low) <= lo) isPl = false;
      if (!isPh && !isPl) break;
    }
    /** Pine: if ph → insert at confirm bar n=i */
    if (isPh) ph.push({ n: i, price: hi });
    if (isPl) pl.push({ n: i, price: lo });
  }
  return { ph, pl };
}

/**
 * LuxAlgo Parallel Pivot Lines 코어 — 입력 기본값 length=30, lookback=3, Slope=1.
 */
export function buildParallelPivotLines(
  candles: Candle[],
  opts?: {
    length?: number;
    lookback?: number;
    slopeMult?: number;
    phColor?: string;
    plColor?: string;
    tipPad?: number;
  }
): ParallelPivotLinesPack {
  const length = Math.max(1, Math.floor(opts?.length ?? PPL_DEFAULT_LENGTH));
  const lookback = Math.max(1, Math.floor(opts?.lookback ?? PPL_DEFAULT_LOOKBACK));
  const slopeMult = Math.max(
    -1,
    Math.min(1, Number(opts?.slopeMult ?? PPL_DEFAULT_SLOPE_MULT))
  );
  const phColor = opts?.phColor ?? PPL_PH_COLOR;
  const plColor = opts?.plColor ?? PPL_PL_COLOR;
  const tipPad = Math.max(0, Math.floor(opts?.tipPad ?? MERGED_DESK_RB_FUTURE_BARS));
  const attribution =
    'Parallel Pivot Lines logic © LuxAlgo · CC BY-NC-SA 4.0';

  const nBars = candles.length;
  const empty: ParallelPivotLinesPack = {
    slope: 0,
    k: 2,
    lines: [],
    overlays: [],
    attribution,
  };
  if (nBars < length * 2 + 3) return empty;

  const { ph, pl } = detectPivots(candles, length);
  /** Pine array.insert(0,…) — 최신이 index 0 */
  const phArr = [...ph].reverse();
  const plArr = [...pl].reverse();

  if (phArr.length < lookback && plArr.length < lookback) return empty;

  const lastI = nBars - 1;
  /** valuewhen(ph, n-length, lookback-1) */
  const valPh =
    phArr.length >= lookback
      ? phArr[lookback - 1]!.n - length
      : Number.POSITIVE_INFINITY;
  const valPl =
    plArr.length >= lookback
      ? plArr[lookback - 1]!.n - length
      : Number.POSITIVE_INFINITY;
  const val = Math.min(valPh, valPl);
  const k = lastI - val > 0 ? lastI - val : 2;

  /** cum for close, n(bar_index), close*n, close², n² */
  const cumClose: number[] = new Array(nBars);
  const cumN: number[] = new Array(nBars);
  const cumCN: number[] = new Array(nBars);
  const cumC2: number[] = new Array(nBars);
  const cumN2: number[] = new Array(nBars);
  let sC = 0;
  let sN = 0;
  let sCN = 0;
  let sC2 = 0;
  let sN2 = 0;
  for (let i = 0; i < nBars; i++) {
    const c = Number(candles[i]!.close);
    const ni = i;
    sC += c;
    sN += ni;
    sCN += c * ni;
    sC2 += c * c;
    sN2 += ni * ni;
    cumClose[i] = sC;
    cumN[i] = sN;
    cumCN[i] = sCN;
    cumC2[i] = sC2;
    cumN2[i] = sN2;
  }

  const varN = varianceFromCum(cumN, cumN2, lastI, k);
  const covCN = covarianceFromCum(cumClose, cumN, cumCN, lastI, k);
  const slope = varN !== 0 ? (covCN / varN) * slopeMult : 0;

  const barStep =
    nBars >= 2
      ? Math.max(
          1,
          Number(candles[lastI]!.time) - Number(candles[lastI - 1]!.time)
        )
      : 60;
  const tLast = Number(candles[lastI]!.time);
  const tEnd = tLast + tipPad * barStep;
  const xEnd = lastI + tipPad;

  const lines: ParallelPivotLine[] = [];
  const overlays: OverlayItem[] = [];

  const pushLine = (
    kind: 'ph' | 'pl',
    confirmN: number,
    price: number,
    idx: number
  ) => {
    const x1 = confirmN - length;
    if (x1 < 0 || x1 >= nBars) return;
    const t1 = Number(candles[x1]!.time);
    const tipPrice = price + slope * (lastI - x1);
    const pEnd = price + slope * (xEnd - x1);
    lines.push({ kind, x1, y0: price, slope, tipPrice });
    const color = kind === 'ph' ? phColor : plColor;
    overlays.push({
      id: `merged-desk-ppl-${kind}-${idx}`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      price1: price,
      time2: tEnd,
      price2: pEnd,
      confidence: 0.85,
      color,
      category: 'chartPrimeTrendChannels',
      lineStrokeWidth: 1.6,
      noProject: true,
      overlayZoneExtraClass: [
        'merged-desk-ppl',
        'merged-desk-parallel-pivot',
        kind === 'ph' ? 'merged-desk-ppl-ph' : 'merged-desk-ppl-pl',
      ].join(' '),
      labelTooltip: `${attribution} · ${kind === 'ph' ? 'Pivot High' : 'Pivot Low'}`,
      lineLabelColor: color,
    });
  };

  const nPh = Math.min(lookback, phArr.length);
  for (let i = 0; i < nPh; i++) {
    const p = phArr[i]!;
    pushLine('ph', p.n, p.price, i);
  }
  const nPl = Math.min(lookback, plArr.length);
  for (let i = 0; i < nPl; i++) {
    const p = plArr[i]!;
    pushLine('pl', p.n, p.price, i);
  }

  return { slope, k, lines, overlays, attribution };
}

/** 차트용 — BNB 등 TV식 두꺼운 Parallel Pivot Lines */
export function buildBnbParallelPivotOverlays(candles: Candle[]): OverlayItem[] {
  const pack = buildParallelPivotLines(candles);
  return pack.overlays.map((o) => ({
    ...o,
    lineStrokeWidth: Math.max(2.4, Number(o.lineStrokeWidth) || 1.6),
    overlayZoneExtraClass: `${o.overlayZoneExtraClass || ''} merged-desk-ppl-bnb`.trim(),
  }));
}

/** 방향별 최근접 피벗선 팁 (롱=PL·숏=PH) */
export function nearestParallelPivotTip(
  pack: ParallelPivotLinesPack,
  direction: 'LONG' | 'SHORT',
  mark: number
): ParallelPivotLine | null {
  const want = direction === 'LONG' ? 'pl' : 'ph';
  const pool = pack.lines.filter((l) => l.kind === want);
  if (!pool.length) return null;
  let best: ParallelPivotLine | null = null;
  let bestDist = Infinity;
  for (const l of pool) {
    const d = Math.abs(l.tipPrice - mark);
    if (d < bestDist) {
      bestDist = d;
      best = l;
    }
  }
  return best;
}

/** 마크가 피벗선 존(ATR 패딩)에 닿았는지 */
export function markTouchesParallelPivot(
  mark: number,
  tip: number,
  pad: number
): boolean {
  if (!(mark > 0) || !(tip > 0)) return false;
  const p = Math.max(pad, tip * 0.00025);
  return mark >= tip - p && mark <= tip + p;
}
