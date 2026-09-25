/**
 * StopOptimizer — structural vs executable SL. riskEngine 재사용.
 */
import type { Eagle1RiskPlan } from './riskEngine';

export type StopOptimizerReport = {
  structuralSl: number | null;
  executableSl: number | null;
  labelEn: 'STOP';
  labelKo: string;
  note: string;
  widenedForMae: boolean;
};

export function runStopOptimizer(params: {
  risk: Eagle1RiskPlan | null | undefined;
}): StopOptimizerReport {
  const risk = params.risk;
  if (!risk || risk.executableSl == null) {
    return {
      structuralSl: null,
      executableSl: null,
      labelEn: 'STOP',
      labelKo: '손절',
      note: '데이터 없음',
      widenedForMae: false,
    };
  }
  const widened =
    risk.structuralSl != null &&
    Number.isFinite(risk.structuralSl) &&
    Math.abs(risk.structuralSl - risk.executableSl) > 1e-8;
  return {
    structuralSl: risk.structuralSl,
    executableSl: risk.executableSl,
    labelEn: 'STOP',
    labelKo: '손절',
    note: widened ? '구조손절 + MAE 여유' : '구조·실행 손절',
    widenedForMae: widened,
  };
}
