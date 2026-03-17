import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai/dualEngine';
import { OPENAI_ROLE_SYSTEM, buildChartContextSummary, buildLearnedPatternsPrompt } from '@/lib/ai/chartContext';
import { briefingContextToPromptText } from '@/lib/briefingContext';
import { normalizeCurrentPattern } from '@/lib/recall/patternNormalizer';
import { recallTopPatterns } from '@/lib/recall/patternRecallEngine';
import type { AnalyzeResponse } from '@/types';

export const dynamic = 'force-dynamic';

function isBriefingRequest(message: string): boolean {
  const t = (message || '').trim().toLowerCase();
  return /브리핑|정리|리포트|보고서|요약해|정리해/.test(t);
}

export async function POST(req: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다. .env.local에 GEMINI_API_KEY 또는 GOOGLE_API_KEY를 추가하세요.', missingKey: 'GEMINI_API_KEY' }, { status: 500 });

    const body = await req.json();
    const {
      message,
      engine,
      includeChartContext = true,
      chartImage = null,
      mode: explicitMode,
    } = body;

    const analysis = (engine && typeof engine === 'object' ? engine : null) as AnalyzeResponse | null;
    let chartContext = includeChartContext && analysis ? buildChartContextSummary(analysis) : '';
    if (analysis && chartContext) {
      const learned = (analysis as any).learnedPatternsTop5;
      if (learned?.length) {
        chartContext += '\n\n' + buildLearnedPatternsPrompt(learned);
      } else {
        const normalized = normalizeCurrentPattern(analysis);
        const top5 = recallTopPatterns(normalized, undefined, 5);
        if (top5.length) chartContext += '\n\n' + buildLearnedPatternsPrompt(top5);
      }
    }

    const briefingCtx = (analysis as any)?.briefingContext;
    if (briefingCtx) {
      chartContext = briefingContextToPromptText(briefingCtx) + (chartContext ? '\n\n[상세 구조]\n' + chartContext : '');
    }

    const briefingMode = explicitMode === 'briefing' || (explicitMode !== 'chat' && isBriefingRequest(message || ''));
    const formatHint = briefingMode
      ? '\n\n[이번 회차] 사용자가 브리핑/정리/리포트를 요청했으므로, 번호·항목이 있는 보고서 형식으로 답하라.'
      : '';

    const systemContext = chartContext
      ? `${OPENAI_ROLE_SYSTEM}\n\n[입력 – 서버 엔진이 이미 계산한 결과만 사용, AI는 설명만 할 것]\n${chartContext}${formatHint}`
      : OPENAI_ROLE_SYSTEM + formatHint;

    const chartBase64 = typeof chartImage === 'string' && chartImage.length > 0 ? chartImage.replace(/^data:image\/\w+;base64,/, '') : null;

    const result = await callGemini(message || '', systemContext, key, chartBase64);

    return NextResponse.json({
      reply: result.reply,
      usage: result.usage,
    });
  } catch (e: any) {
    const msg = e?.message || '';
    const is429 = msg.includes('429') || msg.includes('한도 초과');
    const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : (msg || 'Gemini request failed');
    return NextResponse.json({ error }, { status: 500 });
  }
}
