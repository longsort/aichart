/**
 * 고래 모드: Multi-Anchored Linear Regression Channels (TANHEF Pine 요약 포팅)
 * — 표준 OLS + 잔차 RMS 밴드. Pine의 Ridge/Lasso/외부 TanHef 라이브러리 미포함(동일 수학 아님).
 * 앵커: Length, Bar High/Low, Vol High/Low, Spread High/Low, RSI High/Low, ATR High/Low, Slope≈0, R≈0 탐색.
 */
import type { Candle, OverlayItem } from '@/types';
import { atrSeries, rsi } from '@/lib/indicators';
import { normalizeHex6 } from '@/lib/chartHexColor';

export type WhaleAlrAnchor =
  | 'length'
  | 'barHigh'
  | 'barLow'
  | 'volHigh'
  | 'volLow'
  | 'spreadHigh'
  | 'spreadLow'
  | 'rsiHigh'
  | 'rsiLow'
  | 'atrHigh'
  | 'atrLow'
  | 'slopeZero'
  | 'rZero';

export type WhaleAlrSlotDisplay = 'off' | 'channel' | 'bands' | 'both';

export type WhaleAlrSlotConfig = {
  display: WhaleAlrSlotDisplay;
  anchor: WhaleAlrAnchor;
  maxLen: number;
  minLen: number;
  step: number;
  devMult: number;
  /** 상·하 채널 선색 (Pine 기본 톤) */
  upHex: string;
  downHex: string;
  /** 밴드 상·중·하 선색 */
  bandsOuterHex: string;
  bandsMidHex: string;
  /** 면 채움 rgba */
  fillRgba: string;
};

const DEFAULT_SLOT1: WhaleAlrSlotConfig = {
  display: 'both',
  anchor: 'barHigh',
  maxLen: 1000,
  minLen: 10,
  step: 1,
  devMult: 2,
  upHex: '#78ff7a',
  downHex: '#ff7878',
  bandsOuterHex: '#FFA500',
  bandsMidHex: '#FFA500',
  /** TV 스크린샷에 가까운 상승 녹색 밴드 면 */
  fillRgba: 'rgba(34,197,94,0.24)',
};

const DEFAULT_SLOT2: WhaleAlrSlotConfig = {
  display: 'both',
  anchor: 'barLow',
  maxLen: 1000,
  minLen: 10,
  step: 1,
  devMult: 2,
  upHex: '#00db04',
  downHex: '#db0000',
  bandsOuterHex: '#A855F7',
  bandsMidHex: '#A855F7',
  /** 하락 적색 밴드 면 */
  fillRgba: 'rgba(239,68,68,0.22)',
};

const DEFAULT_SLOT3: WhaleAlrSlotConfig = {
  display: 'channel',
  anchor: 'slopeZero',
  maxLen: 400,
  minLen: 10,
  step: 10,
  devMult: 2,
  upHex: '#00630a',
  downHex: '#630008',
  bandsOuterHex: '#22D3EE',
  bandsMidHex: '#22D3EE',
  fillRgba: 'rgba(34,211,238,0.12)',
};

function transformY(logScale: boolean, price: number): number {
  if (!Number.isFinite(price) || price <= 0) return NaN;
  return logScale ? Math.log10(price) : price;
}

function reverseY(logScale: boolean, y: number): number {
  return logScale ? 10 ** y : y;
}

function olsWindow(y: number[]): { slope: number; intercept: number; yHat: number[]; sigma: number } | null {
  const L = y.length;
  if (L < 2) return null;
  const xs = Array.from({ length: L }, (_, k) => k);
  const meanX = xs.reduce((a, b) => a + b, 0) / L;
  const meanY = y.reduce((a, b) => a + b, 0) / L;
  let cov = 0;
  let varX = 0;
  for (let k = 0; k < L; k++) {
    const dx = xs[k]! - meanX;
    cov += dx * (y[k]! - meanY);
    varX += dx * dx;
  }
  if (varX < 1e-18) return null;
  const slope = cov / varX;
  const intercept = meanY - slope * meanX;
  const yHat = xs.map((x) => intercept + slope * x);
  let sse = 0;
  for (let k = 0; k < L; k++) sse += (y[k]! - yHat[k]!) ** 2;
  const sigma = Math.sqrt(sse / Math.max(1, L));
  return { slope, intercept, yHat, sigma };
}

function pearsonR(y: number[], yHat: number[]): number {
  const L = y.length;
  if (L < 2) return NaN;
  const my = y.reduce((a, b) => a + b, 0) / L;
  const mh = yHat.reduce((a, b) => a + b, 0) / L;
  let num = 0;
  let dy = 0;
  let dh = 0;
  for (let k = 0; k < L; k++) {
    const a = y[k]! - my;
    const b = yHat[k]! - mh;
    num += a * b;
    dy += a * a;
    dh += b * b;
  }
  const den = Math.sqrt(dy * dh);
  return den < 1e-18 ? 0 : num / den;
}

