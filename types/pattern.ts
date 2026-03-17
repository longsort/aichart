/** 패턴 레퍼런스 저장 구조 (이미지/텍스트/과거 브리핑 기반) */
export type PatternFeatures = {
  bosCount: number;
  chochCount: number;
  fvgCount: number;
  obCount: number;
  sweepCount: number;
  eqhCount: number;
  eqlCount: number;
  patternType: string;
  premiumDiscountState: string;
  trendBias: 'bullish' | 'bearish' | 'neutral';
  engineScore: number;
};

export type PatternReference = {
  id: string;
  title: string;
  sourceType: 'image' | 'text' | 'briefing' | 'auto';
  description?: string;
  tags: string[];
  timeframe?: string;
  symbol?: string;
  patternType?: string;
  bias?: 'bullish' | 'bearish' | 'neutral';
  features: PatternFeatures;
  outcome: string;
  briefing: string;
  imagePath?: string;
  imageMeta?: { width?: number; height?: number; mime?: string };
  createdAt: string;
};

/** 유사 패턴 Top N 반환 항목 */
export type LearnedPatternMatch = {
  id: string;
  title: string;
  score: number;
  patternType?: string;
  bias?: string;
  reason: string;
  outcome: string;
  briefing: string;
  description?: string;
  features?: PatternFeatures;
};
