/**
 * §31 OVERFITTING 방지 — Train/Validation/Walk-forward 안내 스텁.
 * 가짜 인샘플 승률 표시 금지.
 */
export type TapOverfitGuard = {
  ok: boolean;
  noteKo: string;
  requireOos: true;
  forbidLookahead: true;
};

export function evaluateTapOverfitGuard(params?: {
  inSampleOnly?: boolean;
  sampleN?: number | null;
}): TapOverfitGuard {
  const n = params?.sampleN;
  if (params?.inSampleOnly) {
    return {
      ok: false,
      noteKo: '인샘플 단독 결과 · OOS/워크포워드 전 LIVE 금지',
      requireOos: true,
      forbidLookahead: true,
    };
  }
  if (n != null && n < 40) {
    return {
      ok: false,
      noteKo: `표본 N=${n} 부족 · 신뢰도 하향`,
      requireOos: true,
      forbidLookahead: true,
    };
  }
  return {
    ok: true,
    noteKo: 'OOS·워크포워드 원칙 유지 · 미래참조금지',
    requireOos: true,
    forbidLookahead: true,
  };
}
