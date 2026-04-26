/**
 * LuxAlgo 스타일 자동 추세선 (간소화):
 * - 피벗(Lookback L/R) → **가장 최근 두 고점** 저항, **가장 최근 두 저점** 지지 (작은구조만; 큰구조·채널 평행선 없음)
 * - 마지막 봉 종가로 돌파/이탈·반등·거부 → 점선/실선·색
 * - 차트: Lux `autoTrendline`은 **마지막 캔들 시각**까지만 우측 연장(ChartView)
 */

import type { Candle, OverlayItem } from '@/types';

export type LuxTrendlineMeta = {
  resistBrokenUp: boolean;
  supportBrokenDown: boolean;
  bouncedSupport: boolean;
  rejectedResistance: boolean;
};

export type LuxTrendlineEngineResult = {
  overlays: OverlayItem[];
  meta: LuxTrendlineMeta;
  /** 예약: 큰구조 비활성화 시 항상 false */
  hasLargeStructure?: boolean;
};

function luxPivotHighRelaxed(candles: Candle[], i: number, L: number, R: number): boolean {
  const n = candles.length;
  const lo = Math.max(0, i - L);
  const hi = Math.min(n - 1, i + R);
  if (hi - lo < 1) return false;
  const h = candles[i].high;
  for (let j = lo; j <= hi; j++) {
    if (j !== i && candles[j].high >= h) return false;
  }
  return true;
}

function luxPivotLowRelaxed(candles: Candle[], i: number, L: number, R: number): boolean {
  const n = candles.length;
  const lo = Math.max(0, i - L);
  const hi = Math.min(n - 1, i + R);
  if (hi - lo < 1) return false;
  const l = candles[i].low;
  for (let j = lo; j <= hi; j++) {
    if (j !== i && candles[j].low <= l) return false;
  }
  return true;
}

/** analyze BOS/CHOCH와 동일: 좌2·우2 고점 피벗 */
function pivotHigh22(candles: Candle[], i: number): boolean {
  if (i < 2 || i + 2 >= candles.length) return false;
  const v = candles[i].high;
  for (let j = i - 2; j <= i + 2; j++) {
    if (j !== i && candles[j].high >= v) return false;
  }
  return true;
}

/** analyze BOS/CHOCH와 동일: 좌2·우2 저점 피벗 */
function pivotLow22(candles: Candle[], i: number): boolean {
  if (i < 2 || i + 2 >= candles.length) return false;
  const v = candles[i].low;
  for (let j = i - 2; j <= i + 2; j++) {
    if (j !== i && candles[j].low <= v) return false;
  }
  return true;
}

function priceAtLine(p1: { index: number; price: number }, p2: { index: number; price: number }, idx: number): number {
  if (p2.index === p1.index) return p1.price;
  const slope = (p2.price - p1.price) / (p2.index - p1.index);
  return p1.price + slope * (idx - p1.index);
}

const EMPTY_META: LuxTrendlineMeta = {
  resistBrokenUp: false,
  supportBrokenDown: false,
  bouncedSupport: false,
  rejectedResistance: false,
};

type BuildOpts = {
  idResist: string;
  idSupport: string;
  structLabel: string;
  resistDash?: string;
  supportDash?: string;
  resistColorSolid: string;
  resistColorDash: string;
  supportColorSolid: string;
  supportColorDash: string;
};

