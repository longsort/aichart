/**
 * Pine: "Exhaustion Zone [by rukich]" (MPL-2.0) — 동일 수식 포팅.
 * ta.atr → Wilder RMA(TR), atr 스무딩 → SMA, ta.highest/lowest → 롤링 max/min.
 */
import type { Candle } from '@/types';
import { atrSeries } from '@/lib/indicators';

export type ExhaustionZoneRukichParams = {
  atrLength: number;
  atrSmooth: number;
  highestLength: number;
  lowestLength: number;
  smaLength: number;
  lineFactor: number;
  atrFactor: number;
  lineScale: number;
};

export const DEFAULT_EXHAUSTION_ZONE_RUKICH_PARAMS: ExhaustionZoneRukichParams = {
  atrLength: 14,
  atrSmooth: 34,
  highestLength: 13,
  lowestLength: 50,
  smaLength: 55,
  lineFactor: 0.236,
  atrFactor: 0.5,
  lineScale: 0.86,
};

/** 차트에 그리기 시작할 최소 인덱스 (Pine 워밍업과 유사 — SMA·롤링 창 이후) */
export const EXHAUSTION_ZONE_RUKICH_DISPLAY_START = 120;

function smaSeries(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    out[i] = s / period;
  }
  return out;
}

function rollingMax(arr: number[], len: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - len + 1);
    let m = -Infinity;
    for (let j = from; j <= i; j++) m = Math.max(m, arr[j]);
    out[i] = Number.isFinite(m) ? m : 0;
  }
  return out;
}

function rollingMin(arr: number[], len: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - len + 1);
    let m = Infinity;
    for (let j = from; j <= i; j++) m = Math.min(m, arr[j]);
    out[i] = Number.isFinite(m) ? m : 0;
  }
  return out;
}

export type ExhaustionZoneRukichSeries = {
  reboundLine: number[];
  rebScaled: number[];
  /** low <= rebound_line */
  signal: boolean[];
};

export function computeExhaustionZoneRukichSeries(
  candles: Candle[],
  p: ExhaustionZoneRukichParams = DEFAULT_EXHAUSTION_ZONE_RUKICH_PARAMS
): ExhaustionZoneRukichSeries {
  const n = candles.length;
  const lows = candles.map((c) => c.low);
  const atrRaw = atrSeries(candles, p.atrLength);
  const atrSmoothed = smaSeries(atrRaw, p.atrSmooth);

  const highestSource = lows.map((lo, i) => lo - atrSmoothed[i] * 2);
  const lowestSource = lows.map((lo, i) => lo + atrSmoothed[i] * 2);
  const highestS = rollingMax(highestSource, p.highestLength);
  const lowestF = rollingMin(lowestSource, p.lowestLength);

  const adjustedMid = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i < 1) continue;
    const hs1 = highestS[i - 1];
    const lf1 = lowestF[i - 1];
    const midValue = (hs1 + lf1) / 2;
    adjustedMid[i] = midValue - (hs1 + lf1) * p.lineFactor;
  }

  const rebSma = smaSeries(adjustedMid, p.smaLength);

  const reboundLine = new Array(n).fill(0);
  const signal = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const atrPrev = i >= 1 ? atrSmoothed[i - 1] : 0;
    const rl = rebSma[i] + atrPrev * p.atrFactor;
    reboundLine[i] = Number.isFinite(rl) ? rl : 0;
    signal[i] = lows[i] <= reboundLine[i];
  }

  const rebScaled = reboundLine.map((rl) => (Number.isFinite(rl) ? rl * p.lineScale : 0));

  return { reboundLine, rebScaled, signal };
}
