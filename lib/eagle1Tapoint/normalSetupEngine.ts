/**
 * §9 NORMAL SETUP ENGINE — 필수 게이트용 구조화 스냅.
 * Extreme Event와 대칭 · 기존 reclaim/micro/sweep 재사용.
 */
export type TapNormalSetupSnap = {
  ok: boolean;
  score: number;
  hasContext: boolean;
  atBattleZone: boolean;
  liquidityEvent: boolean;
  reclaim: boolean;
  microStructure: boolean;
  displacement: boolean;
  noteKo: string;
  tags: string[];
};

export function buildTapNormalSetupSnap(params: {
  direction: 'LONG' | 'SHORT' | null;
  hasContext: boolean;
  atZone: boolean;
  hasSweep: boolean;
  hasReclaim: boolean;
  hasMicro: boolean;
  hasDisplacement?: boolean;
  setupScore: number;
  locationScore: number;
}): TapNormalSetupSnap {
  const tags: string[] = [];
  if (params.hasContext) tags.push('CONTEXT');
  if (params.atZone) tags.push('AT_ZONE');
  if (params.hasSweep) tags.push('LIQUIDITY_EVENT');
  if (params.hasReclaim) tags.push('RECLAIM');
  if (params.hasMicro) tags.push('MICRO');
  if (params.hasDisplacement) tags.push('DISPLACEMENT');

  const required =
    params.hasContext &&
    params.atZone &&
    (params.hasSweep || params.hasReclaim) &&
    params.hasMicro;

  let score = Math.round(
    params.setupScore * 0.35 +
      params.locationScore * 0.35 +
      (params.hasSweep ? 12 : 0) +
      (params.hasReclaim ? 10 : 0) +
      (params.hasMicro ? 10 : 0) +
      (params.hasDisplacement ? 8 : 0)
  );
  score = Math.max(0, Math.min(100, score));

  if (!params.direction) {
    return {
      ok: false,
      score: Math.min(score, 40),
      hasContext: params.hasContext,
      atBattleZone: params.atZone,
      liquidityEvent: params.hasSweep,
      reclaim: params.hasReclaim,
      microStructure: params.hasMicro,
      displacement: params.hasDisplacement === true,
      noteKo: 'NORMAL SETUP · 방향없음',
      tags,
    };
  }

  return {
    ok: required && score >= 55,
    score,
    hasContext: params.hasContext,
    atBattleZone: params.atZone,
    liquidityEvent: params.hasSweep,
    reclaim: params.hasReclaim,
    microStructure: params.hasMicro,
    displacement: params.hasDisplacement === true,
    noteKo: required
      ? `NORMAL SETUP OK · ${tags.join('+')}`
      : `NORMAL SETUP 미완 · 필요:${[
          !params.hasContext ? 'CONTEXT' : '',
          !params.atZone ? 'ZONE' : '',
          !(params.hasSweep || params.hasReclaim) ? 'SWEEP/RECLAIM' : '',
          !params.hasMicro ? 'MICRO' : '',
        ]
          .filter(Boolean)
          .join('·')}`,
    tags,
  };
}