function buildLuxTlForLookback(
  visible: Candle[],
  min: number,
  max: number,
  lookback: number,
  atrVal: number,
  opts: BuildOpts
): { overlays: OverlayItem[]; meta: LuxTrendlineMeta } {
  const L = Math.max(2, Math.min(15, Math.floor(lookback)));
  const R = L;
  const n = visible.length;
  const range = Math.max(1e-9, max - min);
  const toY = (p: number) => (max - p) / range;

  if (n < Math.max(4, L + 2)) {
    return { overlays: [], meta: { ...EMPTY_META } };
  }

  const highs: { index: number; price: number }[] = [];
  const lows: { index: number; price: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (luxPivotHighRelaxed(visible, i, L, R)) highs.push({ index: i, price: visible[i].high });
    if (luxPivotLowRelaxed(visible, i, L, R)) lows.push({ index: i, price: visible[i].low });
  }

  const denom = Math.max(1, n - 1);
  const lastIdx = n - 1;
  const last = visible[lastIdx];
  const eps = Math.max(atrVal * 0.1, last.close * 0.0003);

  const overlays: OverlayItem[] = [];
  let resistBrokenUp = false;
  let supportBrokenDown = false;
  let bouncedSupport = false;
  let rejectedResistance = false;

  const lb = (base: string) => `${base}(${opts.structLabel})`;

  if (highs.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const yLast = priceAtLine(h1, h2, lastIdx);
    resistBrokenUp = last.close > yLast + eps;
    rejectedResistance = !resistBrokenUp && last.high >= yLast - eps * 0.85 && last.close < yLast;

    const pStart = h1.price;
    const pPivot2 = h2.price;

    overlays.push({
      id: opts.idResist,
      kind: 'trendLine',
      label: resistBrokenUp ? lb('저항 돌파(실선)') : lb('저항(점선)'),
      x1: h1.index / denom,
      y1: toY(pStart),
      x2: h2.index / denom,
      y2: toY(pPivot2),
      time1: visible[h1.index].time as number,
      time2: visible[h2.index].time as number,
      price1: pStart,
      price2: pPivot2,
      confidence: resistBrokenUp ? 86 : 78,
      color: resistBrokenUp ? opts.resistColorSolid : opts.resistColorDash,
      category: 'autoTrendline',
      ...(resistBrokenUp ? {} : { lineDash: opts.resistDash ?? '6 5' }),
    });
  }

  if (lows.length >= 2) {
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const yLast = priceAtLine(l1, l2, lastIdx);
    supportBrokenDown = last.close < yLast - eps;
    bouncedSupport = !supportBrokenDown && last.low <= yLast + eps * 0.85 && last.close > yLast;

    const pStart = l1.price;
    const pPivot2 = l2.price;

    overlays.push({
      id: opts.idSupport,
      kind: 'trendLine',
      label: supportBrokenDown ? lb('지지 이탈(실선)') : lb('지지(점선)'),
      x1: l1.index / denom,
      y1: toY(pStart),
      x2: l2.index / denom,
      y2: toY(pPivot2),
      time1: visible[l1.index].time as number,
      time2: visible[l2.index].time as number,
      price1: pStart,
      price2: pPivot2,
      confidence: supportBrokenDown ? 86 : 78,
      color: supportBrokenDown ? opts.supportColorSolid : opts.supportColorDash,
      category: 'autoTrendline',
      ...(supportBrokenDown ? {} : { lineDash: opts.supportDash ?? '6 5' }),
    });
  }

  return {
    overlays,
    meta: {
      resistBrokenUp,
      supportBrokenDown,
      bouncedSupport,
      rejectedResistance,
    },
  };
}

/**
 * 큰구조: visible 구간 **최고 고가(동률 시 가장 과거 봉)** → 그 이후 2·2 피벗 중 최고점보다 낮은 **마지막 고점**.
 * 지지: **최저 저가(동률 시 가장 과거)** → 그 이후 피벗 중 최저보다 높은 **마지막 저점**.
 */
