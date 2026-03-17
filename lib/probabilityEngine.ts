export type ProbabilityResult = {
  longProbability: number;
  shortProbability: number;
  score: number;
  reason: string[];
};

export function computeTradeProbability(
  verdict: string,
  confidence: number,
  engine: Record<string, any>,
  topRefScore: number,
  mtfAlignment: number
): ProbabilityResult {
  const reasons: string[] = [];
  let longP = 50;
  let shortP = 50;
  if (verdict === 'LONG') {
    longP = Math.min(90, 45 + confidence * 0.4 + (topRefScore || 0) * 10 + mtfAlignment * 0.2);
    shortP = 100 - longP;
    reasons.push('구조 롱', `신뢰도 ${confidence}%`, `MTF 정렬 ${mtfAlignment}%`);
  } else if (verdict === 'SHORT') {
    shortP = Math.min(90, 45 + confidence * 0.4 + (topRefScore || 0) * 10 + mtfAlignment * 0.2);
    longP = 100 - shortP;
    reasons.push('구조 숏', `신뢰도 ${confidence}%`, `MTF 정렬 ${mtfAlignment}%`);
  }
  const score = longP - shortP;
  return {
    longProbability: Math.round(longP),
    shortProbability: Math.round(shortP),
    score,
    reason: reasons.slice(0, 5),
  };
}
