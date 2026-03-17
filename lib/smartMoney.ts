export type SmartMoneyResult = {
  bos: number;
  choch: number;
  orderBlocks: number;
  breaker: number;
  mitigation: number;
  reaccumulation: number;
  redistribution: number;
  score: number;
};

export function analyzeSmartMoney(engine: Record<string, any>): SmartMoneyResult {
  const bos = (engine.bos || []).length;
  const choch = (engine.choch || []).length;
  const obs = (engine.obs || []).length;
  const fvg = (engine.fvg || []).length;
  const sweeps = (engine.sweeps || []).length;
  const trend = engine.trend || 'range';
  let breaker = 0;
  let mitigation = 0;
  let reaccumulation = 0;
  let redistribution = 0;
  if (trend === 'bullish') {
    reaccumulation = Math.min(2, obs + fvg);
    mitigation = sweeps;
  } else if (trend === 'bearish') {
    redistribution = Math.min(2, obs + fvg);
    mitigation = sweeps;
  }
  breaker = choch;
  const score = bos * 3 + choch * 2 + obs + fvg * 0.5 + sweeps + reaccumulation + redistribution;
  return {
    bos,
    choch,
    orderBlocks: obs,
    breaker,
    mitigation,
    reaccumulation,
    redistribution,
    score: Math.round(score),
  };
}
