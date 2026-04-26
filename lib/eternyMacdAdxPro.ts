/**
 * @ETERNYWORLD Macd + Adx PRO — Pine v6 indicator 포팅 (앱 전용).
 * ta.macd / ta.dmi 와 동일한 색·조건 로직 (EMA/RMA 구현 일치에 한함).
 */

import type { Candle } from '@/types';
import { macd as macdCalc } from '@/lib/indicators';

export type EternyMacdAdxHistogramMode = 'sensitive' | 'filtered';

export type EternyMacdAdxInputs = {
  fastLen: number;
  slowLen: number;
  signalLen: number;
  adxLen: number;
  adxSmoothing: number;
  adxThreshold: number;
  mode: EternyMacdAdxHistogramMode;
};

export type EternyMacdAdxBar = {
  macd: number;
  signal: number;
  hist: number;
  histColor: string;
  macdLineColor: string;
  signalLineColor: string;
  diPlus: number;
  diMinus: number;
  adx: number;
};

/** Pine ta.rma — 첫 값은 첫 `len`구간 SMA 이후 Wilder */
function pineRma(values: number[], len: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (len < 1 || values.length === 0) return out;
  for (let i = len - 1; i < values.length; i++) {
    if (i === len - 1) {
      let s = 0;
      for (let j = 0; j < len; j++) s += values[j];
      out[i] = s / len;
    } else {
      const prev = out[i - 1];
      if (prev !== prev) continue;
      out[i] = (prev * (len - 1) + values[i]) / len;
    }
  }
  return out;
}

/**
 * Pine ta.dmi(diLength, adxSmoothing) → [diplus, diminus, adx]
 */
export function dmi(candles: Candle[], diLength: number, adxSmoothing: number): {
  diPlus: number[];
  diMinus: number[];
  adx: number[];
} {
  const n = candles.length;
  const diPlus: number[] = new Array(n).fill(NaN);
  const diMinus: number[] = new Array(n).fill(NaN);
  const adx: number[] = new Array(n).fill(NaN);
  if (n < 2 || diLength < 1 || adxSmoothing < 1) {
    return { diPlus, diMinus, adx };
  }

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const ph = candles[i - 1].high;
    const pl = candles[i - 1].low;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - ph;
    const down = pl - l;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }

  const smTr = pineRma(tr, diLength);
  const smPlus = pineRma(plusDM, diLength);
  const smMinus = pineRma(minusDM, diLength);

  const dx: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const str = smTr[i];
    const sp = smPlus[i];
    const sm = smMinus[i];
    if (str !== str || sp !== sp || sm !== sm || str === 0) continue;
    const pdi = (100 * sp) / str;
    const mdi = (100 * sm) / str;
    diPlus[i] = pdi;
    diMinus[i] = mdi;
    const sum = pdi + mdi;
    dx[i] = sum > 0 ? (100 * Math.abs(pdi - mdi)) / sum : 0;
  }

  const adxR = pineRma(dx, adxSmoothing);
  for (let i = 0; i < n; i++) {
    if (adxR[i] === adxR[i]) adx[i] = adxR[i];
  }

  return { diPlus, diMinus, adx };
}

const COLOR_LIME_DARK = '#026D42';
const COLOR_LIME_LIGHT = '#A0F3CB';
const COLOR_LIME_MID = '#A0F3CB';
const COLOR_RED_DARK = '#FF0000';
const COLOR_RED_LIGHT = '#F3C2C2';
/** #f6f6f8a6 */
const COLOR_GRAY_DARK = 'rgba(246,246,248,0.65)';
/** color.new(#F6F6F8, 60) */
const COLOR_GRAY_LIGHT = 'rgba(246,246,248,0.4)';

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Pine plot 스타일: 시그널은 color.new(기본색, 30) → 70% 불투명
 */
export function eternyMacdAdxSignalStroke(macdLineHex: string): string {
  return hexWithAlpha(macdLineHex, 0.7);
}

