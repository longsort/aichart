import { NextRequest, NextResponse } from 'next/server';
import { runDual } from '@/lib/ai/dualEngine';
import { OPENAI_ROLE_SYSTEM } from '@/lib/ai/chartContext';
import { buildUnifiedChatAnalysisContext } from '@/lib/ai/unifiedChatContext';
import { resolveOpenAIKey, verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

export const dynamic = 'force-dynamic';

function isBriefingRequest(message: string): boolean {
  const t = (message || '').trim().toLowerCase();
  return /브리핑|정리|리포트|보고서|요약해|정리해/.test(t);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const loginCheck = await verifyBriefingLoginIfRequired(body as { briefingLogin?: { user?: string; password?: string } });
    if ('error' in loginCheck) {
      return NextResponse.json({ error: loginCheck.error }, { status: 403 });
    }

    const openaiKey = resolveOpenAIKey(
      (body as { openaiApiKey?: string }).openaiApiKey,
      process.env.OPENAI_API_KEY
    );
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!openaiKey && !geminiKey) {
      return NextResponse.json(
        { error: 'OpenAI·Gemini API 키가 없습니다. OpenAI는 패널에서 키 입력 또는 서버 OPENAI_API_KEY, Gemini는 GEMINI_API_KEY를 설정하세요.', missingKey: 'OPENAI_API_KEY' },
        { status: 500 }
      );
    }
    if (!openaiKey) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 없습니다. AI 대화 패널에서 키를 입력하거나 서버에 OPENAI_API_KEY를 설정하세요.', missingKey: 'OPENAI_API_KEY' },
        { status: 500 }
      );
    }
    if (!geminiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY(또는 GOOGLE_API_KEY)가 설정되지 않았습니다. .env.local에 추가하세요.', missingKey: 'GEMINI_API_KEY' },
        { status: 500 }
      );
    }

    const {
      message,
      engine: engineFromBody,
      analysisResult,
      symbol = '',
      timeframe = '',
      includeChartContext = true,
      chartImage = null,
      mode: explicitMode,
    } = body as {
      message?: string;
      engine?: unknown;
      analysisResult?: unknown;
      symbol?: string;
      timeframe?: string;
      includeChartContext?: boolean;
      chartImage?: string | null;
      mode?: string;
    };

    const chartContext = buildUnifiedChatAnalysisContext({
      includeChartContext: Boolean(includeChartContext),
      symbol: String(symbol),
      timeframe: String(timeframe),
      analysisResult,
      engineFromBody,
    });

    const briefingMode = explicitMode === 'briefing' || (explicitMode !== 'chat' && isBriefingRequest(message || ''));
    const formatHint = briefingMode
      ? '\n\n[이번 회차] 사용자가 브리핑/정리/리포트를 요청했으므로, 번호·항목이 있는 보고서 형식으로 답하라.'
      : '';

    const systemContext = chartContext
      ? `${OPENAI_ROLE_SYSTEM}\n\n[Chart context – 엔진 계산 결과]\n${chartContext}${formatHint}`
      : OPENAI_ROLE_SYSTEM + formatHint;

    const chartBase64 = typeof chartImage === 'string' && chartImage.length > 0 ? chartImage.replace(/^data:image\/\w+;base64,/, '') : null;

    const result = await runDual(message || '', systemContext, openaiKey, geminiKey, chartBase64);

    return NextResponse.json({
      reply: result.consensus,
      gpt: result.gpt,
      gemini: result.gemini,
      consensus: result.consensus,
      difference: result.difference,
      usage: result.usage,
    });
  } catch (e: any) {
    const msg = e?.message || '';
    const is429 = msg.includes('429') || msg.includes('한도 초과');
    const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : (msg || 'Dual request failed');
    return NextResponse.json({ error }, { status: 500 });
  }
}
