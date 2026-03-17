import type { TradeRecord } from './backtestEngine';

export function calculateWinRates(records: TradeRecord[]): { overall: number; byPattern: Record<string, number>; count: number } {
  const completed = records.filter(r => r.result !== 'pending');
  const wins = completed.filter(r => r.result === 'win').length;
  const byPattern: Record<string, { w: number; n: number }> = {};
  for (const r of completed) {
    const key = r.patternTags.length ? r.patternTags[0] : 'default';
    if (!byPattern[key]) byPattern[key] = { w: 0, n: 0 };
    byPattern[key].n++;
    if (r.result === 'win') byPattern[key].w++;
  }
  const byPatternRate: Record<string, number> = {};
  for (const [k, v] of Object.entries(byPattern)) byPatternRate[k] = v.n ? (v.w / v.n) * 100 : 0;
  return {
    overall: completed.length ? (wins / completed.length) * 100 : 0,
    byPattern: byPatternRate,
    count: completed.length,
  };
}

export function updateProbabilityWeights(_records: TradeRecord[]): Record<string, number> {
  return {};
}
