/**
 * §15 ENTRY STATE MACHINE — S급/SETUP ≠ EXECUTED.
 */
import type { TapDecision, TapEntryState, TapExecKind, TapGateResult, TapScorePack } from './types';
import { scoresAllowArmed, scoresAllowConfirm } from './scores';

export type AdvanceEntryParams = {
  prev?: TapEntryState;
  direction: 'LONG' | 'SHORT' | null;
  gate: TapGateResult;
  scores: TapScorePack;
  eventPath: boolean;
  qualityOk: boolean;
  /** §16·17 엔진이 고른 실행종류 */
  preferredExecKind?: TapExecKind;
};

export type AdvanceEntryResult = {
  entryState: TapEntryState;
  decision: TapDecision;
  execKind: TapExecKind;
  rejectReasonKo: string | null;
};

function hasNetEvFail(gate: TapGateResult): boolean {
  return gate.failReasons.some((r) => r === 'NET_EV_FAIL' || r.startsWith('NET_EV:'));
}

export function advanceTapEntryState(p: AdvanceEntryParams): AdvanceEntryResult {
  if (!p.qualityOk) {
    return {
      entryState: 'WAIT',
      decision: 'WAIT',
      execKind: 'WAIT',
      rejectReasonKo: 'DATA_QUALITY_BAD',
    };
  }
  if (!p.direction) {
    return {
      entryState: 'WAIT',
      decision: 'WAIT',
      execKind: 'WAIT',
      rejectReasonKo: '방향없음',
    };
  }

  const armedOk = scoresAllowArmed(p.scores);
  const confirmOk =
    scoresAllowConfirm(p.scores) &&
    p.gate.ok &&
    p.gate.passTags.includes('AT_ZONE');
  /**
   * 이벤트 경로 — 게이트 우회 금지.
   * 전투구간 도달·일봉/선진 역행·실행선 불량이면 확정 불가.
   */
  const eventConfirm =
    p.eventPath &&
    p.scores.entry >= 58 &&
    p.scores.location >= 52 &&
    p.scores.event >= 72 &&
    p.gate.passTags.includes('AT_ZONE') &&
    !p.gate.failReasons.includes('TIP_MISSING_AI_ONLY') &&
    !p.gate.failReasons.includes('NO_BATTLE_ZONE') &&
    !p.gate.failReasons.includes('WEAK_SINGLE_ZONE') &&
    !p.gate.failReasons.includes('DATA_QUALITY_BAD') &&
    !p.gate.failReasons.includes('PRICE_NOT_AT_ZONE') &&
    !p.gate.failReasons.includes('DAILY_FACE_CONFLICT') &&
    !p.gate.failReasons.includes('ADV_VOL_CONFLICT') &&
    !p.gate.failReasons.includes('EXEC_LEVELS_BAD') &&
    !p.gate.failReasons.includes('FLOW_CONFLICT') &&
    !p.gate.failReasons.includes('CORR_CLUSTER_LIMIT') &&
    !hasNetEvFail(p.gate);

  if (confirmOk || eventConfirm) {
    const kind: TapExecKind =
      p.preferredExecKind && p.preferredExecKind !== 'WAIT'
        ? p.preferredExecKind
        : p.scores.event >= 75
          ? 'MARKET_SCALP'
          : 'ZONE_SNIPER';
    return {
      entryState: 'EXECUTION_READY',
      decision: p.direction === 'LONG' ? 'CONFIRMED_LONG' : 'CONFIRMED_SHORT',
      execKind: kind,
      rejectReasonKo: null,
    };
  }

  /** AT_ZONE + 미세확인 직전 — TRIGGERED (아직 주문 아님) */
  if (
    armedOk &&
    p.gate.passTags.includes('AT_ZONE') &&
    p.gate.passTags.includes('MICRO_CONFIRM') &&
    !p.gate.ok
  ) {
    return {
      entryState: 'TRIGGERED',
      decision: p.direction === 'LONG' ? 'ARMED_LONG' : 'ARMED_SHORT',
      execKind: 'WAIT',
      rejectReasonKo: `TRIGGERED·대기 · ${p.gate.failReasons.slice(0, 2).join('·') || '게이트미완'}`,
    };
  }

  if (armedOk || p.scores.setup >= 55) {
    const why = !p.gate.ok
      ? `게이트 · ${p.gate.failReasons.slice(0, 2).join('·')}`
      : `ENTRY ${p.scores.entry} LOC ${p.scores.location}`;
    return {
      entryState: p.gate.passTags.includes('AT_ZONE') ? 'ARMED' : 'SETUP',
      decision: p.direction === 'LONG' ? 'ARMED_LONG' : 'ARMED_SHORT',
      execKind: 'WAIT',
      rejectReasonKo: `S급/셋업≠즉시주문 · ${why}`,
    };
  }

  return {
    entryState: 'WAIT',
    decision: 'WAIT',
    execKind: 'WAIT',
    rejectReasonKo: `WAIT · DIR${p.scores.direction} SETUP${p.scores.setup} ENTRY${p.scores.entry}`,
  };
}
