export type MTFResult = {
  htfBias: 'bullish' | 'bearish' | 'range';
  mtfBias: 'bullish' | 'bearish' | 'neutral';
  ltfBias: 'bullish' | 'bearish' | 'neutral';
  mtfStructure: string;
  ltfEntryBias: 'long' | 'short' | 'neutral';
  alignmentScore: number;
  summary: string;
};

export function computeMTF(
  htfTrend: string | null,
  ltfTrend: string | null,
  verdict: string
): MTFResult {
  const htfBias = (htfTrend === 'bullish' || htfTrend === 'bearish') ? htfTrend : 'range';
  const mtfBias = htfTrend === 'bullish' ? 'bullish' : htfTrend === 'bearish' ? 'bearish' : 'neutral';
  const ltfBias = ltfTrend === 'bullish' ? 'bullish' : ltfTrend === 'bearish' ? 'bearish' : 'neutral';
  const mtfStructure = htfTrend && ltfTrend ? `${htfTrend} / ${ltfTrend}` : '-';
  let ltfEntryBias: 'long' | 'short' | 'neutral' = 'neutral';
  if (verdict === 'LONG') ltfEntryBias = 'long';
  else if (verdict === 'SHORT') ltfEntryBias = 'short';
  let alignmentScore = 50;
  if (htfBias === 'bullish' && ltfEntryBias === 'long') alignmentScore = 85;
  else if (htfBias === 'bearish' && ltfEntryBias === 'short') alignmentScore = 85;
  else if (htfBias === 'bullish' && ltfEntryBias === 'short') alignmentScore = 35;
  else if (htfBias === 'bearish' && ltfEntryBias === 'long') alignmentScore = 35;
  const summary = `HTF ${htfBias} · LTF ${ltfBias} · 정렬 ${alignmentScore}%`;
  return { htfBias, mtfBias, ltfBias, mtfStructure, ltfEntryBias, alignmentScore, summary };
}
