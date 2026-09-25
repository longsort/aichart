/**
 * Doksuri-1 — 학습표본 통계 단위 분리 (7390%류 금지).
 * 실행: npx tsx scripts/assert-doksuri1-learning-stats.ts
 */
import { buildDoksuri1LearningStats } from '../lib/doksuri1/learningStats';
import type { AnalyzeResponse } from '../types';

function main() {
  const a = {
    signalLearning: {
      longCount: 10,
      shortCount: 8,
      tp1Count: 12,
      slCount: 6,
      successRate: 66.7,
    },
  } as AnalyzeResponse;
  const s = buildDoksuri1LearningStats(a);
  if (!s.lineKo?.includes('표본 n=18')) throw new Error('n fail ' + s.lineKo);
  if (s.tp1ReachPct !== 66.7) throw new Error('tp1 ' + s.tp1ReachPct);
  if (s.slReachPct !== 33.3) throw new Error('sl ' + s.slReachPct);
  if (s.profitFactor !== 2) throw new Error('pf ' + s.profitFactor);
  if (s.lineKo?.includes('%배') || /PF\s+\d+%/.test(s.lineKo || '')) {
    throw new Error('pf unit wrong');
  }
  console.log('ok', s.lineKo);
}

main();
