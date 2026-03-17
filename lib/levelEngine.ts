/**
 * 핵심 가격 조건 레벨 엔진
 * - breakoutLevel: 돌파 시 상승 확정으로 볼 수 있는 가격
 * - supportLevel: 지켜야 하는 지지
 * - resistanceLevel: 저항
 * - invalidationLevel: 이탈 시 하락 확정으로 볼 수 있는 가격
 * - reclaimLevel: 회복 시 다시 상승 시나리오로 전환되는 가격
 */

export type LevelEngineInput = {
  currentPrice: number;
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  /** 최근 스윕 고점들 (가격만) */
  swingHighs: number[];
  /** 최근 스윕 저점들 (가격만) */
  swingLows: number[];
  /** EQH 가격들 */
  eqhPrices: number[];
  /** EQL 가격들 */
  eqlPrices: number[];
  /** FVG 상단/하단 (bullish: low/high, bearish: high/low) */
  fvgBoundaries: Array<{ low: number; high: number; bias: 'bullish' | 'bearish' }>;
  /** OB 범위 */
  obRanges: Array<{ low: number; high: number }>;
  /** 유동성 풀 가격 (스윕된 고/저) */
  liquidityPoolPrices: number[];
  /** 추세 */
  trend: 'bullish' | 'bearish' | 'range';
};

export type LevelResult = {
  price: number;
  reason: string;
};

export type LevelEngineOutput = {
  breakoutLevel: LevelResult | null;
  supportLevel: LevelResult | null;
  resistanceLevel: LevelResult | null;
  invalidationLevel: LevelResult | null;
  reclaimLevel: LevelResult | null;
  reasons: string[];
};

const PRICE_TOL = 0.002;
const MAX_LEVELS = 5;

function dedupePrices(prices: number[], tol = PRICE_TOL): number[] {
  const out: number[] = [];
  for (const p of prices.sort((a, b) => a - b)) {
    if (out.length === 0 || Math.abs(p - out[out.length - 1]) / (out[out.length - 1] || 1) > tol) {
      out.push(p);
    }
  }
  return out;
}

function nearestAbove(price: number, candidates: number[]): number | null {
  const above = candidates.filter(c => c > price);
  return above.length > 0 ? Math.min(...above) : null;
}

function nearestBelow(price: number, candidates: number[]): number | null {
  const below = candidates.filter(c => c < price);
  return below.length > 0 ? Math.max(...below) : null;
}

export function computeLevels(input: LevelEngineInput): LevelEngineOutput {
  const {
    currentPrice,
    rangeHigh,
    rangeLow,
    equilibrium,
    swingHighs,
    swingLows,
    eqhPrices,
    eqlPrices,
    fvgBoundaries,
    obRanges,
    liquidityPoolPrices,
    trend,
  } = input;

  const reasons: string[] = [];
  const allResistance = dedupePrices([
    ...swingHighs,
    ...eqhPrices,
    rangeHigh,
    ...fvgBoundaries.filter(f => f.bias === 'bearish').map(f => f.low),
    ...obRanges.map(o => o.high),
    ...liquidityPoolPrices.filter(p => p > currentPrice),
  ].filter(p => p > currentPrice));

  const allSupport = dedupePrices([
    ...swingLows,
    ...eqlPrices,
    rangeLow,
    ...fvgBoundaries.filter(f => f.bias === 'bullish').map(f => f.high),
    ...obRanges.map(o => o.low),
    ...liquidityPoolPrices.filter(p => p < currentPrice),
  ].filter(p => p < currentPrice));

  // Breakout: 상승하려면 돌파해야 할 가장 가까운 저항
  const breakoutPrice = nearestAbove(currentPrice, allResistance);
  const breakoutLevel: LevelResult | null = breakoutPrice != null
    ? { price: breakoutPrice, reason: '저항(EQH/스윕고점/레인지상단) 돌파 시 상승 확정' }
    : null;
  if (breakoutPrice != null) reasons.push(`Breakout: ${breakoutPrice.toFixed(2)}`);

  // Support: 지켜야 하는 가장 가까운 지지
  const supportPrice = nearestBelow(currentPrice, allSupport);
  const supportLevel: LevelResult | null = supportPrice != null
    ? { price: supportPrice, reason: '지지(EQL/스윕저점/FVG하단) 유지 필요' }
    : null;
  if (supportPrice != null) reasons.push(`Support: ${supportPrice.toFixed(2)}`);

  // Resistance: 현재가 위 가장 가까운 저항 (breakout과 동일 후보일 수 있음)
  const resistancePrice = breakoutPrice ?? nearestAbove(currentPrice, [rangeHigh, equilibrium, ...swingHighs].filter(p => p > currentPrice));
  const resistanceLevel: LevelResult | null = resistancePrice != null
    ? { price: resistancePrice, reason: '저항선' }
    : null;

  // Invalidation: 이 가격 이탈 시 하락 확정 (롱 무효화)
  const invalidationPrice = supportPrice ?? nearestBelow(currentPrice, [rangeLow, equilibrium]);
  const invalidationLevel: LevelResult | null = invalidationPrice != null
    ? { price: invalidationPrice, reason: '이탈 시 하락 확정(롱 무효화)' }
    : null;
  if (invalidationPrice != null) reasons.push(`Invalidation: ${invalidationPrice.toFixed(2)}`);

  // Reclaim: 이 가격 회복 시 다시 상승 시나리오
  const reclaimPrice = breakoutPrice ?? equilibrium;
  const reclaimLevel: LevelResult | null = reclaimPrice != null && reclaimPrice > currentPrice
    ? { price: reclaimPrice, reason: '회복 시 상승 시나리오 재개' }
    : null;

  return {
    breakoutLevel,
    supportLevel,
    resistanceLevel,
    invalidationLevel,
    reclaimLevel,
    reasons,
  };
}
