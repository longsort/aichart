import type { AnalyzeResponse } from '@/types';

/** GPT 시스템 프롬프트: TS 분석엔진이 이미 신호를 계산했으며, OpenAI는 설명/브리핑만 수행. LONG/SHORT 결정 금지 */
export const OPENAI_ROLE_SYSTEM = `You are a professional crypto trading analyst.
The trading signal is already calculated by the server engine (TypeScript analyze/signalEngine).
Do NOT decide LONG or SHORT yourself.
Explain the signal using the provided chart context only.
Explain: market structure, liquidity, buy/sell pressure, risks, and targets.
Do not collect data or change entry/stop/targets. Answer the user's questions based on the context.

Reply in natural Korean unless the user asks in another language.`;

export function buildChartContextSummary(engine: AnalyzeResponse | null): string {
  if (!engine) return '(차트 분석 없음)';
  const e = engine.engine || {};
  const parts: string[] = [
    `[차트] ${engine.symbol} ${engine.timeframe}`,
    `판단: ${engine.verdict} / 신뢰도 ${engine.confidence}%`,
    `BOS: ${(e.bos || []).length}, CHOCH: ${(e.choch || []).length}`,
    `FVG: ${(e.fvg || []).length}, OB: ${(e.obs || []).length}`,
    `스윕: ${(e.sweeps || []).length}, EQH: ${(e.eqh || []).length}, EQL: ${(e.eql || []).length}`,
    `패턴 수: ${(e.patterns || []).length}`,
    `진입가: ${engine.entry}, 손절: ${engine.stopLoss}`,
    `목표가: ${(engine.targets || []).join(', ')}`,
    `Premium/Discount/Equilibrium: ${e.premium ?? '-'} / ${e.discount ?? '-'} / ${e.equilibrium ?? '-'}`,
    `엔진 점수: ${Math.round(e.score ?? 0)}`,
  ];
  if ((engine.topReferences || []).length > 0) {
    parts.push('유사 참조: ' + (engine.topReferences as Array<{ title?: string; id: string }>).map(r => r.title || r.id).join(', '));
  }
  if ((engine as any).futurePaths?.length) {
    parts.push('Future Paths: ' + (engine as any).futurePaths.map((p: { path: string; probability: number }) => `${p.path} ${p.probability}%`).join(', '));
  }
  const vision = (engine as any).detectedVisionPatterns as Array<{ type: string; label: string; confidence: number; bias: string; reason: string }> | undefined;
  const dominant = (engine as any).dominantPattern as { type: string; confidence: number; bias: string; label?: string; reason?: string } | null | undefined;
  if (vision?.length) {
    parts.push('Pattern Vision: ' + vision.map(v => `${v.label} ${v.confidence}% (${v.bias})`).join(', '));
    if (dominant) parts.push(`Dominant: ${dominant.label ?? dominant.type} ${dominant.confidence}% ${dominant.bias}`);
  }
  if ((engine as any).patternVisionSummary) {
    parts.push('패턴 비전 요약: ' + (engine as any).patternVisionSummary);
  }
  const a = engine as any;
  const stateKo = (s: string) => (s === 'accepted_above' ? '위 안착' : s === 'accepted_below' ? '아래' : s === 'reclaiming' ? '재진입' : s || '');
  if (a.dailyCloseLevel != null || a.weeklyCloseLevel != null || a.monthlyCloseLevel != null) {
    parts.push('종가 마감: 일봉 ' + (a.dailyCloseLevel?.toLocaleString() ?? '-') + ' ' + stateKo(a.dailyState) + ', 주봉 ' + (a.weeklyCloseLevel?.toLocaleString() ?? '-') + ' ' + stateKo(a.weeklyState) + ', 월봉 ' + (a.monthlyCloseLevel?.toLocaleString() ?? '-') + ' ' + stateKo(a.monthlyState));
    if (a.closeBias) parts.push('종가선 기준: ' + (a.closeBias === 'bullish' ? '매수 우세' : a.closeBias === 'bearish' ? '매도 우세' : '중립') + ' (매수/매도 구간 반영)');
    if (a.mustHoldCloseLevel != null) parts.push('유지해야 할 종가선: ' + a.mustHoldCloseLevel.toLocaleString());
    if (a.mustReclaimCloseLevel != null) parts.push('재탈환해야 할 종가선: ' + a.mustReclaimCloseLevel.toLocaleString());
  }
  return parts.join('\n');
}

type PatternPromptItem = { title: string; score: number; outcome: string; briefing: string; reason?: string };

/** 유사 학습 패턴을 OpenAI 프롬프트에 포함. AI가 패턴 의미·브리핑 설명 시 참고 */
export function buildSimilarPatternsPrompt(similarPatterns: PatternPromptItem[]): string {
  if (!similarPatterns?.length) return '';
  const lines = similarPatterns.map(
    p => `- "${p.title}": 유사도 ${Math.round(p.score * 100)}%. 이유: ${p.reason || '-'}. 당시 결과: ${p.outcome}. 브리핑: ${(p.briefing || '').slice(0, 120)}`
  );
  return '[Similar learned patterns – 엔진이 매칭한 유사 과거 패턴]\n' + lines.join('\n') + '\n(설명 시 이 패턴들을 참고해 "현재 구조는 [패턴명]과 N% 유사, 당시 결과는 …" 형식으로 자연스럽게 포함 가능)';
}

/** analyze.learnedPatternsTop5 기반 프롬프트 (recall 엔진 연동) */
export function buildLearnedPatternsPrompt(learnedPatternsTop5: PatternPromptItem[]): string {
  return buildSimilarPatternsPrompt(learnedPatternsTop5);
}
