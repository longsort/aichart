/**
 * Causal candle + volume features. Prefix only: index i uses candles[0..i].
 */
import { atrAt, detectStructureCausal, type Eagle1Bar } from '@/lib/eagle1/structureEngine';
import type { PatternMemoryRegime, StoredCandle } from '@/lib/patternMemory/types';

export const CANDLE_DIM = 20;
export const VOLUME_DIM = 16;

export type BarFeatures = {
  index: number;
  openTime: number;
  candleVec: number[];
  volumeVec: number[];
  jointVec: number[];
  regime: PatternMemoryRegime;
  bucket: string;
  ret: number;
  atr: number;
};

function toBars(c: StoredCandle[]): Eagle1Bar[] {
  return c.map((x) => ({
    time: Math.floor(x.openTime / 1000),
    open: x.open,
    high: x.high,
    low: x.low,
    close: x.close,
    volume: x.baseVolume,
  }));
}

function sma(xs: number[], end: number, n: number): number {
  const a = Math.max(0, end - n);
  let s = 0;
  let k = 0;
  for (let i = a; i < end; i++) {
    s += xs[i]!;
    k += 1;
  }
  return k ? s / k : 0;
}

function stdev(xs: number[], end: number, n: number, mu: number): number {
  const a = Math.max(0, end - n);
  let s = 0;
  let k = 0;
  for (let i = a; i < end; i++) {
    const d = xs[i]! - mu;
    s += d * d;
    k += 1;
  }
  return k > 1 ? Math.sqrt(s / k) : 1;
}

function mapRegime(raw: string, atrNow: number, atrPrev: number): PatternMemoryRegime {
  if (atrPrev > 0 && atrNow < atrPrev * 0.72) return 'VOL_COMPRESSION';
  if (raw === 'STRONG_BULL') return 'STRONG_UP';
  if (raw === 'BULL') return 'UP';
  if (raw === 'STRONG_BEAR') return 'STRONG_DOWN';
  if (raw === 'BEAR') return 'DOWN';
  if (raw === 'VOLATILITY_EXPANSION') return 'VOL_EXPANSION';
  if (raw === 'RANGE' || raw === 'ACCUMULATION' || raw === 'DISTRIBUTION') return 'RANGE';
  return 'UNKNOWN';
}

