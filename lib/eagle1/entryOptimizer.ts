/**
 * EntryOptimizer — MAIN ENTRY ZONE 1개. riskEngine 재사용.
 * MISSED 추격 금지.
 */
import type { Eagle1RiskPlan } from './riskEngine';
import type { Eagle1MainPlan } from './signalEngine';

export type MainEntryZone = {
  low: number;
  high: number;
  mid: number;
  labelEn: 'MAIN ENTRY';
  labelKo: string;
  candidateKind: Eagle1RiskPlan['candidateKind'];
  chaseBlocked: boolean;
  note: string;
};

export type EntryOptimizerReport = {
  zone: MainEntryZone | null;
  allowEntry: boolean;
  note: string;
};

export function runEntryOptimizer(params: {
  risk: Eagle1RiskPlan | null | undefined;
  plan?: Eagle1MainPlan | null;
}): EntryOptimizerReport {
  const risk = params.risk;
  const plan = params.plan;
  const missed = plan?.status === 'LONG_MISSED' || plan?.status === 'SHORT_MISSED';
  if (missed) {
    return {
      zone: null,
      allowEntry: false,
      note: 'MISSED · 추격 금지',
    };
  }
  if (!risk || risk.entryLow == null || risk.entryHigh == null) {
    return { zone: null, allowEntry: false, note: '데이터 없음' };
  }
  const low = Math.min(risk.entryLow, risk.entryHigh);
  const high = Math.max(risk.entryLow, risk.entryHigh);
  const mid = (low + high) / 2;
  const poor = plan?.entryQuality === 'poor' || risk.rrGate === 'reject';
  return {
    zone: {
      low,
      high,
      mid,
      labelEn: 'MAIN ENTRY',
      labelKo: '메인 진입구간',
      candidateKind: risk.candidateKind,
      chaseBlocked: false,
      note: risk.candidateKind ? `${risk.candidateKind} · 단일 메인존` : '단일 메인존',
    },
    allowEntry: !poor && risk.rrGate !== 'reject' && risk.execution !== 'SIGNAL_VALID_EXECUTION_WAIT',
    note: poor ? '타점 불량' : risk.execution === 'SIGNAL_VALID_EXECUTION_WAIT' ? '체결 대기' : '메인 진입 1개',
  };
}
