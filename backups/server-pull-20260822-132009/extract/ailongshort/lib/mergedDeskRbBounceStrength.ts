/**
 * 파랑빨강띠·Hot zone 반등/하락 강도 등급.
 * 약 / 중 / 강 / 초강 — 조건부 참고(확정 수익·승률 아님).
 */
export type MergedDeskRbBounceGrade = 'weak' | 'mid' | 'strong' | 'ultra';

export type MergedDeskRbBounceStrength = {
  grade: MergedDeskRbBounceGrade;
  /** ★약반등|★중반등|★강반등|★초강력반등 또는 ★약하락|…★초강력하락 */
  labelKo: string;
  shortKo: '약' | '중' | '강' | '초강';
  score: number;
  reasons: string[];
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function mergedDeskReactionGradeFromScore(score: number): MergedDeskRbBounceGrade {
  const s = clampScore(score);
  if (s >= 86) return 'ultra';
  if (s >= 70) return 'strong';
  if (s >= 55) return 'mid';
  return 'weak';
}

/** 차트 면 라벨 1개용 — 롱=반등, 숏=하락 */
export function mergedDeskReactionLabelKo(
  side: 'LONG' | 'SHORT',
  grade: MergedDeskRbBounceGrade
): string {
  const isLong = side === 'LONG';
  const shortKo: MergedDeskRbBounceStrength['shortKo'] =
    grade === 'ultra' ? '초강' : grade === 'strong' ? '강' : grade === 'mid' ? '중' : '약';
  if (grade === 'ultra') return isLong ? '★초강력반등' : '★초강력하락';
  return `★${shortKo}${isLong ? '반등' : '하락'}`;
}

/**
 * 레일 터치·회복·POC·트리거로 반등/하락 강도 산출.
 */
export function gradeMergedDeskRbBounceStrength(params: {
  side: 'LONG' | 'SHORT';
  baseScore: number;
  status?: 'READY' | 'NEAR' | 'HOLD' | 'WAIT' | 'ENTER' | 'TOUCH' | string | null;
  paintTrigger?: string | null;
  atRail?: boolean;
  wickHold?: boolean;
  bullOrBearBar?: boolean;
  reboundBody?: boolean;
  pocAligned?: boolean;
  distAtr?: number | null;
}): MergedDeskRbBounceStrength {
  const side = params.side;
  const isLong = side === 'LONG';
  let score = clampScore(params.baseScore);
  const reasons: string[] = [`기초 ${score}`];

  if (params.paintTrigger === 'rail-bounce' && isLong) {
    score += 12;
    reasons.push('레일반등 트리거 +12');
  }
  if ((params.paintTrigger === 'rail-drop' || params.paintTrigger === 'rail-reject') && !isLong) {
    score += 12;
    reasons.push('레일하락 트리거 +12');
  }
  if (params.atRail) {
    score += 8;
    reasons.push('레일밀착 +8');
  }
  if (params.wickHold) {
    score += 10;
    reasons.push('윅홀드 +10');
  }
  if (params.bullOrBearBar) {
    score += 8;
    reasons.push(isLong ? '양봉회복 +8' : '음봉거부 +8');
  }
  if (params.reboundBody) {
    score += 8;
    reasons.push(isLong ? '몸통반등 +8' : '몸통하락 +8');
  }
  if (params.pocAligned) {
    score += 6;
    reasons.push('POC정렬 +6');
  }
  if (params.status === 'READY' || params.status === 'ENTER') {
    score += 10;
    reasons.push('존도달 +10');
  } else if (params.status === 'NEAR' || params.status === 'HOLD' || params.status === 'TOUCH') {
    score += 5;
    reasons.push('근접/홀드 +5');
  }
  const dist = Number(params.distAtr);
  if (Number.isFinite(dist) && dist <= 0.35) {
    score += 6;
    reasons.push('초밀착 +6');
  }

  score = clampScore(score);
  const grade = mergedDeskReactionGradeFromScore(score);
  const shortKo: MergedDeskRbBounceStrength['shortKo'] =
    grade === 'ultra' ? '초강' : grade === 'strong' ? '강' : grade === 'mid' ? '중' : '약';
  const labelKo = mergedDeskReactionLabelKo(side, grade);

  return { grade, labelKo, shortKo, score, reasons };
}
