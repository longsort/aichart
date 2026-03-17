import type { AnalyzeResponse } from '@/types';
import type { Pattern, StructureFeatures } from '@/types/reference';

export type SimilarPatternMatch = {
  id: string;
  title: string;
  score: number;
  tags: string[];
  outcome: string;
  briefing: string;
};

/**
 * 현재 분석 결과(engine)를 패턴 매칭용 features 구조로 변환
 */
export function analysisToFeatures(analysis: AnalyzeResponse | null): StructureFeatures & { score?: number } {
  if (!analysis?.engine) {
    return { bos: false, choch: false, fvg: 0, ob: 0, sweep: false, pattern: '', bias: 'neutral' };
  }
  const engine = analysis.engine as Record<string, any>;
  const bos = (engine.bos || []).length > 0;
  const choch = (engine.choch || []).length > 0;
  const fvg = (engine.fvg || []).length;
  const ob = (engine.obs || []).length;
  const sweep = (engine.sweeps || []).length > 0;
  const eqh = (engine.eqh || []).length > 0;
  const eql = (engine.eql || []).length > 0;
  const patterns = (engine.patterns || []) as Array<{ type?: string; bias?: string }>;
  const pattern = patterns.length ? (patterns[0]?.type || '') : '';
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (engine.trend === 'bullish') bias = 'bullish';
  if (engine.trend === 'bearish') bias = 'bearish';
  return { bos, choch, fvg, ob, sweep, eqh, eql, pattern, bias, score: engine.score ?? 0 };
}

function similarityScore(current: StructureFeatures & { score?: number }, pattern: Pattern): number {
  const f = pattern.features;
  let score = 0;
  const weight = 1 / 8;
  if (f.bos !== undefined && !!current.bos === f.bos) score += weight;
  if (f.choch !== undefined && !!current.choch === f.choch) score += weight;
  if (f.fvg !== undefined && (current.fvg ?? 0) >= (f.fvg ?? 0)) score += weight;
  if (f.ob !== undefined && (current.ob ?? 0) >= (f.ob ?? 0)) score += weight;
  if (f.sweep !== undefined && !!current.sweep === f.sweep) score += weight;
  if (f.pattern && current.pattern && (current.pattern === f.pattern || current.pattern.includes(f.pattern))) score += weight;
  if (f.bias && current.bias === f.bias) score += weight;
  if (f.eqh !== undefined && !!current.eqh === f.eqh) score += weight * 0.5;
  if (f.eql !== undefined && !!current.eql === f.eql) score += weight * 0.5;
  return Math.min(1, score + 0.15);
}

/**
 * 현재 분석 결과와 학습된 패턴 목록을 비교해 유사도 Top N 반환
 */
export function getTopSimilarPatterns(
  analysis: AnalyzeResponse | null,
  patterns: Pattern[],
  limit = 3
): SimilarPatternMatch[] {
  if (!analysis || !patterns.length) return [];
  const current = analysisToFeatures(analysis);
  const scored = patterns.map(p => ({
    ...p,
    score: similarityScore(current, p),
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter(r => r.score >= 0.2)
    .map(({ id, title, score, tags, outcome, briefing }) => ({
      id,
      title,
      score,
      tags,
      outcome,
      briefing,
    }));
}
