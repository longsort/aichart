import type { AnalyzeResponse } from '@/types';

export function generateAutoBriefing(analysis: AnalyzeResponse | null): string {
  if (!analysis) return '분석 대기 중';
  const e = analysis.engine || {};
  const parts: string[] = [];

  if (analysis.nearestBuyZone || analysis.nearestSellZone) {
    parts.push(`[강한 구간 · 서버 계산] ${analysis.symbol} ${analysis.timeframe}`);
    parts.push(`신호: ${analysis.verdict === 'LONG' ? '롱' : analysis.verdict === 'SHORT' ? '숏' : '관망'} · 신뢰도 ${analysis.confidence}%`);
    if (analysis.nearestBuyZone) {
      const z = analysis.nearestBuyZone;
      parts.push(`매수 구간 ${z.probability}% · ${z.low.toLocaleString()} ~ ${z.high.toLocaleString()}${z.holdProbability != null ? ` · 유지 ${z.holdProbability}%` : ''}${z.trapRisk != null ? ` · 함정 ${z.trapRisk}%` : ''}`);
    }
    if (analysis.nearestSellZone) {
      const z = analysis.nearestSellZone;
      parts.push(`매도 구간 ${z.probability}% · ${z.low.toLocaleString()} ~ ${z.high.toLocaleString()}${z.breakProbability != null ? ` · 이탈 ${z.breakProbability}%` : ''}${z.trapRisk != null ? ` · 함정 ${z.trapRisk}%` : ''}`);
    }
    parts.push(`진입 ${analysis.entry} · 손절 ${analysis.stopLoss} · 목표 ${(analysis.targets || []).join(', ')}${(analysis as any).rr != null ? ` · 손익비 ${(analysis as any).rr}` : ''}`);
  }
  parts.push(`[신호] ${analysis.symbol} ${analysis.timeframe} · ${analysis.verdict === 'LONG' ? '롱' : analysis.verdict === 'SHORT' ? '숏' : '관망'} (서버 엔진 결정)`);
  parts.push(`신뢰도 ${analysis.confidence}% ${(analysis as any).confidenceGrade ? `(${(analysis as any).confidenceGrade})` : ''} · 레짐 ${(analysis as any).regime ?? '-'}`);
  parts.push(`BOS ${(e.bos || []).length} · CHOCH ${(e.choch || []).length} · FVG ${(e.fvg || []).length} · 스윕 ${(e.sweeps || []).length}`);
  if (!analysis.nearestBuyZone && !analysis.nearestSellZone) {
    parts.push(`진입 ${analysis.entry} · 손절 ${analysis.stopLoss} · 목표 ${(analysis.targets || []).join(', ')}${(analysis as any).rr != null ? ` · 손익비 ${(analysis as any).rr}` : ''}`);
  }
  parts.push(`엔진 점수 ${Math.round(e.score ?? 0)}${(analysis as any).longScore != null ? ` · 롱 ${(analysis as any).longScore} / 숏 ${(analysis as any).shortScore}` : ''}`);
  if ((analysis as any).mtf?.summary) {
    parts.push(`MTF: ${(analysis as any).mtf.summary}`);
  }
  if ((analysis as any).riskFlags?.length) {
    parts.push(`리스크: ${(analysis as any).riskFlags.join(', ')}`);
  }
  if ((analysis.topReferences || []).length > 0) {
    parts.push('유사 참조: ' + (analysis.topReferences as Array<{ title?: string }>).map(r => r.title).filter(Boolean).join(', '));
  }
  if (analysis.recallSummary) {
    parts.push('과거 학습 패턴: ' + analysis.recallSummary);
  }
  if ((analysis.learnedPatternsTop5 || []).length > 0) {
    const top = analysis.learnedPatternsTop5[0];
    parts.push(`가장 유사 패턴: ${top.title} ${Math.round(top.score * 100)}% · 당시 결과: ${top.outcome}`);
  }
  if (analysis.patternVisionSummary) {
    parts.push(analysis.patternVisionSummary);
  }
  if (analysis.dominantPattern) {
    const d = analysis.dominantPattern;
    parts.push(`주요 패턴: ${d.label ?? d.type} ${d.confidence}% (${d.bias === 'bullish' ? '상승' : d.bias === 'bearish' ? '하락' : '중립'})${d.reason ? ' · ' + d.reason : ''}`);
  }
  const a = analysis as any;
  if (a.dailyCloseLevel != null || a.weeklyCloseLevel != null || a.monthlyCloseLevel != null) {
    parts.push('[종가 마감 레벨]');
    if (a.dailyState) parts.push(`일봉 종가선 ${a.dailyState === 'accepted_above' ? '위 안착' : a.dailyState === 'accepted_below' ? '아래' : '근처 재진입'} — 단기 ${a.dailyState === 'accepted_above' ? '매수 우세' : a.dailyState === 'accepted_below' ? '매도 우세' : '대기'}`);
    if (a.weeklyState) parts.push(`주봉 종가선 ${a.weeklyState === 'accepted_above' ? '위 유지' : a.weeklyState === 'accepted_below' ? '아래' : '테스트'} — 중기 추세 ${a.weeklyState === 'accepted_above' ? '유리' : a.weeklyState === 'accepted_below' ? '약함' : '관찰'}`);
    if (a.monthlyState) parts.push(`월봉 종가선 ${a.monthlyState === 'accepted_above' ? '돌파 유지' : a.monthlyState === 'accepted_below' ? '이탈' : '재진입'} — 강한 추세 전환 후보`);
    if (a.mustReclaimCloseLevel != null) parts.push(`월봉/주봉 종가선 재탈환 시 ${a.mustReclaimCloseLevel.toLocaleString()} 이상 회복 필요`);
  }
  parts.push('— 핵심 이유: 구조 기반 방향, 유동성 위치, 패턴 정합성');
  return parts.join('\n');
}
