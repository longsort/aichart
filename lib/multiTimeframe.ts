export type MTFResult = {
  htfBias: 'bullish' | 'bearish' | 'range';
  mtfBias: 'bullish' | 'bearish' | 'neutral';
  ltfBias: 'bullish' | 'bearish' | 'neutral';
  mtfStructure: string;
  ltfEntryBias: 'long' | 'short' | 'neutral';
  alignmentScore: number;
  summary: string;
  trend1M?: 'bullish' | 'bearish' | 'range' | null;
};

export function computeMTF(
  htfTrend: string | null,
  ltfTrend: string | null,
  verdict: string,
  trend1M?: 'bullish' | 'bearish' | 'range' | null
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
  if (trend1M && trend1M !== 'range') {
    const m1Align = (trend1M === 'bullish' && ltfEntryBias === 'long') || (trend1M === 'bearish' && ltfEntryBias === 'short');
    const m1Contra = (trend1M === 'bullish' && ltfEntryBias === 'short') || (trend1M === 'bearish' && ltfEntryBias === 'long');
    if (m1Align) alignmentScore = Math.min(90, alignmentScore + 5);
    else if (m1Contra) alignmentScore = Math.max(30, alignmentScore - 10);
  }
  const m1Part = trend1M && trend1M !== 'range' ? `1M ${trend1M} · ` : '';
  const summary = `${m1Part}HTF ${htfBias} · LTF ${ltfBias} · 정렬 ${alignmentScore}%`;
  return { htfBias, mtfBias, ltfBias, mtfStructure, ltfEntryBias, alignmentScore, summary, trend1M };
}