function hasVolume(candles: Candle[]): boolean {
  return candles.some((c) => (Number(c.volume) || 0) > 0);
}

function anchorLengthBarExtreme(
  end: number,
  maxLen: number,
  minLen: number,
  step: number,
  mode: 'high' | 'low',
  valueAtBarIndex: (barIndex: number) => number
): number {
  const maxL = Math.min(Math.max(2, maxLen), end + 1);
  let minL = Math.max(2, Math.min(minLen, maxL));
  if (minL > maxL) minL = 2;
  let bestI = minL - 1;
  let bestV = mode === 'high' ? -Infinity : Infinity;
  for (let i = minL - 1; i < maxL; i += step) {
    const ix = end - i;
    if (ix < 0) continue;
    const v = valueAtBarIndex(ix);
    if (mode === 'high' ? v > bestV : v < bestV) {
      bestV = v;
      bestI = i;
    }
  }
  return Math.max(minL, Math.min(maxL, bestI + 1));
}

function anchorLengthSlopeZero(
  candles: Candle[],
  end: number,
  maxLen: number,
  minLen: number,
  step: number,
  logScale: boolean,
  getClose: (c: Candle) => number
): number {
  const maxL = Math.min(Math.max(2, maxLen), end + 1);
  let minL = Math.max(2, Math.min(minLen, maxL));
  if (minL > maxL) minL = 2;
  let bestL = minL;
  let bestAbs = Infinity;
  for (let L = minL; L <= maxL; L += step) {
    const start = end - L + 1;
    if (start < 0) continue;
    const ys: number[] = [];
    for (let i = start; i <= end; i++) ys.push(transformY(logScale, getClose(candles[i]!)));
    if (ys.some((v) => !Number.isFinite(v))) continue;
    const o = olsWindow(ys);
    if (!o) continue;
    const a = Math.abs(o.slope);
    if (a < bestAbs) {
      bestAbs = a;
      bestL = L;
    }
  }
  return bestL;
}

function anchorLengthRZero(
  candles: Candle[],
  end: number,
  maxLen: number,
  minLen: number,
  step: number,
  logScale: boolean,
  getClose: (c: Candle) => number
): number {
  const maxL = Math.min(Math.max(2, maxLen), end + 1);
  let minL = Math.max(2, Math.min(minLen, maxL));
  if (minL > maxL) minL = 2;
  let bestL = minL;
  let bestAbs = Infinity;
  for (let L = minL; L <= maxL; L += step) {
    const s = end - L + 1;
    if (s < 0) continue;
    const ys: number[] = [];
    for (let i = s; i <= end; i++) ys.push(transformY(logScale, getClose(candles[i]!)));
    if (ys.some((v) => !Number.isFinite(v))) continue;
    const o = olsWindow(ys);
    if (!o) continue;
    const r = pearsonR(ys, o.yHat);
    const a = Math.abs(r);
    if (a < bestAbs) {
      bestAbs = a;
      bestL = L;
    }
  }
  return bestL;
}

