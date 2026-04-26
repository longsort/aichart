/**
 * Core AI 포팅 (assets/lib core_ai/core_ai.dart)
 * Evidence 리스트 → LONG/SHORT/LOCK 비율 및 bias
 */

export type CoreAIEvidence = {
  id: string;
  vote: 'LONG' | 'SHORT' | 'NEUTRAL';
  weight: number;
  strength: number;
};

export type CoreAIResult = {
  bias: 'LONG' | 'SHORT' | 'LOCK';
  longPct: number;
  shortPct: number;
  lockPct: number;
};

export function runCoreAI(evs: CoreAIEvidence[]): CoreAIResult {
  let l = 0, s = 0;
  for (const e of evs) {
    if (e.vote === 'LONG') l += e.weight * e.strength;
    if (e.vote === 'SHORT') s += e.weight * e.strength;
  }
  const t = l + s;
  const lp = t === 0 ? 0 : (l / t) * 100;
  const sp = t === 0 ? 0 : (s / t) * 100;
  const kp = 100 - lp - sp;
  const bias: CoreAIResult['bias'] = Math.abs(lp - sp) < 10 ? 'LOCK' : lp > sp ? 'LONG' : 'SHORT';
  return { bias, longPct: lp, shortPct: sp, lockPct: kp };
}
