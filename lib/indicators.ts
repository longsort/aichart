import { Candle } from '@/types';

export function rsi(candles: Candle[], period = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      out.push(50);
      continue;
    }
    let gains = 0, losses = 0;
    for (let j = i - period; j < i; j++) {
      const ch = candles[j + 1].close - candles[j].close;
      if (ch > 0) gains += ch;
      else losses -= ch;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      out.push(arr[i]);
      continue;
    }
    const sum = arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    out.push(sum / period);
  }
  return out;
}

export function stochRsi(candles: Candle[], rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3): { k: number[]; d: number[] } {
  const rsiVals = rsi(candles, rsiPeriod);
  const rawK: number[] = [];
  for (let i = 0; i < rsiVals.length; i++) {
    if (i < rsiPeriod + stochPeriod - 1) {
      rawK.push(50);
      continue;
    }
    const slice = rsiVals.slice(i - stochPeriod + 1, i + 1);
    const rsiLow = Math.min(...slice);
    const rsiHigh = Math.max(...slice);
    const rsiRange = rsiHigh - rsiLow || 1;
    rawK.push(100 * (rsiVals[i] - rsiLow) / rsiRange);
  }
  const k = sma(rawK, kPeriod);
  const d = sma(k, dPeriod);
  return { k, d };
}

export type RsiStochSignal = 'bullish' | 'bearish' | null;

export function rsiStochSignals(candles: Candle[], rsiPeriod = 14, stochPeriod = 14, rsiMaPeriod = 12): RsiStochSignal[] {
  const rsiVals = rsi(candles, rsiPeriod);
  const rsiMa = ema(rsiVals, rsiMaPeriod);
  const { k, d } = stochRsi(candles, rsiPeriod, stochPeriod, 3, 3);
  const signals: RsiStochSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    signals.push(null);
    if (i < rsiPeriod + stochPeriod + 5) continue;
    const r = rsiVals[i];
    const rMa = rsiMa[i];
    const kVal = k[i];
    const dVal = d[i];
    const kPrev = k[i - 1];
    const dPrev = d[i - 1];
    const rPrev = rsiVals[i - 1];
    const rMaPrev = rsiMa[i - 1];
    const kUp = kVal > dVal && kPrev <= dPrev;
    const kDown = kVal < dVal && kPrev >= dPrev;
    const kNear20 = kVal < 40 && dVal < 40;
    const kNear80 = kVal > 60 && dVal > 60;
    const rAboveMa = r > rMa;
    const rBelowMa = r < rMa;
    const rUp = r > rPrev;
    const rDown = r < rPrev;
    const rMaUp = rMa > rMaPrev;
    const rMaDown = rMa < rMaPrev;

    if (kUp && kNear20 && rAboveMa && rUp && rMaUp) signals[i] = 'bullish';
    if (kDown && kNear80 && rBelowMa && rDown && rMaDown) signals[i] = 'bearish';
  }
  return signals;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }
  const signalLine = ema(macdLine, signal);
  const hist: number[] = [];
  for (let i = 0; i < macdLine.length; i++) hist.push(macdLine[i] - signalLine[i]);
  return { macd: macdLine, signal: signalLine, hist };
}

export function bollingerBands(candles: Candle[], period = 20, stdDev = 2) {
  const closes = candles.map(c => c.close);
  const mid: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      mid.push(closes[i]);
      upper.push(closes[i]);
      lower.push(closes[i]);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const m = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((s, x) => s + (x - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance) || 0.0001;
    mid.push(m);
    upper.push(m + stdDev * sd);
    lower.push(m - stdDev * sd);
  }
  return { mid, upper, lower };
}

export function atrSeries(candles: Candle[], period = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < 1) { out.push(0); continue; }
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (i < period) {
      out.push(i === 1 ? tr : (out[i - 1] * (i - 1) + tr) / i);
    } else {
      out.push((out[i - 1] * (period - 1) + tr) / period);
    }
  }
  return out;
}
