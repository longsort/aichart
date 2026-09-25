/**
 * 통합·분석 — 마지막(developing) 봉 선행 판정 공통.
 */
import type { Candle } from '@/types';

export type MergedDevelopingBar = {
  low: number;
  high: number;
  bodyTop: number;
  bodyBot: number;
};

export function mergedDevelopingBar(c: Candle): MergedDevelopingBar {
  const bodyTop = Math.max(c.open, c.close);
  const bodyBot = Math.min(c.open, c.close);
  return {
    low: Math.min(bodyTop, bodyBot, c.low),
    high: Math.max(bodyTop, bodyBot, c.high),
    bodyTop,
    bodyBot,
  };
}

/** 종가 확정 전 마지막 봉 — high/low 기준 구조·돌파 선반영 */
export function mergedLeadingBreakAbove(c: Candle, level: number, isLastBar: boolean): boolean {
  if (c.close > level) return true;
  if (!isLastBar) return false;
  return mergedDevelopingBar(c).high > level;
}

export function mergedLeadingBreakBelow(c: Candle, level: number, isLastBar: boolean): boolean {
  if (c.close < level) return true;
  if (!isLastBar) return false;
  return mergedDevelopingBar(c).low < level;
}

export function mergedLeadingCloseGate(params: {
  candle: Candle;
  direction: 'LONG' | 'SHORT';
  swingHigh: number;
  swingLow: number;
  isLastBar: boolean;
}): boolean {
  const { candle: c, direction, swingHigh, swingLow, isLastBar } = params;
  if (direction === 'LONG') {
    const bullClose = c.close > c.open && c.close >= swingHigh * 0.9995;
    if (bullClose) return true;
    if (!isLastBar) return false;
    const dev = mergedDevelopingBar(c);
    return dev.high >= swingHigh * 0.9998 && c.close >= swingLow;
  }
  const bearClose = c.close < c.open && c.close <= swingLow * 1.0005;
  if (bearClose) return true;
  if (!isLastBar) return false;
  const dev = mergedDevelopingBar(c);
  return dev.low <= swingLow * 1.0002 && c.close <= swingHigh;
}

export function mergedLeadingMomentumGate(
  rsiVal: number,
  direction: 'LONG' | 'SHORT',
  isLastBar: boolean
): boolean {
  if (direction === 'LONG') {
    if (rsiVal >= 52) return true;
    return isLastBar && rsiVal >= 48;
  }
  if (rsiVal <= 48) return true;
  return isLastBar && rsiVal <= 52;
}

export function mergedLeadingVolumeGate(
  candle: Candle,
  avgVol: number,
  isLastBar: boolean
): boolean {
  const vol = candle.volume > 0 ? candle.volume : 1;
  if (vol >= avgVol * 1.04) return true;
  return isLastBar && vol >= avgVol * 0.92;
}

/** developing wick — zone 터치 (마지막 봉은 high/low 선반영) */
export function mergedLeadingBarExtremes(c: Candle, isLastBar: boolean): {
  low: number;
  high: number;
  close: number;
  open: number;
} {
  if (!isLastBar) {
    return { low: c.low, high: c.high, close: c.close, open: c.open };
  }
  const dev = mergedDevelopingBar(c);
  return { low: dev.low, high: dev.high, close: c.close, open: c.open };
}

export type MergedLeadingZoneTouch = 'long' | 'short' | null;

/** 수요/공급 zone — 선행 wick + hold/reject */
export function mergedLeadingZoneTouch(params: {
  c: Candle;
  isLastBar: boolean;
  kind: 'demand' | 'supply';
  top: number;
  bot: number;
  atr: number;
}): boolean {
  const { c, isLastBar, kind, top, bot, atr } = params;
  const ex = mergedLeadingBarExtremes(c, isLastBar);
  const mid = (top + bot) / 2;
  const tol = Math.max(atr * 0.06, (top - bot) * 0.08);

  if (kind === 'demand') {
    const touch = ex.low <= top + tol && ex.low >= bot - tol;
    const hold = ex.close >= bot - tol * 0.6;
    const reject =
      ex.low < bot &&
      ex.close > mid &&
      Math.min(ex.open, ex.close) - ex.low > Math.max(ex.high - ex.low, tol) * 0.22;
    return touch && (hold || reject);
  }
  const touch = ex.high >= bot - tol && ex.high <= top + tol;
  const hold = ex.close <= top + tol * 0.6;
  const reject =
    ex.high > top &&
    ex.close < mid &&
    ex.high - Math.max(ex.open, ex.close) > Math.max(ex.high - ex.low, tol) * 0.22;
  return touch && (hold || reject);
}
