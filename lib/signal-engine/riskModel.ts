type RiskInput = {
  totalSeed: number;
  entryPrice: number;
  stopPrice: number;
  direction: 'LONG' | 'SHORT';
};

export function riskModel(input: RiskInput) {
  const totalSeed = Math.max(1, input.totalSeed);
  const entry = input.entryPrice;
  const stop = input.stopPrice;
  const riskAmount = totalSeed * 0.05;
  const stopDistancePercent = Math.max(1e-9, Math.abs(entry - stop) / Math.max(1e-9, entry));
  const positionSize = riskAmount / stopDistancePercent;
  const leverageRaw = positionSize / totalSeed;
  const leverage = Math.max(1, Math.min(20, Number(leverageRaw.toFixed(2))));
  const riskDist = Math.abs(entry - stop);
  const tp1 = input.direction === 'LONG' ? entry + riskDist : entry - riskDist;
  const tp2 = input.direction === 'LONG' ? entry + riskDist * 2 : entry - riskDist * 2;
  const tp3 = input.direction === 'LONG' ? entry + riskDist * 3 : entry - riskDist * 3;
  const rr = riskDist > 0 ? Math.abs(tp1 - entry) / riskDist : 0;
  const spotProfitPct = input.direction === 'LONG'
    ? [tp1, tp2, tp3].map((tp) => ((tp - entry) / entry) * 100)
    : [tp1, tp2, tp3].map((tp) => ((entry - tp) / entry) * 100);
  const spotLossPct = Math.abs(entry - stop) / entry * 100;
  const futuresProfitPct = spotProfitPct.map((p) => p * leverage);
  const futuresLossPct = spotLossPct * leverage;

  return {
    totalSeed,
    riskAmount,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    rr,
    leverage,
    positionSize,
    spotProfitPct,
    spotLossPct,
    futuresProfitPct,
    futuresLossPct,
  };
}
