import type { Strategy } from './strategyGenerator';

export type StrategyPerformance = {
  strategy: Strategy;
  winRate: number;
  avgRR: number;
  drawdown: number;
  samples: number;
};

export function simulateStrategy(_strategy: Strategy, _trades: unknown[]): StrategyPerformance {
  return {
    strategy: _strategy,
    winRate: 0,
    avgRR: 0,
    drawdown: 0,
    samples: 0,
  };
}

export function calculateStrategyPerformance(performances: StrategyPerformance[]): StrategyPerformance[] {
  return performances.sort((a, b) => b.winRate - a.winRate);
}
