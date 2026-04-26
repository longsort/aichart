import type { MarketDataInput } from './types';

export function contextFilter(input: MarketDataInput) {
  let contextScore = 0;
  const reasons: Array<{ code: string; label: string; score: number }> = [];

  if (input.htfBias === 'bullish' || input.htfBias === 'bearish') {
    contextScore += 15;
    reasons.push({ code: 'CTX_HTF_ALIGN', label: 'HTF 정렬', score: 15 });
  }
  if (input.regime === 'trend') {
    contextScore += 10;
    reasons.push({ code: 'CTX_REGIME_OK', label: '레짐 우호', score: 10 });
  }
  if (input.premiumDiscount === 'discount' || input.premiumDiscount === 'premium') {
    contextScore += 8;
    reasons.push({ code: 'CTX_PD_ALIGN', label: 'Premium/Discount 정렬', score: 8 });
  }

  return { contextScore, reasons };
}
