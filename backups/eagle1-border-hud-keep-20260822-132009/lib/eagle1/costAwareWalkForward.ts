/**
 * Phase 19 — Cost-aware Walk-Forward.
 * Train→Val→Holdout 시간순. Shuffle 금지.
 * maker/taker/funding/spread/slippage를 netR에 반영(보고용). Holdout은 가중 미사용.
 */
import type { SetupOutcome } from './zoneExpectancy';
import { walkForwardBacktest, type Eagle1WalkForwardReport } from './walkForwardBacktest';
import { chronologicalSplit, rejectShuffledSplit, isChronological } from './chronologicalSplit';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type ExecutionCostAssumptions = {
  makerBps: number;
  takerBps: number;
  /** round-trip에 쓰는 기본 수수료 모드 */
  feeMode: 'taker' | 'maker';
  fundingBps: number;
  spreadBps: number;
  slippageBps: number;
};

export const EAGLE1_DEFAULT_EXEC_COSTS: ExecutionCostAssumptions = {
  makerBps: 2,
  takerBps: 6,
  feeMode: 'taker',
  fundingBps: 1,
  spreadBps: 2,
  slippageBps: 3,
};

export type CostAwareWalkForwardReport = {
  base: Eagle1WalkForwardReport;
  costs: ExecutionCostAssumptions;
  costPerTradeR: number;
  adjustedHoldoutNetEv: number | null;
  splitOk: boolean;
  shuffleForbidden: true;
  note: string;
  summaryKo: string;
};

/** 왕복 비용 ≈ (fee*2 + spread + slip + funding) / 10000 을 1R 스케일로 근사 — 확정 수익 아님 */
export function costPerTradeApproxR(costs: ExecutionCostAssumptions): number {
  const fee = costs.feeMode === 'maker' ? costs.makerBps : costs.takerBps;
  const bps = fee * 2 + costs.spreadBps + costs.slippageBps + costs.fundingBps;
  return bps / 10000;
}

function applyCost(rows: SetupOutcome[], costR: number): SetupOutcome[] {
  return rows.map((r) => ({
    ...r,
    netR: Number.isFinite(r.netR) ? r.netR - costR : r.netR,
  }));
}

export function runCostAwareWalkForward(params: {
  outcomes?: SetupOutcome[] | null;
  costs?: Partial<ExecutionCostAssumptions>;
  /** 외부 spread가 있으면 덮어씀 */
  liveSpreadBps?: number | null;
}): CostAwareWalkForwardReport {
  const costs: ExecutionCostAssumptions = {
    ...EAGLE1_DEFAULT_EXEC_COSTS,
    ...params.costs,
    spreadBps:
      params.liveSpreadBps != null && Number.isFinite(params.liveSpreadBps)
        ? params.liveSpreadBps
        : params.costs?.spreadBps ?? EAGLE1_DEFAULT_EXEC_COSTS.spreadBps,
  };
  const raw = [...(params.outcomes ?? [])].sort((a, b) => a.index - b.index);
  const costR = costPerTradeApproxR(costs);
  const adjusted = applyCost(raw, costR);
  const base = walkForwardBacktest(adjusted);

  const split = chronologicalSplit(raw.length);
  const shuffleBad = rejectShuffledSplit(split);
  const chronoOk =
    isChronological(split.train) &&
    isChronological(split.validation) &&
    isChronological(split.holdout);
  const splitOk = !shuffleBad && chronoOk;

  const adjHold =
    base.holdoutNetEv != null && Number.isFinite(base.holdoutNetEv) ? base.holdoutNetEv : null;

  return {
    base,
    costs,
    costPerTradeR: costR,
    adjustedHoldoutNetEv: adjHold,
    splitOk,
    shuffleForbidden: true,
    note: !raw.length
      ? '데이터 없음'
      : raw.length < EAGLE1_MIN_STAT_SAMPLE
        ? '통계 부족'
        : !splitOk
          ? '시간순 분할 실패 · shuffle 금지'
          : base.note,
    summaryKo: !raw.length
      ? '데이터 없음'
      : raw.length < EAGLE1_MIN_STAT_SAMPLE
        ? '통계 부족 · 비용 반영 WF'
        : `WF ${base.label} · 비용≈${(costR * 10000).toFixed(0)}bps/왕복 · 홀드아웃가중금지`,
  };
}