export function computeBarFeatures(candles: StoredCandle[], endExclusive?: number): BarFeatures[] {
  const n = Math.max(0, Math.min(candles.length, endExclusive ?? candles.length));
  if (n < 8) return [];
  const slice = candles.slice(0, n);
  const bars = toBars(slice);
  const structure = detectStructureCausal(bars, n, 3);
  const vols = slice.map((c) => c.baseVolume);
  const out: BarFeatures[] = [];

  for (let i = 6; i < n; i++) {
    const c = slice[i]!;
    const prev = slice[i - 1]!;
    const range = Math.max(c.high - c.low, 1e-9);
    const body = Math.abs(c.close - c.open);
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);
    const upper = c.high - top;
    const lower = bot - c.low;
    const ret = prev.close > 0 ? (c.close - prev.close) / prev.close : 0;
    const atr = atrAt(bars, i + 1, 14);
    const atrPrev = atrAt(bars, Math.max(2, i - 13), 14);
    const atrN = c.close > 0 ? atr / c.close : 0;
    const known = structure.events.filter((e) => e.known_at <= i);
    const lastSwing = [...known].reverse().find((e) => e.kind === 'SWING');
    const lastBos = [...known].reverse().find((e) => e.kind === 'BOS');
    const lastChoch = [...known].reverse().find((e) => e.kind === 'CHOCH');
    const swing = lastSwing?.swing || '';
    const bos = lastBos ? (lastBos.bias === 'bullish' ? 1 : -1) : 0;
    const choch = lastChoch ? (lastChoch.bias === 'bullish' ? 1 : -1) : 0;
    const mss = choch;
    const volComp = atrPrev > 0 && atr < atrPrev * 0.75 ? 1 : 0;
    const volExp = atrPrev > 0 && atr > atrPrev * 1.35 ? 1 : 0;
    const mom = i >= 3 ? (c.close - slice[i - 3]!.close) / Math.max(atr, 1e-9) : 0;
    const engulf =
      i > 0 && body > Math.abs(prev.close - prev.open) && ((c.close > c.open && prev.close < prev.open) || (c.close < c.open && prev.close > prev.open))
        ? (c.close > c.open ? 1 : -1)
        : 0;
    const pin = range > 0 && Math.max(upper, lower) / range > 0.62 && body / range < 0.28 ? (lower > upper ? 1 : -1) : 0;
    const inside = i > 0 && c.high <= prev.high && c.low >= prev.low ? 1 : 0;
    const outside = i > 0 && c.high >= prev.high && c.low <= prev.low ? 1 : 0;

    const candleVec = [
      Math.tanh(ret * 80),
      Math.tanh(body / range),
      body / range,
      upper / range,
      lower / range,
      (upper + lower) / range,
      Math.tanh(range / Math.max(atr, 1e-9) - 1),
      (c.close - c.low) / range,
      swing === 'HH' ? 1 : 0,
      swing === 'HL' ? 1 : 0,
      swing === 'LH' ? 1 : 0,
      swing === 'LL' ? 1 : 0,
      bos,
      choch,
      mss,
      Math.tanh(atrN * 80),
      volComp,
      volExp,
      Math.tanh(mom / 4),
      engulf * 0.5 + pin * 0.35 + inside * 0.2 + outside * 0.2,
    ];

    const mu5 = sma(vols, i, 5);
    const mu10 = sma(vols, i, 10);
    const mu20 = sma(vols, i, 20);
    const mu50 = sma(vols, i, 50);
    const sd20 = stdev(vols, i, 20, mu20);
    const z = sd20 > 0 ? (c.baseVolume - mu20) / sd20 : 0;
    const vr5 = mu5 > 0 ? c.baseVolume / mu5 : 1;
    const vr10 = mu10 > 0 ? c.baseVolume / mu10 : 1;
    const vr20 = mu20 > 0 ? c.baseVolume / mu20 : 1;
    const vr50 = mu50 > 0 ? c.baseVolume / mu50 : 1;
    const volTrend = mu20 > 0 ? (mu5 - mu20) / mu20 : 0;
    const volMom = mu10 > 0 ? (c.baseVolume - (vols[i - 1] || c.baseVolume)) / mu10 : 0;
    const rel = mu20 > 0 ? c.baseVolume / mu20 : 1;
    const vExp = rel > 1.6 ? 1 : 0;
    const vComp = rel < 0.6 ? 1 : 0;
    const priceUp = c.close > prev.close;
    const volUp = c.baseVolume > (vols[i - 1] || 0);
    const pvu = priceUp && volUp ? 1 : 0;
    const pvd = priceUp && !volUp ? 1 : 0;
    const pdvu = !priceUp && volUp ? 1 : 0;
    const pdvd = !priceUp && !volUp ? 1 : 0;
    const move = Math.abs(c.close - prev.close);
    const pve = c.baseVolume > 0 ? move / c.baseVolume : 0;
    const pveN = mu20 > 0 ? Math.tanh((pve * mu20) / Math.max(atr, 1e-9)) : 0;
    const breakoutVol = (bos !== 0 || choch !== 0) && rel > 1.3 ? 1 : 0;
    const rejectionVol = pin !== 0 && rel > 1.2 ? 1 : 0;
    const volDiv = (priceUp && volMom < 0) || (!priceUp && volMom > 0) ? 1 : 0;
    const volAtHigh = (c.close - c.low) / range > 0.72 ? rel : 0;
    const volAtLow = (c.high - c.close) / range > 0.72 ? rel : 0;

    const volumeVec = [
      Math.tanh((vr5 - 1) / 2),
      Math.tanh((vr10 - 1) / 2),
      Math.tanh((vr20 - 1) / 2),
      Math.tanh((vr50 - 1) / 2),
      Math.tanh(z / 3),
      Math.tanh(volTrend),
      Math.tanh(volMom),
      Math.tanh((rel - 1) / 2),
      vExp,
      vComp,
      pvu - pdvu,
      pvd - pdvd,
      pveN,
      breakoutVol,
      rejectionVol,
      volDiv * 0.5 + Math.tanh(volAtHigh / 3) - Math.tanh(volAtLow / 3),
    ];

    const regime = mapRegime(structure.regime, atr, atrPrev);
    const signs =
      (ret >= 0 ? 1 : 0) +
      ((i >= 2 && slice[i - 1]!.close >= slice[i - 2]!.close ? 1 : 0) << 1) +
      ((i >= 3 && slice[i - 2]!.close >= slice[i - 3]!.close ? 1 : 0) << 2);
    const volQ = rel < 0.7 ? 0 : rel < 1.1 ? 1 : rel < 1.8 ? 2 : 3;
    const bucket = `${regime}|${signs}|${volQ}`;

    out.push({
      index: i,
      openTime: c.openTime,
      candleVec,
      volumeVec,
      jointVec: [...candleVec, ...volumeVec],
      regime,
      bucket,
      ret,
      atr,
    });
  }
  return out;
}

export function windowVector(rows: BarFeatures[], endIndex: number, window: number, model: 'CANDLE_ONLY' | 'CANDLE_VOLUME'): number[] {
  const pick = rows.filter((r) => r.index <= endIndex).slice(-window);
  const vecs = pick.map((r) => (model === 'CANDLE_ONLY' ? r.candleVec : r.jointVec));
  if (!vecs.length) return [];
  const dim = vecs[0]!.length;
  const flat: number[] = [];
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) flat.push(v[i] ?? 0);
  }
  const mean = flat.reduce((s, x) => s + x, 0) / Math.max(flat.length, 1);
  const sd = Math.sqrt(flat.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(flat.length, 1)) || 1;
  return flat.map((x) => (x - mean) / sd);
}
