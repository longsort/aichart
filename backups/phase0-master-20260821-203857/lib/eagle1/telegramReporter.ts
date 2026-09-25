/**
 * PHASE 17 — Telegram report formatter. Engine does not depend on send success.
 */
import { EAGLE1_ENGINE_VERSION } from './rawTypes';
import { eagle1DecisionKo, formatPriceCompact } from './chartUx';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1ConsensusReport } from './consensusEngine';
import type { Eagle1SmartPath } from './smartPath';

export type Eagle1TelegramPayload = {
  symbol?: string;
  timeframe?: string;
  plan: Eagle1MainPlan;
  consensus?: Eagle1ConsensusReport | null;
  smartPath?: Eagle1SmartPath | null;
  previousVersion?: string | null;
};

export function formatEagle1TelegramReport(p: Eagle1TelegramPayload): string {
  try {
    const plan = p.plan;
    const d = eagle1DecisionKo(plan.status);
    const entry =
      plan.entryLow != null && plan.entryHigh != null
        ? `${formatPriceCompact(plan.entryLow)}~${formatPriceCompact(plan.entryHigh)}`
        : '대기';
    const prob =
      plan.calibratedProbability != null && plan.sampleSize >= 30
        ? `${Math.round(plan.calibratedProbability * 100)}%`
        : '통계 부족';
    const rr = plan.netRr != null ? `1:${plan.netRr.toFixed(2)}` : '통계 부족';
    const ver =
      p.previousVersion && p.previousVersion !== EAGLE1_ENGINE_VERSION
        ? `${p.previousVersion} → ${EAGLE1_ENGINE_VERSION}`
        : EAGLE1_ENGINE_VERSION;
    const ood = p.consensus?.ood.flagged ? `\nOOD: ${p.consensus.note}` : '';
    const path = p.smartPath ? `\n경로: ${p.smartPath.main.labelKo} ${p.smartPath.main.state}` : '';
    return [
      `독수리1호 ${p.symbol ?? 'BTCUSDT'} ${p.timeframe ?? ''}`.trim(),
      `${d}`,
      `진입 ${entry}`,
      `손절 ${formatPriceCompact(plan.sl)}`,
      `목표 ${formatPriceCompact(plan.tp1)} / ${formatPriceCompact(plan.tp2)} / ${formatPriceCompact(plan.tp3)}`,
      `RR ${rr} · 검증확률 ${prob}`,
      `무효 ${plan.invalidation || '데이터 없음'}`,
      `버전 ${ver}${ood}${path}`,
      '확정 수익·투자 권유 아님',
    ].join('\n');
  } catch {
    return '데이터 없음';
  }
}

/** Never throws into the trading pipeline. */
export function safeEagle1TelegramReport(p: Eagle1TelegramPayload): string {
  try {
    return formatEagle1TelegramReport(p);
  } catch {
    return '데이터 없음';
  }
}
