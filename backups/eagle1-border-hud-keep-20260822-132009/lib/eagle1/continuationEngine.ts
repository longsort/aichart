/** PHASE 11 Continuation — CONTINUE/HOLD/REDUCE/EXIT */
import type { PositionManagementReport } from './positionManagementEngine';
import type { Eagle1MainPlan } from './signalEngine';

export type ContinuationAction = 'NONE' | 'CONTINUE' | 'HOLD' | 'REDUCE' | 'EXIT';

export type ContinuationReport = {
  action: ContinuationAction;
  labelEn: ContinuationAction;
  labelKo: string;
  autoBeForbidden: true;
  note: string;
  summaryKo: string;
};

const KO: Record<ContinuationAction, string> = {
  NONE: 'none',
  CONTINUE: 'continue',
  HOLD: 'hold',
  REDUCE: 'reduce',
  EXIT: 'exit',
};

export function runContinuationEngine(params: {
  position: PositionManagementReport | null | undefined;
  plan?: Eagle1MainPlan | null;
  lastClose?: number | null;
  stop?: number | null;
  tp2?: number | null;
}): ContinuationReport {
  const pos = params.position;
  if (!pos || pos.state === 'NONE' || !pos.tradeId) {
    return {
      action: 'NONE',
      labelEn: 'NONE',
      labelKo: '포지션 없음',
      autoBeForbidden: true,
      note: '데이터 없음',
      summaryKo: 'Continuation 없음',
    };
  }
  if (
    pos.failClosedHoldingTargets ||
    pos.state === 'CLOSED' ||
    pos.state === 'STOPPED_LOSS' ||
    pos.state === 'STOPPED_PROFIT' ||
    pos.state === 'EARLY_EXIT'
  ) {
    return {
      action: 'EXIT',
      labelEn: 'EXIT',
      labelKo: '청산',
      autoBeForbidden: true,
      note: pos.note,
      summaryKo: `EXIT · ${pos.state}`,
    };
  }
  const plan = params.plan;
  if (plan?.status === 'LONG_MISSED' || plan?.status === 'SHORT_MISSED' || plan?.status === 'WAIT') {
    return {
      action: 'EXIT',
      labelEn: 'EXIT',
      labelKo: '청산',
      autoBeForbidden: true,
      note: `plan ${plan.status}`,
      summaryKo: `EXIT · ${plan.status}`,
    };
  }
  const close = params.lastClose;
  const stop = params.stop;
  const dir = pos.direction;
  if (close != null && stop != null && dir === 'LONG' && close <= stop) {
    return {
      action: 'EXIT',
      labelEn: 'EXIT',
      labelKo: '청산',
      autoBeForbidden: true,
      note: '종가 SL',
      summaryKo: 'EXIT · SL',
    };
  }
  if (close != null && stop != null && dir === 'SHORT' && close >= stop) {
    return {
      action: 'EXIT',
      labelEn: 'EXIT',
      labelKo: '청산',
      autoBeForbidden: true,
      note: '종가 SL',
      summaryKo: 'EXIT · SL',
    };
  }
  if (pos.state === 'TP1_HIT' || pos.state === 'PROTECT_PROFIT') {
    return {
      action: 'REDUCE',
      labelEn: 'REDUCE',
      labelKo: '부분축소',
      autoBeForbidden: true,
      note: 'TP1 후 BE 금지',
      summaryKo: `REDUCE · ${pos.state}`,
    };
  }
  if (pos.state === 'BE' || pos.state === 'TRAIL' || pos.state === 'TP2' || pos.state === 'TP3') {
    const toward =
      close != null &&
      params.tp2 != null &&
      ((dir === 'LONG' && close < params.tp2) || (dir === 'SHORT' && close > params.tp2));
    if (toward) {
      return {
        action: 'CONTINUE',
        labelEn: 'CONTINUE',
        labelKo: '보유',
        autoBeForbidden: true,
        note: 'TP2 방향',
        summaryKo: `CONTINUE · ${pos.state}`,
      };
    }
    return {
      action: 'HOLD',
      labelEn: 'HOLD',
      labelKo: '유지',
      autoBeForbidden: true,
      note: pos.beAllowed ? 'BE ok' : 'BE 금지 HOLD',
      summaryKo: `HOLD · ${pos.state}`,
    };
  }
  if (pos.state === 'OPEN') {
    return {
      action: 'CONTINUE',
      labelEn: 'CONTINUE',
      labelKo: '보유',
      autoBeForbidden: true,
      note: 'OPEN',
      summaryKo: 'CONTINUE · OPEN',
    };
  }
  return {
    action: 'HOLD',
    labelEn: 'HOLD',
    labelKo: '유지',
    autoBeForbidden: true,
    note: pos.note,
    summaryKo: `HOLD · ${pos.state}`,
  };
}

export function continuationAcceptanceGH(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const empty = runContinuationEngine({
    position: {
      state: 'NONE',
      tradeId: null,
      direction: null,
      rail: [],
      currentIndex: -1,
      autoBeForbidden: true,
      beAllowed: false,
      failClosedHoldingTargets: false,
      showTp2: false,
      showTp3: false,
      note: 'x',
      summaryKo: 'x',
    },
  });
  if (empty.action !== 'NONE') notes.push('empty');
  if (!empty.autoBeForbidden) notes.push('be');
  const tp1 = runContinuationEngine({
    position: {
      state: 'TP1_HIT',
      tradeId: 't1',
      direction: 'LONG',
      rail: [],
      currentIndex: 1,
      autoBeForbidden: true,
      beAllowed: false,
      failClosedHoldingTargets: false,
      showTp2: true,
      showTp3: false,
      note: 't',
      summaryKo: 't',
    },
  });
  if (tp1.action !== 'REDUCE') notes.push('tp1');
  const closed = runContinuationEngine({
    position: {
      state: 'CLOSED',
      tradeId: 't2',
      direction: 'LONG',
      rail: [],
      currentIndex: 7,
      autoBeForbidden: true,
      beAllowed: false,
      failClosedHoldingTargets: true,
      showTp2: true,
      showTp3: true,
      note: 'f',
      summaryKo: 'f',
    },
  });
  if (closed.action !== 'EXIT') notes.push('exit');
  void KO;
  return { ok: notes.length === 0, notes };
}
