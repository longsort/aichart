import type { StrategyPerformance } from './strategyBacktester';

export function rankStrategies(performances: StrategyPerformance[]): StrategyPerformance[] {
  return [...performances].sort((a, b) => {
    const scoreA = a.winRate * 0.5 + Math.min(a.avgRR, 3) * 20;
    const scoreB = b.winRate * 0.5 + Math.min(b.avgRR, 3) * 20;
    return scoreB - scoreA;
  });
}
