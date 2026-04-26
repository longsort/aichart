import type { Verdict } from '@/types';

type Side = 'LONG' | 'SHORT';
type ZoneRole = 'support_reaction' | 'resistance_reaction' | 'reentry' | 'breakout_retest';
type AiZoneStage = 'opinion' | 'prepared' | 'confirmed';

export type AiZoneSignal = {
  verdict: Verdict;
  confidence: number;
  longScore: number;
  shortScore: number;
  stage: AiZoneStage;
  confirmation: {
    structure: boolean;
    zoneReaction: boolean;
    mtfAligned: boolean;
    invalidationFixed: boolean;
  };
  zone: {
    side: Side;
    low: number;
    high: number;
    role: ZoneRole;
    strengthScore: number;
    invalidation: number | null;
    targetHint: number | null;
  } | null;
  scenarios: Array<{
    name: 'A' | 'B';
    direction: Side | 'WATCH';
    summary: string;
    invalidation: number | null;
  }>;
  reasons: string[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildAiZoneSignal(input: {
  verdict: Verdict;
  confidence?: number;
  probability?: { longProbability?: number; shortProbability?: number } | null;
  confirmedSignal?: {
    confirmed?: boolean;
    direction?: Side | null;
    gatesPassCount?: number;
    mtfBlocked?: boolean;
  } | null;
  mtf?: { alignmentScore?: number } | null;
  zoneBiasCard?: {
    side: Side | null;
    confidence: number;
    low: number;
    high: number;
    invalidateBelow: number | null;
    invalidateAbove: number | null;
  } | null;
  structureBouncePath?: { bias: 'up' | 'down' | 'range' } | null;
  supportLevel?: { price: number } | null;
  resistanceLevel?: { price: number } | null;
  invalidationLevel?: { price: number } | null;
  targets?: string[];
  currentPrice?: number | null;
}): AiZoneSignal {
  const reasons: string[] = [];
  const baseLong = Number(input.probability?.longProbability ?? 50);
  const baseShort = Number(input.probability?.shortProbability ?? 50);
  let longScore = clamp(baseLong, 0, 100);
  let shortScore = clamp(baseShort, 0, 100);

  if (input.verdict === 'LONG') {
    longScore += 10;
    reasons.push('엔진 verdict 롱');
  } else if (input.verdict === 'SHORT') {
    shortScore += 10;
    reasons.push('엔진 verdict 숏');
  } else {
    reasons.push('엔진 verdict 관망');
  }

  const cs = input.confirmedSignal;
  const gates = Number(cs?.gatesPassCount ?? 0);
  if (cs?.confirmed && cs.direction === 'LONG') {
    longScore += 14;
    reasons.push(`확정게이트 통과(${cs.gatesPassCount ?? 5}/5) 롱`);
  } else if (cs?.confirmed && cs.direction === 'SHORT') {
    shortScore += 14;
    reasons.push(`확정게이트 통과(${cs.gatesPassCount ?? 5}/5) 숏`);
  } else if (typeof cs?.gatesPassCount === 'number') {
    if ((cs.gatesPassCount ?? 0) >= 3) {
      if (input.verdict === 'LONG') longScore += 6;
      if (input.verdict === 'SHORT') shortScore += 6;
      reasons.push(`게이트 준비도 ${cs.gatesPassCount}/5`);
    }
    if (cs.mtfBlocked) reasons.push('MTF 반대(가중 약화)');
  }
  const mtfAligned = Number(input.mtf?.alignmentScore ?? 50) >= 58 && !Boolean(cs?.mtfBlocked);
  if (mtfAligned) reasons.push('MTF 정렬 양호');
  else reasons.push('MTF 정렬 약함/충돌');

  const zc = input.zoneBiasCard;
  if (zc?.side === 'LONG') {
    longScore += clamp(zc.confidence / 6, 0, 16);
    reasons.push('근접 OB 롱 감시구간');
  } else if (zc?.side === 'SHORT') {
    shortScore += clamp(zc.confidence / 6, 0, 16);
    reasons.push('근접 OB 숏 감시구간');
  }

  const sb = input.structureBouncePath;
  if (sb?.bias === 'up') {
    longScore += 8;
    reasons.push('세트반등 경로 상방');
  } else if (sb?.bias === 'down') {
    shortScore += 8;
    reasons.push('세트반등 경로 하방');
  } else if (sb?.bias === 'range') {
    reasons.push('세트반등 횡보 구간');
  }

  longScore = clamp(Math.round(longScore), 0, 100);
  shortScore = clamp(Math.round(shortScore), 0, 100);
  const gap = Math.abs(longScore - shortScore);
  let verdict: Verdict = 'WATCH';
  if (gap >= 8) verdict = longScore > shortScore ? 'LONG' : 'SHORT';

  const side: Side | null = verdict === 'WATCH' ? null : verdict;
  const tp1Raw = parseFloat(String((input.targets ?? [])[0] ?? ''));
  const tp1 = Number.isFinite(tp1Raw) && tp1Raw > 0 ? tp1Raw : null;
  let zone: AiZoneSignal['zone'] = null;
  if (side) {
    if (zc && zc.side === side) {
      const role: ZoneRole =
        side === 'LONG'
          ? (Math.abs((input.currentPrice ?? 0) - Math.max(zc.low, zc.high)) / Math.max(1e-9, input.currentPrice ?? 1) <= 0.003
            ? 'support_reaction'
            : 'reentry')
          : (Math.abs((input.currentPrice ?? 0) - Math.min(zc.low, zc.high)) / Math.max(1e-9, input.currentPrice ?? 1) <= 0.003
            ? 'resistance_reaction'
            : 'reentry');
      const strengthScore = clamp(
        Math.round(
          35 +
            zc.confidence * 0.45 +
            Math.min(20, gates * 3) +
            (mtfAligned ? 8 : -6) +
            (sb?.bias === (side === 'LONG' ? 'up' : 'down') ? 8 : 0)
        ),
        20,
        98
      );
      zone = {
        side,
        low: Math.min(zc.low, zc.high),
        high: Math.max(zc.low, zc.high),
        role,
        strengthScore,
        invalidation:
          side === 'LONG'
            ? (zc.invalidateBelow ?? input.invalidationLevel?.price ?? null)
            : (zc.invalidateAbove ?? input.invalidationLevel?.price ?? null),
        targetHint: tp1,
      };
    } else {
      const lv = side === 'LONG' ? input.supportLevel?.price : input.resistanceLevel?.price;
      if (lv && Number.isFinite(lv) && lv > 0) {
        const pad = lv * 0.0013;
        const strengthScore = clamp(
          Math.round(34 + Math.min(20, gates * 3) + (mtfAligned ? 8 : -6) + (side === input.verdict ? 8 : 0)),
          20,
          90
        );
        zone = {
          side,
          low: lv - pad,
          high: lv + pad,
          role: 'breakout_retest',
          strengthScore,
          invalidation: input.invalidationLevel?.price ?? null,
          targetHint: tp1,
        };
      }
    }
  }

  const confidenceBase = side === 'LONG' ? longScore : side === 'SHORT' ? shortScore : 50 + Math.max(0, 10 - gap);
  const confidence = clamp(Math.round(confidenceBase), 35, 95);
  const structurePass = gates >= 3;
  const zoneReactionPass = Boolean(zone);
  const invalidationFixed = zone?.invalidation != null;
  const stage: AiZoneStage =
    side && structurePass && zoneReactionPass && mtfAligned && invalidationFixed
      ? 'confirmed'
      : side && ((gates >= 2 && zoneReactionPass) || (gates >= 3 && invalidationFixed))
        ? 'prepared'
        : 'opinion';

  const scenarios: AiZoneSignal['scenarios'] = [
    {
      name: 'A',
      direction: side ?? 'WATCH',
      summary:
        side && zone
          ? `${side} 존(${zone.role}) 반응 유지 시 ${stage === 'confirmed' ? '확정 지속' : '단계 상승'}`
          : '방향 우세가 약해 관망',
      invalidation: zone?.invalidation ?? null,
    },
    {
      name: 'B',
      direction: side === 'LONG' ? 'SHORT' : side === 'SHORT' ? 'LONG' : 'WATCH',
      summary:
        zone?.invalidation != null
          ? `무효가 ${zone.invalidation.toLocaleString()} 종가 이탈 시 반대/관망 전환`
          : '무효가 미확정 — 확정 단계로 올리기 전 재검증',
      invalidation: zone?.invalidation ?? null,
    },
  ];

  return {
    verdict,
    confidence,
    longScore,
    shortScore,
    stage,
    confirmation: { structure: structurePass, zoneReaction: zoneReactionPass, mtfAligned, invalidationFixed },
    zone,
    scenarios,
    reasons,
  };
}

