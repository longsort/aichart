import type { PositionInput, PositionResult } from './positionManager';
import { calculatePositionSize, calculateRiskReward } from './positionManager';

export function simulateTrade(input: PositionInput): PositionResult {
  const { balance, riskPercent, leverage, entry, stop, targets } = input;
  const positionSize = calculatePositionSize(balance, riskPercent, entry, stop, leverage);
  const rrRatio = calculateRiskReward(entry, stop, targets);
  const liqDistance = entry * (1 / leverage);
  const liquidationPrice = entry > stop ? entry - liqDistance : entry + liqDistance;
  const avgTp = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : entry * 1.02;
  const profitEstimate = ((avgTp - entry) / entry) * positionSize;
  return {
    positionSize: Math.round(positionSize * 100) / 100,
    rrRatio: Math.round(rrRatio * 100) / 100,
    liquidationPrice: Math.round(liquidationPrice * 2) / 2,
    profitEstimate: Math.round(profitEstimate * 100) / 100,
  };
}

export function detectLiquidationRisk(entry: number, stop: number, leverage: number): number {
  const liqDist = entry * (1 / leverage);
  const stopDist = Math.abs(entry - stop);
  return stopDist <= 0 ? 0 : Math.min(100, (liqDist / stopDist) * 50);
}
