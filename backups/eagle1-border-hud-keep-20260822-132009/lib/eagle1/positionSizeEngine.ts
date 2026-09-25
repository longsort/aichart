/**
 * Phase 15 — Position size. Risk% × Equity / stop distance.
 * 레버리지로 사이즈 선결정 금지. confidence 무시.
 */
import {
  positionUnits,
  EAGLE1_DEFAULT_EQUITY,
  EAGLE1_DEFAULT_RISK_PCT,
  type Eagle1RiskPlan,
} from './riskEngine';
import type { Eagle1MainPlan } from './signalEngine';

export type PositionSizeReport = {
  units: number | null;
  equity: number;
  riskPct: number;
  riskAmount: number | null;
  stopDistance: number | null;
  entry: number | null;
  sl: number | null;
  leverageForbidden: true;
  note: string;
  labelKo: string;
};

export function runPositionSizeEngine(params: {
  risk?: Eagle1RiskPlan | null;
  plan?: Eagle1MainPlan | null;
  equity?: number;
  riskPct?: number;
}): PositionSizeReport {
  const equity = params.equity ?? params.risk?.sizeEquity ?? EAGLE1_DEFAULT_EQUITY;
  const riskPct = params.riskPct ?? params.risk?.sizeRiskPct ?? EAGLE1_DEFAULT_RISK_PCT;
  const entry =
    params.plan?.entryLow != null && params.plan?.entryHigh != null
      ? (params.plan.entryLow + params.plan.entryHigh) / 2
      : params.risk?.entryLow != null && params.risk?.entryHigh != null
        ? (params.risk.entryLow + params.risk.entryHigh) / 2
        : null;
  const sl = params.plan?.sl ?? params.risk?.executableSl ?? null;

  if (entry == null || sl == null || !(equity > 0) || !(riskPct > 0)) {
    return {
      units: null,
      equity,
      riskPct,
      riskAmount: null,
      stopDistance: null,
      entry,
      sl,
      leverageForbidden: true,
      note: '데이터 없음 · 레버리지로 사이즈 정하지 않음',
      labelKo: '포지션 크기',
    };
  }

  const stopDistance = Math.abs(entry - sl);
  const units = positionUnits({ equity, riskPct, entry, sl, confidence: 0.99 });
  const riskAmount = equity * (riskPct / 100);

  return {
    units,
    equity,
    riskPct,
    riskAmount,
    stopDistance,
    entry,
    sl,
    leverageForbidden: true,
    note:
      units != null
        ? `위험 ${riskPct}% · $${riskAmount.toFixed(0)} / 손절폭 ${stopDistance.toFixed(2)} · 확신도 무관`
        : '사이즈 계산 불가',
    labelKo: '포지션 크기',
  };
}
