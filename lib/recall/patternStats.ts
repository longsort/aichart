import { loadPatterns } from './patternStore';
import type { PatternReference } from '@/types/pattern';

export type PatternLibraryStats = {
  total: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  topPatternTypes: Array<{ type: string; count: number }>;
  topOutcomes: Array<{ outcome: string; count: number }>;
};

export function getPatternStats(): PatternLibraryStats {
  const patterns = loadPatterns();
  const total = patterns.length;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  const typeCount: Record<string, number> = {};
  const outcomeCount: Record<string, number> = {};

  for (const p of patterns) {
    if (p.bias === 'bullish') bullishCount++;
    else if (p.bias === 'bearish') bearishCount++;
    else neutralCount++;
    const t = p.patternType || '(none)';
    typeCount[t] = (typeCount[t] || 0) + 1;
    const o = (p.outcome || '').slice(0, 40);
    if (o) outcomeCount[o] = (outcomeCount[o] || 0) + 1;
  }

  const topPatternTypes = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const topOutcomes = Object.entries(outcomeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([outcome, count]) => ({ outcome, count }));

  return {
    total,
    bullishCount,
    bearishCount,
    neutralCount,
    topPatternTypes,
    topOutcomes,
  };
}
