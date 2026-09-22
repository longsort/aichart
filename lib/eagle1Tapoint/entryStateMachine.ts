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
};

export type AdvanceEntryResult = {
  entryState: TapEntryState;
  decision: TapDecision;
  execKind: TapExecKind;
  rejectReasonKo: string | null;
};

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
  const confirmOk = scoresAllowConfirm(p.scores) && p.gate.ok;
  /** 이벤트 경로는 유동성/리클레임 일부 완화돼도 ENTRY·LOCATION은 유지 */
  const eventConfirm =
    p.eventPath &&
    p.scores.entry >= 52 &&
    p.scores.location >= 48 &&
    p.scores.event >= 70 &&
    !p.gate.failReasons.includes('TIP_MISSING_AI_ONLY') &&
    !p.gate.failReasons.includes('NO_BATTLE_ZONE') &&
    !p.gate.failReasons.includes('DATA_QUALITY_BAD');

  if (confirmOk || eventConfirm) {
    return {
      entryState: 'EXECUTION_READY',
      decision: p.direction === 'LONG' ? 'CONFIRMED_LONG' : 'CONFIRMED_SHORT',
      execKind: p.scores.event >= 75 ? 'MARKET_SCALP' : 'ZONE_SNIPER',
      rejectReasonKo: null,
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
