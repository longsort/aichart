/**
 * StrategyZone — CORE와 분리된 전략 구간 계약.
 * UI에 트레이더 이름 금지. 차트 표기는 BREAKOUT/REVERSAL/… 계열만.
 */

import type { MarketZoneState, MarketZoneEvidence, MarketZoneDirection } from './marketZone';

export type StrategyType =
  | 'TREND_BREAK'
  | 'RANGE_BREAK'
  | 'VCP'
  | 'LIQUIDITY_REVERSAL'
  | 'OB_RETEST'
  | 'MITIGATION'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'WHALE_DEFENSE'
  | 'POC_RECLAIM'
  | 'ASYMMETRIC_RISK';

export type StrategyZone = {
  id: string;
  symbol: string;
  strategyType: StrategyType;
  direction: 'LONG' | 'SHORT';
  upper: number;
  lower: number;
  midpoint: number;
  sourceTimeframe: string;
  createdAt: number;
  confirmedAt: number | null;
  state: MarketZoneState;
  triggerPrice: number | null;
  invalidationPrice: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  rr: number | null;
  /** 0~100 setup 강도 — 승률 아님 */
  setupScore: number | null;
  historicalSample: number | null;
  historicalWinRate: number | null;
  medianMFE: number | null;
  medianMAE: number | null;
  medianContinuation: number | null;
  medianDuration: number | null;
  evidence: MarketZoneEvidence[];
  labelEn: string;
  labelKo: string;
  note: string;
};

export function strategyBias(direction: 'LONG' | 'SHORT'): MarketZoneDirection {
  return direction === 'LONG' ? 'bullish' : 'bearish';
}

export function emptyStrategyStats(): Pick<
  StrategyZone,
  | 'historicalSample'
  | 'historicalWinRate'
  | 'medianMFE'
  | 'medianMAE'
  | 'medianContinuation'
  | 'medianDuration'
> {
  return {
    historicalSample: null,
    historicalWinRate: null,
    medianMFE: null,
    medianMAE: null,
    medianContinuation: null,
    medianDuration: null,
  };
}
