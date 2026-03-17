export type PositionInput = {
  balance: number;
  riskPercent: number;
  leverage: number;
  entry: number;
  stop: number;
  targets: number[];
};

export type PositionResult = {
  positionSize: number;
  rrRatio: number;
  liquidationPrice: number;
  profitEstimate: number;
};

export function calculatePositionSize(
  balance: number,
  riskPercent: number,
  entry: number,
  stop: number,
  leverage: number
): number {
  const riskAmount = balance * (riskPercent / 100);
  const riskPerUnit = Math.abs(entry - stop) / entry;
  if (riskPerUnit <= 0) return 0;
  return (riskAmount / riskPerUnit) * leverage;
}

export function calculateRiskReward(entry: number, stop: number, targets: number[]): number {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  const avgTarget = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : entry;
  const reward = Math.abs(avgTarget - entry);
  return reward / risk;
}
