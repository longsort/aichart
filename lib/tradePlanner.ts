import type { Verdict } from '@/types';

export type TradePlannerInput = {
  signal: Verdict;
  currentPrice: number;
  equilibrium?: number;
  rangeHigh?: number;
  rangeLow?: number;
  atr?: number;
  regime?: string;
};

export type TradePlanResult = {
  entry: number;
  stopLoss: number;
  targets: number[];
  rr: number;
  invalidationReason: string;
};

export function computeTradePlan(input: TradePlannerInput): TradePlanResult {
  const { signal, currentPrice, equilibrium = currentPrice, rangeHigh = currentPrice * 1.02, rangeLow = currentPrice * 0.98, atr = currentPrice * 0.01 } = input;

  const invalidationReason = signal === 'WATCH' ? '관망 구간, 진입 미추천' : '';

  if (signal === 'LONG') {
    const entry = Math.max(equilibrium, currentPrice * 0.998);
    const stopDist = Math.max(atr * 1.5, (entry - rangeLow) * 0.5);
    const stopLoss = entry - stopDist;
    const t1 = entry + atr * 2;
    const t2 = entry + atr * 3;
    const t3 = entry + atr * 4;
    const avgTarget = (t1 + t2 + t3) / 3;
    const rr = stopDist > 0 ? (avgTarget - entry) / stopDist : 0;
    return {
      entry,
      stopLoss,
      targets: [t1, t2, t3],
      rr: Math.round(rr * 100) / 100,
      invalidationReason,
    };
  }

  if (signal === 'SHORT') {
    const entry = Math.min(equilibrium, currentPrice * 1.002);
    const stopDist = Math.max(atr * 1.5, (rangeHigh - entry) * 0.5);
    const stopLoss = entry + stopDist;
    const t1 = entry - atr * 2;
    const t2 = entry - atr * 3;
    const t3 = entry - atr * 4;
    const avgTarget = (t1 + t2 + t3) / 3;
    const rr = stopDist > 0 ? (entry - avgTarget) / stopDist : 0;
    return {
      entry,
      stopLoss,
      targets: [t1, t2, t3],
      rr: Math.round(rr * 100) / 100,
      invalidationReason,
    };
  }

  const entry = currentPrice;
  const stopLoss = currentPrice * 0.99;
  const targets = [currentPrice * 1.01, currentPrice * 1.015, currentPrice * 1.02];
  return {
    entry,
    stopLoss,
    targets,
    rr: 0,
    invalidationReason,
  };
}
