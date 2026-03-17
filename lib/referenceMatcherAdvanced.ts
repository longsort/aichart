import { getReferenceLibrary } from './referenceLibraryStore';
import type { ReferenceItem, StructureFeatures } from '@/types/reference';

export type TopReferenceMatch = {
  id: string;
  title: string;
  score: number;
  tags: string[];
  reason: string;
  outcome?: string;
};

function engineToFeatures(engine: Record<string, any>): StructureFeatures & { score: number } {
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

function similarity(a: StructureFeatures & { score?: number }, ref: ReferenceItem): { score: number; reasons: string[] } {
  const f = ref.structureFeatures;
  let score = 0;
  const reasons: string[] = [];
  const w = 1 / 7;
  if (f.bos !== undefined && !!a.bos === f.bos) { score += w; reasons.push('BOS'); }
  if (f.choch !== undefined && !!a.choch === f.choch) { score += w; reasons.push('CHOCH'); }
  if (f.fvg !== undefined && (a.fvg ?? 0) >= (f.fvg ?? 0)) { score += w; reasons.push('FVG'); }
  if (f.ob !== undefined && (a.ob ?? 0) >= (f.ob ?? 0)) { score += w; reasons.push('OB'); }
  if (f.sweep !== undefined && !!a.sweep === f.sweep) { score += w; reasons.push('스윕'); }
  if (f.pattern && a.pattern && (a.pattern === f.pattern || a.pattern.includes(f.pattern))) { score += w; reasons.push('패턴'); }
  if (f.bias && a.bias === f.bias) { score += w; reasons.push('방향'); }
  if (f.eqh !== undefined && !!a.eqh === f.eqh) score += w * 0.5;
  if (f.eql !== undefined && !!a.eql === f.eql) score += w * 0.5;
  return { score: Math.min(1, score + 0.1), reasons };
}

export function matchTopReferences(engine: Record<string, any>, limit = 3): TopReferenceMatch[] {
  const current = engineToFeatures(engine);
  const library = getReferenceLibrary();
  const results = library.map(ref => {
    const { score, reasons } = similarity(current, ref);
    return {
      id: ref.id,
      title: ref.title,
      score,
      tags: ref.tags,
      reason: reasons.length ? `현재 구조와 ${reasons.join('/')} 유사` : '구조 일부 유사',
      outcome: ref.outcome,
    };
  });
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter(r => r.score >= 0.2);
}
