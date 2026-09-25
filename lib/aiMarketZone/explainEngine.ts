/**
 * STEP19 — Feature 기반 설명 (가짜 LLM 금지).
 */
import type { AmzMarketZone } from './types';

function pct(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${Math.round(v * 100)}%`;
}

/** Zone 클릭/툴팁용 상세 블록 (카드 UI 아님 — 텍스트만) */
export function buildAmzZoneDetailKo(z: AmzMarketZone): string {
  const lines: string[] = [
    `AI ${z.roleKo}`,
    `전체 ${z.outerLower.toFixed(0)}~${z.outerUpper.toFixed(0)}`,
    `핵심 ${z.coreLower.toFixed(0)}~${z.coreUpper.toFixed(0)}`,
  ];
  if (z.coreDefensePrice != null) lines.push(`핵심방어 ${z.coreDefensePrice.toFixed(0)}`);
  if (z.criticalEdge != null) lines.push(`취약경계 ${z.criticalEdge.toFixed(0)}`);
  if (z.maxAbsorptionPrice != null) lines.push(`최대흡수 ${z.maxAbsorptionPrice.toFixed(0)}`);
  lines.push(`상태 ${z.stateKo}`);
  lines.push(`초기강도 ${z.initialStrength}/100 · 현재 ${z.currentStrength}/100`);
  lines.push(`방어 ${z.defenseScore} · 공격 ${z.attackScore} · 전투 ${z.battleIntensity}`);
  lines.push(`생명 ${z.lifeScore}% · 피로 ${z.fatigueScore}% · 안정 ${z.stabilityScore}%`);
  if (z.absorptionScore != null) lines.push(`흡수 ${z.absorptionScore}`);
  if (z.replenishmentScore != null) lines.push(`재보충 ${z.replenishmentScore}`);
  if (z.liquidityPullScore != null) lines.push(`Pull ${z.liquidityPullScore}`);
  lines.push(`테스트 ${z.touchCount}회`);
  if (z.lastReactionPct != null) lines.push(`최근반응 ${z.lastReactionPct}%`);
  if (z.probabilities.calibrated) {
    lines.push(
      `유지 ${pct(z.probabilities.hold) ?? 'null'} · 돌파 ${pct(z.probabilities.breakTrue) ?? 'null'} · Fake ${pct(z.probabilities.fakeBreak) ?? 'null'} · Sweep ${pct(z.probabilities.sweep) ?? 'null'}`
    );
    lines.push(`표본 n=${z.probabilities.sampleSize} · 신뢰 ${z.confidence}`);
  } else {
    lines.push(z.probabilities.abstainReasonKo || '확률 WAIT');
  }
  lines.push('참고·확정 아님');
  return lines.join('\n');
}

/** Feature에서만 생성한 짧은 내러티브 */
export function buildAmzFeatureExplainKo(z: AmzMarketZone): string {
  const parts: string[] = [];
  const role =
    z.role === 'DEFENSE_SUPPORT' || z.role === 'FLIP'
      ? '지지'
      : z.role === 'DEFENSE_RESISTANCE'
        ? '저항'
        : z.roleKo;

  if (z.attackScore >= 65 && (z.absorptionScore ?? 0) >= 55 && z.defenseScore >= 55) {
    parts.push(
      `현재 이 ${role}구간에서는 공격 압력(${z.attackScore})이 있으나 흡수(${z.absorptionScore})·방어(${z.defenseScore})가 함께 잡혀 방어 쪽이 우세한 편입니다.`
    );
  } else if (z.attackScore >= 70 && z.defenseScore <= 45) {
    parts.push(
      `공격(${z.attackScore})이 방어(${z.defenseScore})를 웃돌아 ${role} 붕괴·돌파 압박이 커진 상태입니다.`
    );
  } else if (z.defenseScore >= 70 && z.attackScore <= 40) {
    parts.push(`방어(${z.defenseScore})가 공격(${z.attackScore})보다 높아 ${role} 유지 쪽이 우세합니다.`);
  } else {
    parts.push(`방어 ${z.defenseScore} · 공격 ${z.attackScore} — 우열이 크지 않아 관망 여지가 있습니다.`);
  }

  if ((z.replenishmentScore ?? 0) >= 60) {
    parts.push(`재보충(${z.replenishmentScore})이 유지되고 있습니다.`);
  } else if (z.replenishmentScore != null && z.replenishmentScore < 35) {
    parts.push(`재보충(${z.replenishmentScore})이 약해 방어 지속성이 떨어질 수 있습니다.`);
  }

  if ((z.liquidityPullScore ?? 0) >= 55) {
    parts.push(`유동성 Pull(${z.liquidityPullScore})이 있어 함정·스윕 가능성을 같이 봅니다.`);
  }

  if (z.fatigueScore >= 55 || z.touchCount >= 3) {
    parts.push(
      `반복 테스트(터치 ${z.touchCount}·피로 ${z.fatigueScore})로 방어 확률을 다시 봐야 합니다.`
    );
  }

  if (z.compressionScore >= 70) {
    parts.push(`압축(${z.compressionScore})이 높아 경계 돌파·가짜돌파 모두 대비합니다.`);
  }

  if (z.probabilities.calibrated) {
    const h = pct(z.probabilities.hold);
    const b = pct(z.probabilities.breakTrue);
    if (h && b) parts.push(`보정확률(참고) 유지 ${h} · 돌파 ${b} · n=${z.probabilities.sampleSize}.`);
  } else if (z.probabilities.abstainReasonKo) {
    parts.push(z.probabilities.abstainReasonKo);
  }

  return parts.join(' ');
}

export function isAmzApproachState(state: AmzMarketZone['state']): boolean {
  return (
    state === 'APPROACHING' ||
    state === 'TESTING' ||
    state === 'DEFENDING' ||
    state === 'WEAKENING' ||
    state === 'CRITICAL' ||
    state === 'BREAK_ATTEMPT' ||
    state === 'RETEST'
  );
}
