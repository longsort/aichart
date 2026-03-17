import type { PatternReference, PatternFeatures, LearnedPatternMatch } from '@/types/pattern';
import type { NormalizedCurrentPattern } from './patternNormalizer';
import { loadPatterns } from './patternStore';

const MIN_SCORE = 0.15;
const TOP_N = 5;

function scoreMatch(current: PatternFeatures, ref: PatternReference): { score: number; reasons: string[] } {
  const f = ref.features;
  let score = 0;
  const reasons: string[] = [];
  const w = 1 / 10;

  if (f.bosCount !== undefined && current.bosCount >= f.bosCount) { score += w; reasons.push('BOS'); }
  if (f.chochCount !== undefined && current.chochCount >= f.chochCount) { score += w; reasons.push('CHOCH'); }
  if (f.fvgCount !== undefined && current.fvgCount >= Math.max(0, f.fvgCount - 1)) { score += w; reasons.push('FVG'); }
  if (f.obCount !== undefined && current.obCount >= Math.max(0, f.obCount - 1)) { score += w; reasons.push('OB'); }
  if (f.sweepCount !== undefined && current.sweepCount >= f.sweepCount) { score += w; reasons.push('스윕'); }
  if (f.eqhCount !== undefined && current.eqhCount >= f.eqhCount) score += w * 0.5;
  if (f.eqlCount !== undefined && current.eqlCount >= f.eqlCount) score += w * 0.5;
  if (f.patternType && current.patternType && (current.patternType === f.patternType || current.patternType.includes(f.patternType))) { score += w; reasons.push('패턴'); }
  if (f.trendBias && current.trendBias === f.trendBias) { score += w; reasons.push('방향'); }
  const scoreRange = Math.abs((f.engineScore ?? 0) - current.engineScore);
  if (scoreRange <= 15) { score += w * 0.7; reasons.push('엔진점수'); }

  const final = Math.min(1, score + 0.12);
  return { score: final, reasons };
}

export function recallTopPatterns(
  normalized: NormalizedCurrentPattern | null,
  patterns?: PatternReference[],
  limit = TOP_N
): LearnedPatternMatch[] {
  if (!normalized) return [];
  const library = patterns ?? loadPatterns();
  if (!library.length) return [];

  const scored = library.map(ref => {
    const { score, reasons } = scoreMatch(normalized.features, ref);
    return {
      id: ref.id,
      title: ref.title,
      score,
      patternType: ref.patternType,
      bias: ref.bias,
      reason: reasons.length ? `현재 구조와 ${reasons.join('/')} 유사` : '구조 일부 유사',
      outcome: ref.outcome,
      briefing: ref.briefing,
      description: ref.description,
      features: ref.features,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score >= MIN_SCORE)
    .slice(0, limit)
    .map(({ id, title, score, patternType, bias, reason, outcome, briefing, description, features }) => ({
      id,
      title,
      score,
      patternType,
      bias,
      reason,
      outcome,
      briefing,
      description,
      features,
    }));
}

export function buildRecallSummary(matches: LearnedPatternMatch[]): string {
  if (!matches.length) return '';
  const top = matches[0];
  const pct = Math.round(top.score * 100);
  return `현재 구조는 ${top.title} 패턴과 ${pct}% 유사`;
}