export function computeEternyMacdAdxSeries(candles: Candle[], inputs: EternyMacdAdxInputs): EternyMacdAdxBar[] {
  const n = candles.length;
  const out: EternyMacdAdxBar[] = [];
  if (n === 0) return out;

  const { macd: macdLine, signal: signalLine, hist } = macdCalc(
    candles,
    inputs.fastLen,
    inputs.slowLen,
    inputs.signalLen
  );
  const { diPlus, diMinus, adx } = dmi(candles, inputs.adxLen, inputs.adxSmoothing);

  const thr = inputs.adxThreshold;

  for (let i = 0; i < n; i++) {
    const m = macdLine[i] ?? 0;
    const s = signalLine[i] ?? 0;
    const h = hist[i] ?? 0;
    const hp = i > 0 ? hist[i - 1] ?? 0 : h;

    const adxI = adx[i];
    const adxP = i > 0 ? adx[i - 1] ?? NaN : NaN;
    const dip = diPlus[i];
    const dim = diMinus[i];
    const dipP = i > 0 ? diPlus[i - 1] ?? NaN : NaN;

    const strongTrend = adxI === adxI && adxI >= thr;
    const bullishDirection = dip === dip && dim === dim && dip > dim;
    const adxWeakening = adxI === adxI && adxP === adxP && adxI < adxP;
    const diplusRising = dip === dip && dipP === dipP && dip > dipP;

    let histColor: string;
    if (inputs.mode === 'sensitive') {
      if (h >= 0) {
        histColor = i > 0 && h > hp ? COLOR_LIME_DARK : COLOR_LIME_LIGHT;
      } else {
        histColor = i > 0 && h < hp ? COLOR_RED_DARK : COLOR_RED_LIGHT;
      }
    } else {
      if (strongTrend) {
        if (bullishDirection) {
          histColor = adxWeakening ? (diplusRising ? COLOR_LIME_MID : COLOR_LIME_LIGHT) : COLOR_LIME_DARK;
        } else {
          histColor = adxWeakening ? COLOR_RED_LIGHT : COLOR_RED_DARK;
        }
      } else {
        histColor = adxWeakening ? COLOR_GRAY_LIGHT : COLOR_GRAY_DARK;
      }
    }

    /** Pine plot(MACD/Signal) — Sensitive: hist 부호, Filtered: DI 방향 */
    let macdLineColor: string;
    let signalLineColor: string;
    if (inputs.mode === 'sensitive') {
      macdLineColor = h > 0 ? COLOR_LIME_DARK : COLOR_RED_DARK;
      signalLineColor = h > 0 ? hexWithAlpha(COLOR_LIME_DARK, 0.7) : hexWithAlpha(COLOR_RED_DARK, 0.7);
    } else {
      macdLineColor = bullishDirection ? COLOR_LIME_DARK : COLOR_RED_DARK;
      signalLineColor = bullishDirection ? hexWithAlpha(COLOR_LIME_DARK, 0.7) : hexWithAlpha(COLOR_RED_DARK, 0.7);
    }

    out.push({
      macd: m,
      signal: s,
      hist: h,
      histColor,
      macdLineColor,
      signalLineColor,
      diPlus: dip === dip ? dip : 0,
      diMinus: dim === dim ? dim : 0,
      adx: adxI === adxI ? adxI : 0,
    });
  }

  return out;
}

/**
 * Pine alertcondition — 히스토그램이 0을 뚫는 봉 `i`에서만 평가 (hist = 현재봉, hist[1] = 전봉).
 * Strong Buy: hist > 0 and hist[1] <= 0 and (mode == Sensitive or bullish_direction)
 * Strong Sell: hist < 0 and hist[1] >= 0 and (mode == Sensitive or bearish_direction)
 */
export function evaluateEternyMacdAdxAlertAtBar(
  bars: EternyMacdAdxBar[],
  i: number,
  mode: EternyMacdAdxHistogramMode
): 'strongBuy' | 'strongSell' | null {
  if (i < 1 || i >= bars.length) return null;
  const h = bars[i].hist;
  const hp = bars[i - 1].hist;
  const bullish = bars[i].diPlus > bars[i].diMinus;
  const bearish = bars[i].diMinus > bars[i].diPlus;
  if (h > 0 && hp <= 0 && (mode === 'sensitive' || bullish)) return 'strongBuy';
  if (h < 0 && hp >= 0 && (mode === 'sensitive' || bearish)) return 'strongSell';
  return null;
}

/** 마지막으로 완전히 닫힌 봉 인덱스(마지막 캔들이 형성 중일 때 length-2) */
export function eternyMacdAdxLastClosedBarIndex(candleCount: number): number {
  if (candleCount < 2) return -1;
  return candleCount - 2;
}
