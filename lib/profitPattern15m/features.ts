/**
 * WICK_REJECT 등 피처 · 패턴 매칭.
 */
import type { Candle } from '@/types';

export type PpBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PpFeatures = {
  rangePos20: number;
  rangePos50: number;
  volRatio20: number;
  volZ20: number;
  lowerWickFrac: number;
  upperWickFrac: number;
  bodyFrac: number;
  absorptionLong: boolean;
  absorptionShort: boolean;
};

export type PpPatternId = 'ABSORPTION' | 'RANGE_EDGE' | 'WICK_REJECT' | 'VOL_SPIKE';

export function candlesToPpBars(candles: Candle[] | null | undefined): PpBar[] {
  const out: PpBar[] = [];
  for (const c of candles || []) {
    const time = Number(c.time);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume) || 0;
    if (![time, open, high, low, close].every(Number.isFinite) || !(close > 0)) continue;
    out.push({
      time: time > 1e12 ? Math.floor(time / 1000) : Math.floor(time),
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return out;
}

export function buildPpFeatures(bars: PpBar[], i: number): PpFeatures | null {
  if (i < 50 || i >= bars.length) return null;
  const c = bars[i]!;
  const range = Math.max(1e-12, c.high - c.low);
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWickFrac = lowerWick / range;
  const upperWickFrac = upperWick / range;
  const bodyFrac = body / range;

  let volSum = 0;
  const vols: number[] = [];
  for (let j = i - 19; j <= i; j++) {
    const v = bars[j]!.volume;
    volSum += v;
    vols.push(v);
  }
  const volMa = volSum / 20;
  const volRatio20 = volMa > 0 ? c.volume / volMa : 1;
  let varSum = 0;
  for (const v of vols) varSum += (v - volMa) ** 2;
  const std = Math.sqrt(varSum / Math.max(1, vols.length));
  const volZ20 = std > 0 ? (c.volume - volMa) / std : 0;

  let lo20 = Infinity;
  let hi20 = -Infinity;
  for (let j = i - 19; j <= i; j++) {
    lo20 = Math.min(lo20, bars[j]!.low);
    hi20 = Math.max(hi20, bars[j]!.high);
  }
  let lo50 = Infinity;
  let hi50 = -Infinity;
  for (let j = i - 49; j <= i; j++) {
    lo50 = Math.min(lo50, bars[j]!.low);
    hi50 = Math.max(hi50, bars[j]!.high);
  }
  const rangePos20 = hi20 > lo20 ? (c.close - lo20) / (hi20 - lo20) : 0.5;
  const rangePos50 = hi50 > lo50 ? (c.close - lo50) / (hi50 - lo50) : 0.5;

  const absorptionLong =
    lowerWickFrac >= 0.45 && bodyFrac <= 0.4 && c.close >= c.open && rangePos20 <= 0.4;
  const absorptionShort =
    upperWickFrac >= 0.45 && bodyFrac <= 0.4 && c.close <= c.open && rangePos20 >= 0.6;

  return {
    rangePos20,
    rangePos50,
    volRatio20,
    volZ20,
    lowerWickFrac,
    upperWickFrac,
    bodyFrac,
    absorptionLong,
    absorptionShort,
  };
}

export function patternMatch(
  id: PpPatternId,
  dir: 'LONG' | 'SHORT',
  f: PpFeatures
): boolean {
  if (id === 'ABSORPTION') {
    return dir === 'LONG' ? f.absorptionLong : f.absorptionShort;
  }
  if (id === 'RANGE_EDGE') {
    return dir === 'LONG' ? f.rangePos20 <= 0.25 : f.rangePos20 >= 0.75;
  }
  if (id === 'WICK_REJECT') {
    return dir === 'LONG'
      ? f.lowerWickFrac >= 0.4 && f.rangePos20 <= 0.45 && f.bodyFrac <= 0.55
      : f.upperWickFrac >= 0.4 && f.rangePos20 >= 0.55 && f.bodyFrac <= 0.55;
  }
  if (id === 'VOL_SPIKE') {
    if (dir === 'LONG') {
      return f.volZ20 >= 1.2 && f.rangePos20 <= 0.4 && f.lowerWickFrac >= 0.25;
    }
    return f.volZ20 >= 1.2 && f.rangePos20 >= 0.6 && f.upperWickFrac >= 0.25;
  }
  return false;
}