function computeAnchorLength(
  candles: Candle[],
  end: number,
  anchor: WhaleAlrAnchor,
  maxLen: number,
  minLen: number,
  step: number,
  logScale: boolean,
  rsiArr: number[],
  atrArr: number[]
): number {
  const maxL = Math.min(Math.max(2, maxLen), end + 1);
  const minLRaw = minLen > maxL ? 2 : minLen;
  const st = Math.max(1, step);

  switch (anchor) {
    case 'length':
      return maxL;
    case 'barHigh':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'high', (ix) => candles[ix]!.high);
    case 'barLow':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'low', (ix) => candles[ix]!.low);
    case 'volHigh':
      if (!hasVolume(candles)) return maxL;
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'high', (ix) => Number(candles[ix]!.volume) || 0);
    case 'volLow':
      if (!hasVolume(candles)) return maxL;
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'low', (ix) => Number(candles[ix]!.volume) || 0);
    case 'spreadHigh':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'high', (ix) => candles[ix]!.high - candles[ix]!.low);
    case 'spreadLow':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'low', (ix) => candles[ix]!.high - candles[ix]!.low);
    case 'rsiHigh':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'high', (ix) => rsiArr[ix] ?? 50);
    case 'rsiLow':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'low', (ix) => rsiArr[ix] ?? 50);
    case 'atrHigh':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'high', (ix) => atrArr[ix] ?? 0);
    case 'atrLow':
      return anchorLengthBarExtreme(end, maxL, minLRaw, st, 'low', (ix) => atrArr[ix] ?? 0);
    case 'slopeZero':
      return anchorLengthSlopeZero(candles, end, maxL, minLRaw, st, logScale, (c) => c.close);
    case 'rZero':
      return anchorLengthRZero(candles, end, maxL, minLRaw, st, logScale, (c) => c.close);
    default:
      return maxL;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = normalizeHex6(hex, '#888888').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildWhaleAnchoredLinRegChannelsOverlays(params: {
  candles: Candle[];
  logScale: boolean;
  slots: [WhaleAlrSlotConfig, WhaleAlrSlotConfig, WhaleAlrSlotConfig];
  /**
   * 회귀 중심선 기준 ±(비율×잔차밴드) 평행선 — TV 다중 채널·피보 확장 느낌.
   * 비어 있으면 생략.
   */
  fibParallelRatios?: readonly number[] | null;
}): OverlayItem[] {
  const { candles, logScale, slots, fibParallelRatios } = params;
  const n = candles.length;
  if (n < 3) return [];

  const end = n - 1;
  const rsiArr = rsi(candles, 14);
  const atrArr = atrSeries(candles, 14);
  const out: OverlayItem[] = [];

  slots.forEach((slot, si) => {
    if (slot.display === 'off') return;

    const L = computeAnchorLength(
      candles,
      end,
      slot.anchor,
      Math.min(5000, Math.max(2, slot.maxLen)),
      Math.max(2, slot.minLen),
      Math.max(1, slot.step),
      logScale,
      rsiArr,
      atrArr
    );
    if (L < 2) return;

    const start = end - L + 1;
    const ys: number[] = [];
    for (let i = start; i <= end; i++) ys.push(transformY(logScale, candles[i]!.close));
    if (ys.some((v) => !Number.isFinite(v))) return;

    const o = olsWindow(ys);
    if (!o) return;

    const mult = Math.max(0.1, slot.devMult);
    const w = o.sigma * mult;
    const yLeftHat = o.intercept;
    const yRightHat = o.intercept + o.slope * (L - 1);
    const topL = yLeftHat + w;
    const topR = yRightHat + w;
    const botL = yLeftHat - w;
    const botR = yRightHat - w;
    const midL = yLeftHat;
    const midR = yRightHat;

    const pTopL = reverseY(logScale, topL);
    const pTopR = reverseY(logScale, topR);
    const pBotL = reverseY(logScale, botL);
    const pBotR = reverseY(logScale, botR);
    const pMidL = reverseY(logScale, midL);
    const pMidR = reverseY(logScale, midR);

    const t1 = candles[start]!.time as number;
    const t2 = candles[end]!.time as number;
    const upCol = normalizeHex6(slot.upHex, DEFAULT_SLOT1.upHex);
    const dnCol = normalizeHex6(slot.downHex, DEFAULT_SLOT1.downHex);
    const bandHex = normalizeHex6(slot.bandsOuterHex, DEFAULT_SLOT1.bandsOuterHex);
    const midHex = normalizeHex6(slot.bandsMidHex, DEFAULT_SLOT1.bandsMidHex);
    const slopeUp = o.slope >= 0;

    const showChannel = slot.display === 'channel' || slot.display === 'both';
    const showBands = slot.display === 'bands' || slot.display === 'both';

    if (showChannel || showBands) {
      out.push({
        id: `whale-alr-${si}-fill`,
        kind: 'channelBand',
        label: `ALR#${si + 1}`,
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        confidence: 60,
        color: slot.fillRgba,
        channelBand: {
          time1: t1,
          time2: t2,
          priceHigh1: pTopL,
          priceHigh2: pTopR,
          priceLow1: pBotL,
          priceLow2: pBotR,
        },
        time1: t1,
        time2: t2,
        price1: pTopL,
        price2: pTopR,
      });
    }

    if (showBands && !showChannel) {
      out.push({
        id: `whale-alr-${si}-mid-band`,
        kind: 'trendLine',
        label: `ALR#${si + 1} 중심`,
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t1,
        time2: t2,
        price1: pMidL,
        price2: pMidR,
        confidence: 62,
        color: hexToRgba(midHex, 0.75),
        lineLabelColor: midHex,
        lineStrokeWidth: 1,
        noProject: true,
      });
      out.push({
        id: `whale-alr-${si}-band-top`,
        kind: 'trendLine',
        label: '',
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t1,
        time2: t2,
        price1: pTopL,
        price2: pTopR,
        confidence: 55,
        color: hexToRgba(bandHex, 0.85),
        lineLabelColor: bandHex,
        lineDash: '4 3',
        lineStrokeWidth: 1,
        noProject: true,
      });
      out.push({
        id: `whale-alr-${si}-band-bot`,
        kind: 'trendLine',
        label: '',
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t1,
        time2: t2,
        price1: pBotL,
        price2: pBotR,
        confidence: 55,
        color: hexToRgba(bandHex, 0.85),
        lineLabelColor: bandHex,
        lineDash: '4 3',
        lineStrokeWidth: 1,
        noProject: true,
      });
    }

    if (showChannel) {
      const strokeUp = hexToRgba(upCol, 0.9);
      const strokeDn = hexToRgba(dnCol, 0.9);
      const edgeCol = slopeUp ? strokeUp : strokeDn;
      out.push({
        id: `whale-alr-${si}-ch-mid`,
        kind: 'trendLine',
        label: `ALR#${si + 1} 회귀`,
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t1,
        time2: t2,
        price1: pMidL,
        price2: pMidR,
        confidence: 64,
        color: hexToRgba(slopeUp ? upCol : dnCol, 0.95),
        lineLabelColor: slopeUp ? upCol : dnCol,
        lineStrokeWidth: 2,
        noProject: true,
      });
      const both = showBands && showChannel;
      if (!both) {
        out.push({
          id: `whale-alr-${si}-ch-top`,
          kind: 'trendLine',
          label: '',
          category: 'whaleToolkit',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: t1,
          time2: t2,
          price1: pTopL,
          price2: pTopR,
          confidence: 56,
          color: edgeCol,
          lineLabelColor: slopeUp ? upCol : dnCol,
          lineDash: '5 4',
          lineStrokeWidth: 1,
          noProject: true,
        });
        out.push({
          id: `whale-alr-${si}-ch-bot`,
          kind: 'trendLine',
          label: '',
          category: 'whaleToolkit',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: t1,
          time2: t2,
          price1: pBotL,
          price2: pBotR,
          confidence: 56,
          color: edgeCol,
          lineLabelColor: slopeUp ? upCol : dnCol,
          lineDash: '5 4',
          lineStrokeWidth: 1,
          noProject: true,
        });
      } else {
        out.push({
          id: `whale-alr-${si}-band-top`,
          kind: 'trendLine',
          label: '',
          category: 'whaleToolkit',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: t1,
          time2: t2,
          price1: pTopL,
          price2: pTopR,
          confidence: 55,
          color: hexToRgba(bandHex, 0.85),
          lineLabelColor: bandHex,
          lineDash: '4 3',
          lineStrokeWidth: 1,
          noProject: true,
        });
        out.push({
          id: `whale-alr-${si}-band-bot`,
          kind: 'trendLine',
          label: '',
          category: 'whaleToolkit',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: t1,
          time2: t2,
          price1: pBotL,
          price2: pBotR,
          confidence: 55,
          color: hexToRgba(bandHex, 0.85),
          lineLabelColor: bandHex,
          lineDash: '4 3',
          lineStrokeWidth: 1,
          noProject: true,
        });
      }
    }

    const fibs = fibParallelRatios?.length
      ? [...fibParallelRatios].filter((r) => Number.isFinite(r) && r > 0 && r <= 2.6)
      : [];
    const fibLabelHex = normalizeHex6(bandHex, DEFAULT_SLOT1.bandsOuterHex);
    for (const fr of fibs) {
      const yLu = yLeftHat + fr * w;
      const yRu = yRightHat + fr * w;
      const yLd = yLeftHat - fr * w;
      const yRd = yRightHat - fr * w;
      const pLu = reverseY(logScale, yLu);
      const pRu = reverseY(logScale, yRu);
      const pLd = reverseY(logScale, yLd);
      const pRd = reverseY(logScale, yRd);
      const frTag = String(fr).replace(/\./g, '_');
      out.push({
        id: `whale-alr-${si}-fib-up-${frTag}`,
        kind: 'trendLine',
        label: String(fr),
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t1,
        time2: t2,
        price1: pLu,
        price2: pRu,
        confidence: 48,
        color: hexToRgba(fibLabelHex, 0.72),
        lineLabelColor: fibLabelHex,
        lineDash: '3 4',
        lineStrokeWidth: 1,
        noProject: true,
      });
      out.push({
        id: `whale-alr-${si}-fib-dn-${frTag}`,
        kind: 'trendLine',
        label: String(fr),
        category: 'whaleToolkit',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t1,
        time2: t2,
        price1: pLd,
        price2: pRd,
        confidence: 48,
        color: hexToRgba(fibLabelHex, 0.72),
        lineLabelColor: fibLabelHex,
        lineDash: '3 4',
        lineStrokeWidth: 1,
        noProject: true,
      });
    }
  });

  return out;
}

export function defaultWhaleAlrSlots(): [WhaleAlrSlotConfig, WhaleAlrSlotConfig, WhaleAlrSlotConfig] {
  return [
    { ...DEFAULT_SLOT1 },
    { ...DEFAULT_SLOT2 },
    { ...DEFAULT_SLOT3 },
  ];
}
