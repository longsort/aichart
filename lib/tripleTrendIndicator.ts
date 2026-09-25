/**
 * Triple Trend Indicator [BigBeluga] — Pine v6 포팅 (조건부 참고).
 * MA + ATR 밴드 · 추세 전환 · 1/2/3 시그널.
 */
import type { Candle } from '@/types';

export type TripleTrendMaType = 'sma' | 'ema' | 'wma';
export type TripleTrendSignalBand = 1 | 2 | 3;
export type TripleTrendSignalBandOption = TripleTrendSignalBand | 'all';

export type TripleTrendOptions = {
  len?: number;
  bandsDist?: number;
  maType?: TripleTrendMaType;
  atrLen?: number;
  signalBand?: TripleTrendSignalBandOption;
};

export type TripleTrendBar = {
  band1: number;
  band2: number;
  band3: number;
  trend: boolean;
  trendChange: boolean;
  atr: number;
  ma: number;
};

export type TripleTrendSignal = {
  index: number;
  time: number;
  price: number;
  text: string;
  dir: 'long' | 'short';
};

function sma(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]!;
    if (i >= period) sum -= arr[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  const k = 2 / (period + 1);
  for (let i = 0; i < arr.length; i++) {
    out[i] = i === 0 ? arr[i]! : out[i - 1]! * (1 - k) + arr[i]! * k;
  }
  return out;
}

function wma(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += arr[i - j]! * (period - j);
    out[i] = sum / denom;
  }
  return out;
}

function maSeries(src: number[], period: number, type: TripleTrendMaType): number[] {
  if (type === 'ema') return ema(src, period);
  if (type === 'wma') return wma(src, period);
  return sma(src, period);
}

function atrSeries(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const out = new Array(n).fill(0);
  if (!n) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? candles[i - 1] : undefined;
    const tr = prev
      ? Math.max(
          candles[i]!.high - candles[i]!.low,
          Math.abs(candles[i]!.high - prev.close),
          Math.abs(candles[i]!.low - prev.close)
        )
      : candles[i]!.high - candles[i]!.low;
    if (i < period) {
      sum += tr;
      out[i] = sum / (i + 1);
    } else {
      out[i] = (out[i - 1]! * (period - 1) + tr) / period;
    }
  }
  return out;
}

function crossover(prevA: number, a: number, prevB: number, b: number): boolean {
  return prevA <= prevB && a > b;
}

function crossunder(prevA: number, a: number, prevB: number, b: number): boolean {
  return prevA >= prevB && a < b;
}

/** BigBeluga Triple Trend — bar별 band·추세·시그널 */
export function computeTripleTrendIndicator(
  candles: Candle[],
  srcOverride?: (number | null)[],
  opts: TripleTrendOptions = {}
): { bars: TripleTrendBar[]; signals: TripleTrendSignal[] } {
  const n = candles.length;
  const empty = { bars: [] as TripleTrendBar[], signals: [] as TripleTrendSignal[] };
  if (n < 30) return empty;

  const len = Math.max(20, opts.len ?? 70);
  const bandsDist = Math.max(2, opts.bandsDist ?? 3);
  const atrLen = Math.max(14, opts.atrLen ?? 200);
  const maType = opts.maType ?? 'sma';
  const signalBand = opts.signalBand ?? 3;

  const close = candles.map((c) => c.close);
  const baseMa = maSeries(close, len, maType);
  const src = baseMa.map((v, i) => {
    const ov = srcOverride?.[i];
    if (ov != null && Number.isFinite(ov)) return ov * 0.55 + v * 0.45;
    return v;
  });

  const atrArr = atrSeries(candles, atrLen);
  const bars: TripleTrendBar[] = [];
  const signals: TripleTrendSignal[] = [];
  let trend = false;
  const bandCounters: Record<1 | 2 | 3, { count1: number; count2: number }> = {
    1: { count1: 0, count2: 0 },
    2: { count1: 0, count2: 0 },
    3: { count1: 0, count2: 0 },
  };
  const activeBands: TripleTrendSignalBand[] =
    signalBand === 'all' ? [1, 2, 3] : [signalBand === 1 ? 1 : signalBand === 2 ? 2 : 3];

  for (let i = 0; i < n; i++) {
    const s = src[i];
    const atr = atrArr[i] || 0;
    if (!Number.isFinite(s) || !(atr > 0)) {
      bars.push({ band1: NaN, band2: NaN, band3: NaN, trend, trendChange: false, atr, ma: s });
      continue;
    }

    const upper = s + atr * bandsDist;
    const lower = s - atr * bandsDist;
    const prevClose = i > 0 ? close[i - 1]! : close[i]!;
    const prevUpper = i > 0 ? src[i - 1]! + (atrArr[i - 1] || atr) * bandsDist : upper;
    const prevLower = i > 0 ? src[i - 1]! - (atrArr[i - 1] || atr) * bandsDist : lower;

    if (crossover(prevClose, close[i]!, prevUpper, upper)) trend = true;
    if (crossunder(prevClose, close[i]!, prevLower, lower)) trend = false;

    const prevTrend = i > 0 ? bars[i - 1]!.trend : trend;
    const trendChange = i > 0 && trend !== prevTrend;

    let band1: number;
    let band2: number;
    let band3: number;
    if (trend) {
      band1 = lower;
      band2 = lower + atr * 1.5;
      band3 = lower + atr * 3;
    } else {
      band1 = upper;
      band2 = upper - atr * 1.5;
      band3 = upper - atr * 3;
    }

    bars.push({ band1, band2, band3, trend, trendChange, atr, ma: s });

    const hi = candles[i]!.high;
    const lo = candles[i]!.low;
    const prevHi = i > 0 ? candles[i - 1]!.high : hi;
    const prevLo = i > 0 ? candles[i - 1]!.low : lo;

    for (const bandNum of activeBands) {
      const pickBand = bandNum === 1 ? band1 : bandNum === 2 ? band2 : band3;
      const prevPick =
        i > 0
          ? bandNum === 1
            ? bars[i - 1]!.band1
            : bandNum === 2
              ? bars[i - 1]!.band2
              : bars[i - 1]!.band3
          : pickBand;
      const ctr = bandCounters[bandNum];
      if (crossunder(prevHi, hi, prevPick, pickBand) && ctr.count1 === 0 && !trend && !trendChange) {
        signals.push({
          index: i - 1,
          time: Number(candles[Math.max(0, i - 1)]!.time),
          price: prevHi,
          text: String(bandNum),
          dir: 'short',
        });
        ctr.count1 = 1;
      }
      if (close[i]! < pickBand && ctr.count1 !== 0) {
        ctr.count1 += 1;
        if (ctr.count1 === 10) ctr.count1 = 0;
      }
      if (crossover(prevLo, lo, prevPick, pickBand) && trend && !trendChange && ctr.count2 === 0) {
        signals.push({
          index: i - 1,
          time: Number(candles[Math.max(0, i - 1)]!.time),
          price: prevLo,
          text: String(bandNum),
          dir: 'long',
        });
        ctr.count2 = 1;
      }
      if (close[i]! > pickBand && ctr.count2 !== 0) {
        ctr.count2 += 1;
        if (ctr.count2 === 10) ctr.count2 = 0;
      }
    }
  }

  return { bars, signals };
}
