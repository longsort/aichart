import type { AnalyzeResponse } from '@/types';
import { normalizeCurrentPattern } from './patternNormalizer';
import { addPattern } from './patternStore';

/**
 * 현재 차트 분석 결과를 패턴 레퍼런스로 저장 (서버에서 호출).
 * "이 패턴 저장" 버튼 시 사용.
 */
export function saveCurrentAnalysisAsPattern(analysis: AnalyzeResponse | null, options?: { title?: string; outcome?: string }): { id: string } | null {
  if (!analysis) return null;
  const normalized = normalizeCurrentPattern(analysis);
  if (!normalized) return null;

  const title = options?.title ?? `${analysis.symbol} ${analysis.timeframe} ${analysis.verdict} ${analysis.confidence}%`;
  const outcome = options?.outcome ?? `판단: ${analysis.verdict}, 신뢰도 ${analysis.confidence}%`;
  const briefing = [
    analysis.summary,
    `진입 ${analysis.entry} · 손절 ${analysis.stopLoss} · 목표 ${(analysis.targets || []).join(', ')}`,
    (analysis.topReferences || []).map(r => r.title || r.id).slice(0, 3).join(', ') || '유사 참조 없음',
  ].join('\n');

  const ref = addPattern({
    title: title.slice(0, 200),
    sourceType: 'auto',
    description: `자동 저장: ${analysis.symbol} ${analysis.timeframe}`,
    tags: [analysis.verdict, analysis.timeframe, 'auto'].filter(Boolean),
    timeframe: analysis.timeframe,
    symbol: analysis.symbol,
    patternType: (analysis.engine?.patterns?.[0] as any)?.type ?? '',
    bias: analysis.engine?.trend === 'bullish' ? 'bullish' : analysis.engine?.trend === 'bearish' ? 'bearish' : 'neutral',
    features: normalized.features,
    outcome: outcome.slice(0, 300),
    briefing: briefing.slice(0, 1000),
  });

  return { id: ref.id };
}
