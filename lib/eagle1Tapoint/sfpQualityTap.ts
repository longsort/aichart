/**
 * §14 SFP QUALITY — 존재 여부만이 아니라 sweep→reclaim→구조 품질.
 * falseBreakEngine 재사용.
 */
import type { FalseBreakReport } from '@/lib/eagle1/falseBreakEngine';
import type { StructureSnapshot } from '@/lib/eagle1/structureEngine';

export type TapSfpQuality = {
  kind: 'LONG_SFP' | 'SHORT_SFP' | 'NONE';
  score: number;
  active: boolean;
  evidence: string[];
  noteKo: string;
  /** 품질 충분하면 이벤트 경로 가산 */
  boostsEventPath: boolean;
};

export function buildTapSfpQuality(params: {
  falseBreak?: FalseBreakReport | null;
  structure?: StructureSnapshot | null;
  direction?: 'LONG' | 'SHORT' | null;
}): TapSfpQuality {
  const empty: TapSfpQuality = {
    kind: 'NONE',
    score: 0,
    active: false,
    evidence: [],
    noteKo: 'SFP 없음',
    boostsEventPath: false,
  };

  const fb = params.falseBreak;
  const st = params.structure;
  if (!fb && !st) return empty;

  const evidence: string[] = [];
  let score = 0;
  let kind: TapSfpQuality['kind'] = 'NONE';

  if (fb?.kind === 'FAKE_BREAKDOWN' && fb.breakdown?.active) {
    kind = 'LONG_SFP';
    score += 40;
    evidence.push('가짜붕괴·하단스윕실패');
    for (const e of fb.breakdown.evidence || []) {
      if (e.hit === true) {
        score += 8;
        evidence.push(e.labelKo);
      }
    }
  } else if (fb?.kind === 'FAKE_BREAKOUT' && fb.breakout?.active) {
    kind = 'SHORT_SFP';
    score += 40;
    evidence.push('가짜돌파·상단스윕실패');
    for (const e of fb.breakout.evidence || []) {
      if (e.hit === true) {
        score += 8;
        evidence.push(e.labelKo);
      }
    }
  }

  /** 구조 FAILED_BREAK / SWEEP 보강 */
  if (st) {
    const lastFail = [...(st.events || [])]
      .reverse()
      .find((e) => e.kind === 'FAILED_BREAK');
    const lastSweep = [...(st.events || [])]
      .reverse()
      .find((e) => e.kind === 'SWEEP');
    if (lastFail) {
      score += 12;
      evidence.push('FAILED_BREAK');
      if (kind === 'NONE') {
        kind = lastFail.bias === 'bullish' ? 'LONG_SFP' : 'SHORT_SFP';
      }
    }
    if (lastSweep) {
      score += 10;
      evidence.push('SWEEP');
    }
    if (st.state === 'SHIFT' || st.state === 'RETEST' || st.state === 'CONFIRMED') {
      score += 12;
      evidence.push(`구조${st.state}`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  if (kind === 'NONE' || score < 35) {
    return { ...empty, score, evidence, noteKo: score > 0 ? 'SFP 품질 부족' : 'SFP 없음' };
  }

  /** 방향 불일치면 감점 */
  if (
    params.direction === 'LONG' &&
    kind === 'SHORT_SFP'
  ) {
    score = Math.max(0, score - 25);
  }
  if (
    params.direction === 'SHORT' &&
    kind === 'LONG_SFP'
  ) {
    score = Math.max(0, score - 25);
  }

  const boostsEventPath = score >= 62;
  return {
    kind,
    score,
    active: true,
    evidence: evidence.slice(0, 8),
    noteKo: `${kind} 품질${score} · ${evidence.slice(0, 3).join('+')}`,
    boostsEventPath,
  };
}
