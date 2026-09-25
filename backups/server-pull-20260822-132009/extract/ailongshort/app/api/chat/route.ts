import { NextRequest, NextResponse } from 'next/server';
import { callOpenAI, callOpenAIStream } from '@/lib/ai/dualEngine';
import { OPENAI_ROLE_SYSTEM } from '@/lib/ai/chartContext';
import { buildUnifiedChatAnalysisContext } from '@/lib/ai/unifiedChatContext';
import { resolveOpenAIKey, verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

export const dynamic = 'force-dynamic';

function isBriefingRequest(message: string): boolean {
  const t = (message || '').trim().toLowerCase();
  return /브리핑|정리|리포트|보고서|요약해|정리해/.test(t);
}

function jsonError(error: string, status = 500) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  try {
    const loginCheck = await verifyBriefingLoginIfRequired(body as { briefingLogin?: { user?: string; password?: string } });
    if ('error' in loginCheck) return jsonError(loginCheck.error, 403);

    const {
      message,
      symbol = '',
      timeframe = '',
      engine: engineFromBody,
      analysisResult,
      includeChartContext = true,
      chartImage = null,
      stream: useStream = false,
      mode: explicitMode,
      recentMessages = [],
      openaiApiKey: bodyOpenaiKey,
    } = body as {
      message?: string;
      symbol?: string;
      timeframe?: string;
      engine?: unknown;
      analysisResult?: unknown;
      includeChartContext?: boolean;
      chartImage?: string | null;
      stream?: boolean;
      mode?: string;
      recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
      openaiApiKey?: string;
    };

    const key = resolveOpenAIKey(bodyOpenaiKey, process.env.OPENAI_API_KEY);
    if (!key) {
      return jsonError(
        'OpenAI API 키가 없습니다. AI 대화 패널에서 키를 입력하거나 서버에 OPENAI_API_KEY를 설정하세요.',
        500
      );
    }

    const rawAnalysis = analysisResult && typeof analysisResult === 'object' ? (analysisResult as Record<string, unknown>) : null;

    const history = Array.isArray(recentMessages)
      ? recentMessages.slice(-10).filter((m: unknown) => m && typeof m === 'object' && (m as any).role && (m as any).content)
      : [];
    const conversationHistory = history.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }));

    console.log(
      '[api/chat] payload',
      JSON.stringify({
        symbol,
        timeframe,
        hasEngineBriefing: !!engineFromBody,
        hasAnalysisResult: !!rawAnalysis,
        includeChartContext,
        messageLen: typeof message === 'string' ? message.length : 0,
        stream: useStream,
        historyCount: conversationHistory.length,
      })
    );

    const context = buildUnifiedChatAnalysisContext({
      includeChartContext: Boolean(includeChartContext),
      symbol: String(symbol ?? ''),
      timeframe: String(timeframe ?? ''),
      analysisResult,
      engineFromBody: engineFromBody,
    });

    const userContent = context + '\n\nUser question:\n' + String(message || '');

    const briefingMode = explicitMode === 'briefing' || (explicitMode !== 'chat' && isBriefingRequest(String(message || '')));
    const formatHint = briefingMode
      ? '\n\n[이번 회차] 사용자가 브리핑/정리/리포트를 요청했으므로, 번호·항목이 있는 보고서 형식으로 답하라.'
      : '';
    const systemContext = OPENAI_ROLE_SYSTEM + formatHint;

    const chartBase64 = typeof chartImage === 'string' && chartImage.length > 0 ? chartImage.replace(/^data:image\/\w+;base64,/, '') : null;
    const temperature = briefingMode ? 0.3 : 0.7;
    const openAIOptions = { temperature, conversationHistory };

    if (useStream) {
      const { stream } = await callOpenAIStream(userContent, systemContext, key, chartBase64, openAIOptions);
      console.log('[api/chat] response stream status=200 content-type=application/x-ndjson');
      return new NextResponse(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
    }

    const result = await callOpenAI(userContent, systemContext, key, chartBase64, openAIOptions);
    const jsonBody = { reply: result.reply, usage: result.usage };
    console.log('[api/chat] response status=200 content-type=application/json bodyPreview=', JSON.stringify(jsonBody).slice(0, 200));
    return NextResponse.json(jsonBody, { headers: { 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const is429 = msg.includes('429') || msg.includes('한도 초과');
    const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : (msg || 'OpenAI request failed');
    console.log('[api/chat] error', error);
    return jsonError(error, 500);
  }
}
