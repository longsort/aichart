import type { EngineMvpInput, ZoneSignalPack } from '@/engine/types';

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

export function computeZoneSignal(input: EngineMvpInput): ZoneSignalPack {
  const reasons: string[] = [];
  const labels: string[] = [];
  let score = 50;
  const sens = Math.max(0.7, Math.min(1.3, input.zoneSensitivity ?? 1));
  const htfAlignedLong = input.htfBias === 'bullish' && input.verdict === 'LONG';
  const htfAlignedShort = input.htfBias === 'bearish' && input.verdict === 'SHORT';
  if (htfAlignedLong || htfAlignedShort) {
    score += 20 * sens;
    reasons.push('HTF 방향 일치');
  }
  if ((input.fvgCount ?? 0) > 0 || (input.obCount ?? 0) > 0) {
    score += 15 * sens;
    reasons.push('FVG/OB 반응');
  }
  if ((input.bosCount ?? 0) > 0) {
    score += 15 * sens;
    reasons.push('BOS 이후 흐름 확인');
  }
  if ((input.chochCount ?? 0) > 0 && input.ltfBias && input.ltfBias !== 'range') {
    score += 15 * sens;
    reasons.push('하위 TF CHoCH 확인');
  }
  const levelProb =
    input.verdict === 'LONG'
      ? Math.max(input.supportLevelProbability ?? 0, input.breakoutLevelProbability ?? 0)
      : input.verdict === 'SHORT'
        ? Math.max(input.resistanceLevelProbability ?? 0, input.invalidationLevelProbability ?? 0)
        : 0;
  if (levelProb >= 70) {
    score += 10 * sens;
    reasons.push('지지/저항 명확');
  }
  if ((input.entryHoldProbability ?? 0) >= 70) {
    score += 10 * sens;
    reasons.push('체결 후 유지 확률 양호');
  }

  const rr = input.rr ?? null;
  if (rr != null && rr < 1.5) {
    score -= 15 / sens;
    reasons.push('RR 불량');
    labels.push('LOW RR');
  }

  if (input.htfBias && input.ltfBias && input.htfBias !== 'range' && input.ltfBias !== 'range' && input.htfBias !== input.ltfBias) {
    score -= 12 / sens;
    reasons.push('상하위 TF 충돌');
  }

  score = clamp(score);
  const bucket: ZoneSignalPack['bucket'] =
    score >= 85 ? 'strong' : score >= 70 ? 'valid' : score >= 50 ? 'normal' : 'invalid';

  let zone: ZoneSignalPack['zone'] = 'wait';
  if ((input.verdict === 'LONG' && (htfAlignedLong || score >= 85)) && score >= 70) {
    zone = 'long_confirm';
    labels.push('LONG CONFIRM');
  } else if ((input.verdict === 'SHORT' && (htfAlignedShort || score >= 85)) && score >= 70) {
    zone = 'short_confirm';
    labels.push('SHORT CONFIRM');
  } else {
    labels.push('WAIT');
    const px = input.currentPrice ?? null;
    const s = input.supportLevel ?? null;
    const r = input.resistanceLevel ?? null;
    if (px != null && s != null && r != null && r > s) {
      const pos = (px - s) / (r - s);
      if (pos > 0.42 && pos < 0.58) {
        reasons.push('박스 중앙가(애매한 자리)');
      }
      const distTop = Math.abs(r - px) / Math.max(1e-9, px);
      const distBot = Math.abs(px - s) / Math.max(1e-9, px);
      if (distTop <= 0.004 || distBot <= 0.004) {
        reasons.push('직상/직하단 리스크 큼');
        labels.push('HIGH RISK');
        score = Math.max(0, score - 8);
      }
    }
  }

  const entry = input.entry ?? null;
  const stop = input.stop ?? null;
  const target1 = input.targets?.[0] ?? null;
  const pad = entry ? Math.max(entry * 0.0015, 1e-9) : null;
  const entryZone: [number, number] | null = entry && pad ? [entry - pad, entry + pad] : null;
  const stopZone: [number, number] | null = stop ? [stop * 0.999, stop * 1.001] : null;
  const targets = input.targets?.slice(0, 3) ?? (target1 ? [target1] : []);

  return {
    zone,
    score,
    bucket,
    reasons: reasons.slice(0, 8),
    entryZone,
    stopZone,
    targets,
    riskReward: rr,
    labels,
  };
}
