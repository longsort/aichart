import type { AnalyzeResponse } from '@/types';
import type { PatternFeatures } from '@/types/pattern';

export type NormalizedCurrentPattern = {
  symbol: string;
  timeframe: string;
  verdict: string;
  confidence: number;
  features: PatternFeatures;
};

export function normalizeCurrentPattern(analysis: AnalyzeResponse | null): NormalizedCurrentPattern | null {
  if (!analysis?.engine) return null;
  const e = analysis.engine as Record<string, any>;
  const bosCount = (e.bos || []).length;
  const chochCount = (e.choch || []).length;
  const fvgCount = (e.fvg || []).length;
  const obCount = (e.obs || []).length;
  const sweepCount = (e.sweeps || []).length;
  const eqhCount = (e.eqh || []).length;
  const eqlCount = (e.eql || []).length;
  const patterns = (e.patterns || []) as Array<{ type?: string; bias?: string }>;
  const patternType = patterns.length ? (patterns[0]?.type || '') : '';
  const trend = e.trend || 'range';
  const trendBias: 'bullish' | 'bearish' | 'neutral' = trend === 'bullish' ? 'bullish' : trend === 'bearish' ? 'bearish' : 'neutral';
  const premium = e.premium ?? 0;
  const discount = e.discount ?? 0;
  const eq = e.equilibrium;
  const premiumDiscountState = eq != null ? `premium=${premium} discount=${discount} eq=${eq}` : 'unknown';
  const engineScore = Math.round(e.score ?? 0);

  return {
    symbol: analysis.symbol,
    timeframe: analysis.timeframe,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    features: {
      bosCount,
      chochCount,
      fvgCount,
      obCount,
      sweepCount,
      eqhCount,
      eqlCount,
      patternType,
      premiumDiscountState,
      trendBias,
      engineScore,
    },
  };
}
