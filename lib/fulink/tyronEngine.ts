/**
 * 타이롱 엔진 포팅 (assets/lib logic/tyron_engine.dart)
 * 장대양봉/장대음봉 기반 1/3/5봉 후 상승 확률
 */

import type { Candle } from '@/types';

export type TyronStats = {
  isBigBull: boolean;
  isBigBear: boolean;
  atr: number;
  body: number;
  bodyAtrRatio: number;
  pUp1: number;
  pUp3: number;
  pUp5: number;
  samples: number;
};

function atr14(candles: Candle[], endIdx?: number): number {
  const idx = endIdx ?? candles.length - 1;
  const period = 14;
  const start = Math.max(1, idx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= idx; i++) {
    const c = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    sum += tr;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

function atrAt(candles: Candle[], idx: number, period = 14): number {
  const start = Math.max(1, idx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= idx; i++) {
    const c = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    sum += tr;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

export function analyzeTyron(candles: Candle[], bigBodyAtr = 1.2): TyronStats {
  if (candles.length < 40) {
    return {
      isBigBull: false,
      isBigBear: false,
      atr: 0,
      body: 0,
      bodyAtrRatio: 0,
      pUp1: 0.5,
      pUp3: 0.5,
      pUp5: 0.5,
      samples: 0,
    };
  }

  const atr = atr14(candles);
  const last = candles[candles.length - 1]!;
  const body = Math.abs(last.close - last.open);
  const ratio = atr <= 0 ? 0 : body / atr;

  const isBig = atr > 0 && body >= bigBodyAtr * atr;
  const isBull = last.close > last.open;
  const isBear = last.close < last.open;
  const isBigBull = isBig && isBull;
  const isBigBear = isBig && isBear;

  let samples = 0;
  let up1 = 0, up3 = 0, up5 = 0;

  for (let i = 20; i < candles.length - 6; i++) {
    const c = candles[i]!;
    const b = Math.abs(c.close - c.open);
    const a = atrAt(candles, i);
    if (a <= 0) continue;
    if (b < bigBodyAtr * a) continue;
    samples++;
    if (candles[i + 1]!.close > c.close) up1++;
    if (candles[i + 3]!.close > c.close) up3++;
    if (candles[i + 5]!.close > c.close) up5++;
  }

  const p = (up: number) => samples === 0 ? 0.5 : up / samples;

  return {
    isBigBull,
    isBigBear,
    atr,
    body,
    bodyAtrRatio: ratio,
    pUp1: p(up1),
    pUp3: p(up3),
    pUp5: p(up5),
    samples,
  };
}

/** DecisionEngine에 넣을 TyRong 형식 (0..100) */
export function tyronStatsToTyRong(stats: TyronStats): { p1: number; p3: number; p5: number } {
  return {
    p1: Math.round(stats.pUp1 * 100),
    p3: Math.round(stats.pUp3 * 100),
    p5: Math.round(stats.pUp5 * 100),
  };
}