function buildLargeStructureFromChartExtremes(visible: Candle[], min: number, max: number, atrVal: number): OverlayItem[] {
  const n = visible.length;
  if (n < 6) return [];

  let maxHigh = -Infinity;
  let minLow = Infinity;
  for (let i = 0; i < n; i++) {
    maxHigh = Math.max(maxHigh, visible[i].high);
    minLow = Math.min(minLow, visible[i].low);
  }

  let peakIdx = -1;
  for (let i = 0; i < n; i++) {
    if (visible[i].high === maxHigh) {
      peakIdx = i;
      break;
    }
  }
  let troughIdx = -1;
  for (let i = 0; i < n; i++) {
    if (visible[i].low === minLow) {
      troughIdx = i;
      break;
    }
  }

  const pivotHighs: { index: number; price: number }[] = [];
  const pivotLows: { index: number; price: number }[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (pivotHigh22(visible, i)) pivotHighs.push({ index: i, price: visible[i].high });
    if (pivotLow22(visible, i)) pivotLows.push({ index: i, price: visible[i].low });
  }

  const denom = Math.max(1, n - 1);
  const range = Math.max(1e-9, max - min);
  const toY = (p: number) => (max - p) / range;
  const lastIdx = n - 1;
  const last = visible[lastIdx];
  const eps = Math.max(atrVal * 0.1, last.close * 0.0003);

  const overlays: OverlayItem[] = [];
  const lbRes = (base: string) => `${base}(큰구조·고점축)`;
  const lbSup = (base: string) => `${base}(큰구조·저점축)`;

  let h2: { index: number; price: number } | null = null;
  for (const ph of pivotHighs) {
    if (ph.index > peakIdx && ph.price < maxHigh) h2 = ph;
  }
  if (peakIdx >= 0 && h2 != null && h2.index !== peakIdx) {
    const p1 = { index: peakIdx, price: visible[peakIdx].high };
    const yLast = priceAtLine(p1, h2, lastIdx);
    const resistBrokenUp = last.close > yLast + eps;
    overlays.push({
      id: 'lux-resist-tl-large',
      kind: 'trendLine',
      label: resistBrokenUp ? lbRes('저항 돌파(실선)') : lbRes('저항(점선)'),
      x1: p1.index / denom,
      y1: toY(p1.price),
      x2: h2.index / denom,
      y2: toY(h2.price),
      time1: visible[p1.index].time as number,
      time2: visible[h2.index].time as number,
      price1: p1.price,
      price2: h2.price,
      confidence: resistBrokenUp ? 84 : 76,
      color: resistBrokenUp ? 'rgba(234,179,8,0.78)' : 'rgba(239,68,68,0.68)',
      category: 'autoTrendline',
      ...(resistBrokenUp ? {} : { lineDash: '10 7' }),
    });
  }

  let l2: { index: number; price: number } | null = null;
  for (const pl of pivotLows) {
    if (pl.index > troughIdx && pl.price > minLow) l2 = pl;
  }
  if (troughIdx >= 0 && l2 != null && l2.index !== troughIdx) {
    const p1 = { index: troughIdx, price: visible[troughIdx].low };
    const yLast = priceAtLine(p1, l2, lastIdx);
    const supportBrokenDown = last.close < yLast - eps;
    overlays.push({
      id: 'lux-support-tl-large',
      kind: 'trendLine',
      label: supportBrokenDown ? lbSup('지지 이탈(실선)') : lbSup('지지(점선)'),
      x1: p1.index / denom,
      y1: toY(p1.price),
      x2: l2.index / denom,
      y2: toY(l2.price),
      time1: visible[p1.index].time as number,
      time2: visible[l2.index].time as number,
      price1: p1.price,
      price2: l2.price,
      confidence: supportBrokenDown ? 84 : 76,
      color: supportBrokenDown ? 'rgba(234,179,8,0.78)' : 'rgba(34,197,94,0.68)',
      category: 'autoTrendline',
      ...(supportBrokenDown ? {} : { lineDash: '10 7' }),
    });
  }

  return overlays;
}

export function computeLuxAlgoTrendlineOverlays(
  visible: Candle[],
  min: number,
  max: number,
  lookback: number,
  atrVal: number
): LuxTrendlineEngineResult {
  const L = Math.max(2, Math.min(15, Math.floor(lookback)));

  const small = buildLuxTlForLookback(visible, min, max, L, atrVal, {
    idResist: 'lux-resist-tl-small',
    idSupport: 'lux-support-tl-small',
    structLabel: '작은구조',
    resistDash: '6 5',
    supportDash: '6 5',
    resistColorSolid: 'rgba(234,179,8,0.95)',
    resistColorDash: 'rgba(239,68,68,0.92)',
    supportColorSolid: 'rgba(234,179,8,0.95)',
    supportColorDash: 'rgba(34,197,94,0.92)',
  });

  /** 시각 노이즈 감소: 큰구조·채널 평행선 없이 작은구조 저항·지지 2선만 */
  return {
    overlays: small.overlays,
    meta: small.meta,
    hasLargeStructure: false,
  };
}
