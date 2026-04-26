/**
 * Hash Auto Fibonacci — Pine 스크립트(© Hash Capital Research, MPL-2.0) 로직을
 * 앱 캔들 배열로 재현. 교육·참고용.
 */
import type { Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

export type HashFibScheme = 'Neon' | 'Clean' | 'Mono';
export type HashFibMode = 'Auto' | 'Bullish' | 'Bearish';

export type HashAutoFibOptions = {
  autoLookback?: boolean;
  manualLookback?: number;
  dynamicMult?: number;
  mode?: HashFibMode;
  showRetracement?: boolean;
  showExtension?: boolean;
  showGoldenPocket?: boolean;
  showAtrSl?: boolean;
  showSwingMarkers?: boolean;
  showMtf?: boolean;
  /** 상위 TF 캔들 — 있으면 피벗 정렬(0.5%) MTF 확인 */
  htfCandles?: Candle[] | null;
  scheme?: HashFibScheme;
  lineWidth?: number;
  gpAlphaPct?: number;
};

export type HashAutoFibState = {
  effectiveLb: number;
  bullish: boolean;
  swingHighPrice: number | null;
  swingLowPrice: number | null;
  swingHighBar: number | null;
  swingLowBar: number | null;
  fibHigh: number | null;
  fibLow: number | null;
  fibRange: number | null;
  fibHighBar: number | null;
  fibLowBar: number | null;
  atr10: number | null;
  atr50: number | null;
  mtfConfirmed: boolean;
  slPrice: number | null;
  goldenPocketTop: number | null;
  goldenPocketBot: number | null;
};

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

/** Wilder RMA ATR, 인덱스 end까지 시리즈 후 end 값 */
function wilderAtrAt(candles: Candle[], period: number, endIdx: number): number | null {
  const n = endIdx + 1;
  if (n < period + 1) return null;
  const tr: number[] = [];
  for (let i = 0; i < n; i++) {
    const prevC = i > 0 ? candles[i - 1].close : candles[i].open;
    tr.push(trueRange(candles[i], prevC));
  }
  const p = Math.max(1, period);
  let atr = 0;
  for (let i = 0; i < p; i++) atr += tr[i];
  atr /= p;
  for (let i = p; i < n; i++) {
    atr = (atr * (p - 1) + tr[i]) / p;
  }
  return atr;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isPivotHigh(candles: Candle[], i: number, L: number): boolean {
  if (i < L || i >= candles.length - L) return false;
  const h = candles[i].high;
  for (let j = i - L; j <= i + L; j++) {
    if (j === i) continue;
    if (candles[j].high >= h) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], i: number, L: number): boolean {
  if (i < L || i >= candles.length - L) return false;
  const low = candles[i].low;
  for (let j = i - L; j <= i + L; j++) {
    if (j === i) continue;
    if (candles[j].low <= low) return false;
  }
  return true;
}

function findLatestPivotHigh(candles: Candle[], L: number): { price: number; index: number } | null {
  const n = candles.length;
  for (let i = n - 1 - L; i >= L; i--) {
    if (isPivotHigh(candles, i, L)) return { price: candles[i].high, index: i };
  }
  return null;
}

function findLatestPivotLow(candles: Candle[], L: number): { price: number; index: number } | null {
  const n = candles.length;
  for (let i = n - 1 - L; i >= L; i--) {
    if (isPivotLow(candles, i, L)) return { price: candles[i].low, index: i };
  }
  return null;
}

function findLatestHtfPivotHigh(candles: Candle[], L: number): number | null {
  const n = candles.length;
  for (let i = n - 1 - L; i >= L; i--) {
    if (isPivotHigh(candles, i, L)) return candles[i].high;
  }
  return null;
}

function findLatestHtfPivotLow(candles: Candle[], L: number): number | null {
  const n = candles.length;
  for (let i = n - 1 - L; i >= L; i--) {
    if (isPivotLow(candles, i, L)) return candles[i].low;
  }
  return null;
}

function schemeRgba(scheme: HashFibScheme, idx: number, gpAlpha: number): string {
  const a = (pct: number) => pct / 100;
  if (scheme === 'Neon') {
    const map: Record<number, string> = {
      0: 'rgba(136,135,128,0.7)',
      1: 'rgba(55,138,221,0.85)',
      2: 'rgba(29,158,117,0.85)',
      3: 'rgba(180,178,169,0.9)',
      4: 'rgba(239,159,39,0.9)',
      5: 'rgba(212,83,126,0.9)',
      6: 'rgba(136,135,128,0.7)',
      10: `rgba(239,159,39,${clamp(gpAlpha, 5, 60) / 100})`,
      11: 'rgba(226,75,74,0.85)',
    };
    return map[idx] ?? 'rgba(136,135,128,0.75)';
  }
  if (scheme === 'Clean') {
    const map: Record<number, string> = {
      1: 'rgba(24,95,165,0.85)',
      2: 'rgba(15,110,86,0.85)',
      3: 'rgba(136,135,128,0.9)',
      4: 'rgba(186,117,23,0.9)',
      5: 'rgba(153,53,86,0.9)',
      10: `rgba(186,117,23,${clamp(gpAlpha, 5, 60) / 100})`,
      11: 'rgba(163,45,45,0.85)',
    };
    return map[idx] ?? 'rgba(95,94,90,0.75)';
  }
  const map: Record<number, string> = {
    3: 'rgba(136,136,128,0.9)',
    4: 'rgba(68,68,65,0.9)',
    10: `rgba(68,68,65,${clamp(gpAlpha, 5, 60) / 100})`,
  };
  return map[idx] ?? 'rgba(136,136,128,0.65)';
}

function levelColorIdx(ratio: number): number {
  if (ratio === 0) return 0;
  if (ratio === 0.236) return 1;
  if (ratio === 0.382) return 2;
  if (ratio === 0.5) return 3;
  if (ratio === 0.618 || ratio === 0.65) return 4;
  if (ratio === 0.786) return 5;
  if (ratio === 1.0) return 6;
  if (ratio === 1.272) return 7;
  if (ratio === 1.618) return 8;
  return 9;
}

export function computeHashAutoFibState(candles: Candle[], opts?: HashAutoFibOptions): HashAutoFibState | null {
  const n = candles.length;
  if (n < 60) return null;

  const autoLb = opts?.autoLookback !== false;
  const manualLb = Math.max(2, Math.min(50, opts?.manualLookback ?? 10));
  const dynMult = Math.max(4, Math.min(14, opts?.dynamicMult ?? 9));
  const mode: HashFibMode = opts?.mode ?? 'Auto';

  const lastIdx = n - 1;
  const atr10 = wilderAtrAt(candles, 10, lastIdx);
  const atr50 = wilderAtrAt(candles, 50, lastIdx);
  const atrRatio = atr10 != null && atr10 > 0 && atr50 != null ? atr50 / atr10 : 1;
  const dynLb = Math.round(clamp(atrRatio * dynMult, 3, 30));
  const effectiveLb = autoLb ? dynLb : manualLb;

  const ph = findLatestPivotHigh(candles, effectiveLb);
  const pl = findLatestPivotLow(candles, effectiveLb);
  if (!ph || !pl) return null;

  let bullish: boolean;
  if (mode === 'Bullish') bullish = true;
  else if (mode === 'Bearish') bullish = false;
  else bullish = pl.index > ph.index;

  const fibHigh = bullish ? ph.price : pl.price;
  const fibLow = bullish ? pl.price : ph.price;
  const fibHighBar = bullish ? ph.index : pl.index;
  const fibLowBar = bullish ? pl.index : ph.index;
  const fibRange = Math.abs(fibHigh - fibLow);
  if (!(fibRange > 0)) return null;

  let mtfConfirmed = false;
  if (opts?.showMtf && opts?.htfCandles && opts.htfCandles.length >= 40) {
    const htf = opts.htfCandles;
    const hH = findLatestHtfPivotHigh(htf, 10);
    const hL = findLatestHtfPivotLow(htf, 10);
    if (hH != null && Math.abs(ph.price - hH) / ph.price < 0.005) mtfConfirmed = true;
    if (hL != null && Math.abs(pl.price - hL) / pl.price < 0.005) mtfConfirmed = true;
  }

  const fibPrice = (r: number) => fibHigh - r * (fibHigh - fibLow);
  const gp618 = fibPrice(0.618);
  const gp65 = fibPrice(0.65);
  const gpRawTop = Math.max(gp618, gp65);
  const gpRawBot = Math.min(gp618, gp65);
  const gpMinH = atr10 != null ? atr10 * 0.15 : 0;
  const gpHRaw = gpRawTop - gpRawBot;
  const gpMid = (gpRawTop + gpRawBot) / 2;
  const gpTop = gpHRaw < gpMinH ? gpMid + gpMinH / 2 : gpRawTop;
  const gpBot = gpHRaw < gpMinH ? gpMid - gpMinH / 2 : gpRawBot;

  const slPrice =
    atr10 != null ? (bullish ? fibLow - 2 * atr10 : fibHigh + 2 * atr10) : null;

  return {
    effectiveLb,
    bullish,
    swingHighPrice: ph.price,
    swingLowPrice: pl.price,
    swingHighBar: ph.index,
    swingLowBar: pl.index,
    fibHigh,
    fibLow,
    fibRange,
    fibHighBar,
    fibLowBar,
    atr10,
    atr50,
    mtfConfirmed,
    slPrice,
    goldenPocketTop: gpTop,
    goldenPocketBot: gpBot,
  };
}

function fibPriceFromState(fibHigh: number, fibLow: number, ratio: number): number {
  return fibHigh - ratio * (fibHigh - fibLow);
}

/**
 * 차트 오버레이: 피보 되돌림/확장선, 골든포켓 존, ATR SL, 스윙 점.
 */
export function buildHashAutoFibonacciOverlays(
  candles: Candle[],
  timeframe: string,
  opts?: HashAutoFibOptions
): OverlayItem[] {
  const st = computeHashAutoFibState(candles, opts);
  if (!st || st.fibHigh == null || st.fibLow == null) return [];

  const showRet = opts?.showRetracement !== false;
  const showExt = opts?.showExtension === true;
  const showGP = opts?.showGoldenPocket !== false;
  const showSL = opts?.showAtrSl !== false;
  const showSwing = opts?.showSwingMarkers !== false;
  const scheme = opts?.scheme ?? 'Neon';
  const lw = Math.max(1, Math.min(3, opts?.lineWidth ?? 1));
  const gpAlpha = opts?.gpAlphaPct ?? 18;

  const last = candles[candles.length - 1];
  const tLast = Number(last.time);
  const barSec = candleBarDurationSec(timeframe, tLast);
  const tStart = Math.min(
    Number(candles[st.fibHighBar!].time),
    Number(candles[st.fibLowBar!].time)
  );
  const tEnd = tLast + 15 * barSec;

  const { fibHigh, fibLow, bullish, mtfConfirmed } = st;
  const w = mtfConfirmed ? Math.min(lw + 1, 3) : lw;
  const out: OverlayItem[] = [];

  const pushFibLine = (ratio: number, dashed: boolean, idSuffix: string) => {
    const p = fibPriceFromState(fibHigh, fibLow, ratio);
    const cidx = levelColorIdx(ratio);
    const col = schemeRgba(scheme, cidx, gpAlpha);
    out.push({
      id: `candle-analysis-hash-fib-${idSuffix}`,
      kind: 'fibLine',
      label: `${ratio}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: p,
      price2: p,
      confidence: 72,
      color: col,
      lineLabelColor: col,
      lineDash: dashed ? '4 4' : undefined,
      lineStrokeWidth: w,
      category: 'fib',
      noProject: true,
      labelTooltip: `Hash Fib ${ratio} (참고)`,
    });
  };

  if (showRet) {
    const retRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 1.0];
    for (const r of retRatios) {
      const isKey = r === 0 || r === 1;
      pushFibLine(r, !isKey, `ret-${String(r).replace('.', '-')}`);
    }
  }

  if (showExt) {
    for (const r of [1.272, 1.618, 2.618]) {
      pushFibLine(r, true, `ext-${String(r).replace('.', '-')}`);
    }
  }

  if (showGP && showRet && st.goldenPocketTop != null && st.goldenPocketBot != null) {
    /** 차트 softenZoneFill(캔들분석 ~0.38) 후에도 보이도록 기본 알파를 Pine에 맞춰 다소 높임 */
    const gpColor = scheme === 'Neon' ? 'rgba(239,159,39,0.52)' : scheme === 'Clean' ? 'rgba(186,117,23,0.48)' : 'rgba(68,68,65,0.45)';
    out.push({
      id: 'candle-analysis-hash-fib-gp',
      kind: 'zone',
      label: mtfConfirmed ? '◈ Golden pocket · MTF' : '◈ Golden pocket',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tStart,
      time2: tEnd,
      price1: st.goldenPocketTop,
      price2: st.goldenPocketBot,
      confidence: 70,
      color: gpColor,
      lineLabelColor: '#fbbf24',
      category: 'fib',
      labelTooltip: '0.618–0.65 (Hash Auto Fib)',
    });
  }

  if (showSL && st.slPrice != null && st.atr10 != null) {
    const slp = st.slPrice;
    out.push({
      id: 'candle-analysis-hash-fib-sl',
      kind: 'fibLine',
      label: `SL ${slp.toFixed(2)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: slp,
      price2: slp,
      confidence: 68,
      color: 'rgba(255,46,99,0.55)',
      lineLabelColor: '#fb7185',
      lineDash: '3 5',
      lineStrokeWidth: 1,
      category: 'fib',
      noProject: true,
      labelTooltip: 'ATR×2 기준 참고 손절 (Pine 동일)',
    });
  }

  if (showSwing && st.swingHighBar != null && st.swingLowBar != null) {
    const sh = candles[st.swingHighBar];
    const sl = candles[st.swingLowBar];
    out.push({
      id: 'candle-analysis-hash-fib-swing-h',
      kind: 'label',
      label: '●',
      x1: 0,
      y1: 0,
      time1: Number(sh.time),
      price1: sh.high * 1.0004,
      confidence: 60,
      color: '#fb7185',
      category: 'fib',
      labelTextColor: '#fb7185',
      labelBackgroundColor: 'rgba(0,0,0,0.01)',
    });
    out.push({
      id: 'candle-analysis-hash-fib-swing-l',
      kind: 'label',
      label: '●',
      x1: 0,
      y1: 0,
      time1: Number(sl.time),
      price1: sl.low * 0.9996,
      confidence: 60,
      color: '#4ade80',
      category: 'fib',
      labelTextColor: '#4ade80',
      labelBackgroundColor: 'rgba(0,0,0,0.01)',
    });
  }

  if (mtfConfirmed) {
    out.push({
      id: 'candle-analysis-hash-fib-mtf',
      kind: 'label',
      label: '◆ MTF',
      x1: 0,
      y1: 0,
      time1: tEnd,
      price1: fibHigh,
      confidence: 62,
      color: '#a78bfa',
      category: 'fib',
      labelTextColor: '#c4b5fd',
      labelBackgroundColor: 'rgba(15,23,42,0.75)',
    });
  }

  return out;
}

/** 해설 패널용 요약 줄 */
export function buildHashAutoFibonacciCommentaryLines(
  candles: Candle[],
  opts?: HashAutoFibOptions
): string[] {
  const st = computeHashAutoFibState(candles, opts);
  if (!st || st.fibHigh == null || st.fibLow == null) return [];
  const { fibHigh, fibLow, bullish, effectiveLb, mtfConfirmed, slPrice, atr10 } = st;
  const fp = (r: number) => fibPriceFromState(fibHigh, fibLow, r);
  const lines: string[] = [
    '— Hash Auto Fibonacci (MPL-2.0 · Hash Capital Research 스타일) —',
    `${bullish ? '● Bullish' : '● Bearish'} · lookback ${effectiveLb} bars${opts?.autoLookback !== false ? ' (auto)' : ''}`,
    `Swing high ${st.swingHighPrice?.toFixed(4)} · Swing low ${st.swingLowPrice?.toFixed(4)}`,
    `0.5 → ${fp(0.5).toFixed(4)} · 0.618 → ${fp(0.618).toFixed(4)}`,
    `Golden pocket ${fp(0.618).toFixed(4)} – ${fp(0.65).toFixed(4)}`,
  ];
  if (slPrice != null && atr10 != null) lines.push(`ATR SL (2×ATR10) → ${slPrice.toFixed(4)}`);
  if (mtfConfirmed) lines.push('MTF 피벗 정렬(0.5% 이내) 활성');
  lines.push('(참고용·비조언)');
  return lines;
}
