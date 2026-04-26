import type { AnalyzeResponse } from '@/types';
import { buildChartContextSummary, buildLearnedPatternsPrompt } from './chartContext';
import { briefingContextToPromptText, type BriefingContext } from '@/lib/briefingContext';
import { normalizeCurrentPattern } from '@/lib/recall/patternNormalizer';
import { recallTopPatterns } from '@/lib/recall/patternRecallEngine';

function isAnalyzeResponse(x: unknown): x is AnalyzeResponse {
  return !!x && typeof x === 'object' && 'verdict' in x && 'symbol' in (x as object) && 'timeframe' in (x as object);
}

/** 클라이언트가 보내는 `engine` 슬롯 = buildBriefingContext() 결과일 때 */
function isStandaloneBriefingShape(x: unknown): x is BriefingContext {
  return !!x && typeof x === 'object' && 'bosCount' in (x as object) && 'signal' in (x as object);
}

/**
 * UI 카드·패널에 쓰이는 분석 필드 — 엔진 요약 외 확정시그널·MTF·AI모드 요약·호가 등
 * (토큰 과다 방지로 길이 제한)
 */
export function buildAnalysisCardExtensions(a: AnalyzeResponse): string {
  const lines: string[] = [];
  const push = (s: string) => {
    if (s && s.length > 0) lines.push(s);
  };
  if (a.summary) push(`한줄요약: ${String(a.summary).slice(0, 600)}`);
  if (a.mtf?.summary) push(`MTF합성: ${String(a.mtf.summary).slice(0, 400)}`);
  if (a.regime) push(`레짐: ${a.regime}`);
  if (a.confirmedSignal) {
    const c = a.confirmedSignal;
    push(
      `확정시그널: confirmed=${c.confirmed} direction=${c.direction ?? 'null'} structure=${c.structure} rsi=${c.rsi} sr=${c.supportResistance} close=${c.close} fvg=${c.fvgZone}`
    );
    if (c.reasons?.length) push(`확정근거: ${c.reasons.slice(0, 8).join(' · ')}`);
  }
  if (a.breakoutLevel) push(`돌파관심: ${a.breakoutLevel.price} — ${String(a.breakoutLevel.reason).slice(0, 200)}`);
  if (a.supportLevel) push(`지지관심: ${a.supportLevel.price} — ${String(a.supportLevel.reason).slice(0, 200)}`);
  if (a.resistanceLevel) push(`저항관심: ${a.resistanceLevel.price} — ${String(a.resistanceLevel.reason).slice(0, 200)}`);
  if (a.invalidationLevel) push(`무효화참고: ${a.invalidationLevel.price} — ${String(a.invalidationLevel.reason || '').slice(0, 200)}`);
  if (a.mustHold) push(`mustHold: ${a.mustHold}`);
  if (a.mustBreak) push(`mustBreak: ${a.mustBreak}`);
  if (a.nearestSupportOb) {
    push(
      `근접지지OB: ${a.nearestSupportOb.low}-${a.nearestSupportOb.high} prob=${a.nearestSupportOb.probability}%`
    );
  }
  if (a.nearestResistanceOb) {
    push(
      `근접저항OB: ${a.nearestResistanceOb.low}-${a.nearestResistanceOb.high} prob=${a.nearestResistanceOb.probability}%`
    );
  }
  if (a.aiModeAutoAnalysis?.headline) {
    push(`AI자동요약(헤드): ${a.aiModeAutoAnalysis.headline}`);
    if (a.aiModeAutoAnalysis.bullets?.length) {
      push(`AI자동요약(불릿): ${a.aiModeAutoAnalysis.bullets.slice(0, 10).join(' | ')}`);
    }
  }
  if (a.recallSummary) push(`패턴메모: ${String(a.recallSummary).slice(0, 400)}`);
  if (a.bullishScenario) push(`상승시나리오: ${String(a.bullishScenario).slice(0, 400)}`);
  if (a.bearishScenario) push(`하락시나리오: ${String(a.bearishScenario).slice(0, 400)}`);
  if (a.currentZoneSummary) push(`현재구간요약: ${String(a.currentZoneSummary).slice(0, 400)}`);
  if (a.earlyObAnalysis) push(`선행OB: ${String(a.earlyObAnalysis).slice(0, 400)}`);
  const u = a.unifiedMarketMetrics;
  if (u && typeof u === 'object') {
    push(
      `수집메트릭: buyPressure=${a.buyPressure ?? '-'} sellPressure=${a.sellPressure ?? '-'} OIΔ%=${u.oiDeltaPct ?? '-'} 청산L/S=${u.liquidationLongUsd ?? '-'}/${u.liquidationShortUsd ?? '-'}`
    );
  }
  if (!lines.length) return '';
  return '\n[분석 카드·패널 확장]\n' + lines.join('\n');
}

export type UnifiedChatContextParams = {
  includeChartContext: boolean;
  symbol: string;
  timeframe: string;
  /** AIChatPanel → 전체 AnalyzeResponse */
  analysisResult?: unknown;
  /** AIChatPanel → buildBriefingContext(analysis) 단독 브리핑 카드 */
  engineFromBody?: unknown;
};

/**
 * OpenAI / Gemini / Dual 공통: 차트 엔진 + 브리핑 카드 + 학습패턴을 한 덩어리로.
 */
export function buildUnifiedChatAnalysisContext(p: UnifiedChatContextParams): string {
  const { includeChartContext, symbol, timeframe, analysisResult, engineFromBody } = p;
  if (!includeChartContext) {
    return `symbol: ${symbol}\ntimeframe: ${timeframe}\n(차트 컨텍스트 끔)`;
  }

  const analysis = isAnalyzeResponse(analysisResult) ? analysisResult : null;

  let chartContext = '';
  if (analysis) {
    chartContext = buildChartContextSummary(analysis);
    chartContext += buildAnalysisCardExtensions(analysis);
    if (analysis.learnedPatternsTop5?.length) {
      chartContext +=
        '\n\n' +
        buildLearnedPatternsPrompt(
          analysis.learnedPatternsTop5.map(p => ({
            title: p.title,
            score: p.score,
            outcome: p.outcome,
            briefing: p.briefing || '',
            reason: p.reason,
          }))
        );
    } else {
      try {
        const normalized = normalizeCurrentPattern(analysis);
        const top5 = recallTopPatterns(normalized, undefined, 5);
        if (top5.length) chartContext += '\n\n' + buildLearnedPatternsPrompt(top5);
      } catch {
        /* ignore */
      }
    }
  }

  const briefingEmbedded = analysis?.briefingContext;
  if (briefingEmbedded && typeof briefingEmbedded === 'object') {
    chartContext =
      briefingContextToPromptText(briefingEmbedded as BriefingContext) +
      (chartContext ? '\n\n[상세 엔진·차트 구조]\n' + chartContext : '');
  } else if (engineFromBody && isStandaloneBriefingShape(engineFromBody)) {
    chartContext =
      briefingContextToPromptText(engineFromBody) + (chartContext ? '\n\n[상세 엔진·차트 구조]\n' + chartContext : '');
  }

  if (!chartContext.trim()) {
    return `symbol: ${symbol}\ntimeframe: ${timeframe}\n(분석 페이로드 없음 — 사용자 질문만 답변)`;
  }
  return chartContext;
}
