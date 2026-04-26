/**
 * M+ADX Pro — TV 스크린: 상승 청록/시안, 하락 주황/적갈 EMA 리본 (8·55 기준 방향).
 */

import type { Candle } from '@/types';
import { ema } from '@/lib/indicators';
import type { LineData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';

export type EternyRibbonLineDatum = LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

export const ETERNY_RIBBON_PERIODS = [8, 13, 21, 34, 55] as const;

/** 상승 추세 — 청록·시안·블루그레이 */
export const ETERNY_RIBBON_BULL_COLORS = [
  'rgba(6,182,212,0.62)',
  'rgba(34,211,238,0.55)',
  'rgba(56,189,248,0.50)',
  'rgba(125,211,252,0.45)',
  'rgba(186,230,253,0.40)',
] as const;

/** 하락 추세 — 주황·적색·갈색 톤 */
export const ETERNY_RIBBON_BEAR_COLORS = [
  'rgba(234,88,12,0.62)',
  'rgba(249,115,22,0.55)',
  'rgba(251,146,60,0.50)',
  'rgba(239,68,68,0.48)',
  'rgba(180,83,9,0.42)',
] as const;

export function emaLineDataFromCandles(candles: Candle[], period: number): LineData<UTCTimestamp>[] {
  if (candles.length < 2 || period < 1) return [];
  const closes = candles.map((c) => c.close);
  const ev = ema(closes, period);
  const out: LineData<UTCTimestamp>[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = ev[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out.push({ time: candles[i].time as UTCTimestamp, value: v });
  }
  return out;
}

/** 봉마다 EMA(8) > EMA(55) 이면 상승 리본 */
export function eternyRibbonTrendBullFromCandles(candles: Candle[]): boolean[] {
  const n = candles.length;
  const out = new Array<boolean>(n).fill(false);
  if (n < 55) return out;
  const closes = candles.map((c) => c.close);
  const e8 = ema(closes, 8);
  const e55 = ema(closes, 55);
  for (let i = 0; i < n; i++) {
    const a = e8[i];
    const b = e55[i];
    out[i] = typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b) && a >= b;
  }
  return out;
}

/**
 * 한 EMA 라인을 방향에 따라 두 시리즈로 분리 (같은 봉은 한쪽만 값, 반대는 공백).
 * lightweight-charts Line: 값 없는 봉은 스킵/공백 처리로 선분 분리.
 */
export function splitEmaLineByTrend(
  candles: Candle[],
  emaValues: (number | undefined)[],
  bull: boolean[]
): { bull: EternyRibbonLineDatum[]; bear: EternyRibbonLineDatum[] } {
  const n = Math.min(candles.length, emaValues.length, bull.length);
  const bullD: EternyRibbonLineDatum[] = [];
  const bearD: EternyRibbonLineDatum[] = [];
  for (let i = 0; i < n; i++) {
    const t = candles[i].time as UTCTimestamp;
    const v = emaValues[i];
    const isBull = bull[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      bullD.push({ time: t });
      bearD.push({ time: t });
      continue;
    }
    if (isBull) {
      bullD.push({ time: t, value: v });
      bearD.push({ time: t });
    } else {
      bearD.push({ time: t, value: v });
      bullD.push({ time: t });
    }
  }
  return { bull: bullD, bear: bearD };
}

export function emaValuesArray(candles: Candle[], period: number): (number | undefined)[] {
  const n = candles.length;
  if (n < 2 || period < 1) return new Array(n).fill(undefined);
  const closes = candles.map((c) => c.close);
  const ev = ema(closes, period);
  const out: (number | undefined)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = ev[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }
  return out;
}
