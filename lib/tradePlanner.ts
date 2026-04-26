import type { Verdict } from '@/types';

export type TradePlannerInput = {
  signal: Verdict;
  currentPrice: number;
  equilibrium?: number;
  rangeHigh?: number;
  rangeLow?: number;
  atr?: number;
  regime?: string;
  /** 1m,3m,5m 등 저 TF에서 ATR 최소화 방지 (진입·손절·목표 존 겹침 보정) */
  timeframe?: string;
};

export type TradePlanResult = {
  entry: number;
  stopLoss: number;
  targets: number[];
  rr: number;
  invalidationReason: string;
};

/** 진입가가 현재가에서 과도하게 벗어나지 않도록 제한 (캔들/현재가와 동떨어진 표시 방지) */
const ENTRY_CAP_PCT = 0.03; // 롱: 현재가 대비 최대 +3%, 숏: -3%
/** 1m·3m·5m: ATR 최소값 (가격 대비) — 존 붙음 방지 */
const LTF_ATR_MIN_PCT = 0.004;

export function computeTradePlan(input: TradePlannerInput): TradePlanResult {
  const { signal, currentPrice, equilibrium = currentPrice, rangeHigh = currentPrice * 1.02, rangeLow = currentPrice * 0.98, atr = currentPrice * 0.01, timeframe } = input;
  const isLTF = timeframe === '1m' || timeframe === '3m' || timeframe === '5m';
  const atrMin = currentPrice * LTF_ATR_MIN_PCT;
  const atrEff = isLTF ? Math.max(atr, atrMin) : atr;

  const invalidationReason = signal === 'WATCH' ? '관망 구간, 진입 미추천' : '';

  if (signal === 'LONG') {
    // 지지 구간(현재가 ≤ equilibrium): 신호가 여기서 나옴 → 진입 = 현재가 (바로 매수 가능)
    // 그 외: 균형 복귀 대기 → equilibrium 기반
    const atSupport = currentPrice <= equilibrium;
    let entry: number;
    if (atSupport) {
      entry = currentPrice; // 4요소 확정 롱은 지지에서 발생 → 진입가 = 신호 캔들 종가
    } else {
      entry = Math.max(equilibrium, currentPrice * 0.998);
      if (entry > currentPrice * (1 + ENTRY_CAP_PCT)) {
        entry = currentPrice * (1 + ENTRY_CAP_PCT * 0.5);
      }
    }
    const stopDist = Math.max(atrEff * 1.5, (entry - rangeLow) * 0.5);
    const stopLoss = entry - stopDist;
    const t1 = entry + atrEff * 2;
    const t2 = entry + atrEff * 3;
    const t3 = entry + atrEff * 4;
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
    // 저항 구간(현재가 ≥ equilibrium): 신호가 여기서 나옴 → 진입 = 현재가 (바로 매도 가능)
    const atResistance = currentPrice >= equilibrium;
    let entry: number;
    if (atResistance) {
      entry = currentPrice; // 4요소 확정 숏은 저항에서 발생 → 진입가 = 신호 캔들 종가
    } else {
      entry = Math.min(equilibrium, currentPrice * 1.002);
      if (entry < currentPrice * (1 - ENTRY_CAP_PCT)) {
        entry = currentPrice * (1 - ENTRY_CAP_PCT * 0.5);
      }
    }
    const stopDist = Math.max(atrEff * 1.5, (rangeHigh - entry) * 0.5);
    const stopLoss = entry + stopDist;
    const t1 = entry - atrEff * 2;
    const t2 = entry - atrEff * 3;
    const t3 = entry - atrEff * 4;
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
