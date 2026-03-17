import { NextRequest, NextResponse } from 'next/server';
import { callOpenAI, callOpenAIStream } from '@/lib/ai/dualEngine';
import { OPENAI_ROLE_SYSTEM } from '@/lib/ai/chartContext';
import { briefingContextToPromptText, type BriefingContext } from '@/lib/briefingContext';

export const dynamic = 'force-dynamic';

function isBriefingRequest(message: string): boolean {
  const t = (message || '').trim().toLowerCase();
  return /브리핑|정리|리포트|보고서|요약해|정리해/.test(t);
}

function jsonError(error: string, status = 500) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Content-Type': 'application/json' } });
}

function isBriefingContextShape(engine: unknown): engine is BriefingContext {
  return !!engine && typeof engine === 'object' && 'signal' in engine && 'buyPressure' in engine && 'bosCount' in engine;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return jsonError('OPENAI API 키가 설정되지 않았습니다. .env.local에 OPENAI_API_KEY를 추가하세요.', 500);

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
    };

    const engine = (engineFromBody && typeof engineFromBody === 'object' ? engineFromBody : null) ?? (analysisResult && typeof analysisResult === 'object' && isBriefingContextShape(analysisResult as BriefingContext) ? (analysisResult as BriefingContext) : null);
    const rawAnalysis = analysisResult && typeof analysisResult === 'object' ? (analysisResult as Record<string, unknown>) : null;
    const e = engine && typeof engine === 'object' ? (engine as Record<string, unknown>).engine as Record<string, unknown> | undefined : (rawAnalysis?.engine as Record<string, unknown> | undefined);

    const history = Array.isArray(recentMessages)
      ? recentMessages.slice(-10).filter((m: unknown) => m && typeof m === 'object' && (m as any).role && (m as any).content)
      : [];
    const conversationHistory = history.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }));

    console.log('[api/chat] payload', JSON.stringify({ symbol, timeframe, hasEngine: !!engine, hasAnalysisResult: !!rawAnalysis, includeChartContext, messageLen: typeof message === 'string' ? message.length : 0, stream: useStream, historyCount: conversationHistory.length }));

    const context = (() => {
      if (!includeChartContext) return `symbol: ${symbol}\ntimeframe: ${timeframe}\n(no chart data)`;
      if (engine && isBriefingContextShape(engine)) return briefingContextToPromptText(engine);
      const eng = engine as Record<string, unknown> | null;
      const src = eng ?? rawAnalysis;
      const sig = src?.verdict ?? src?.signal ?? '-';
      const conf = src?.confidence ?? '-';
      const buyP = src?.buyPressure ?? '-';
      const sellP = src?.sellPressure ?? '-';
      const entry = src?.entry ?? '-';
      const stop = src?.stopLoss ?? '-';
      const tgs = Array.isArray(src?.targets) ? (src.targets as string[]).join(', ') : (src?.targets ?? '-');
      const bosN = Array.isArray(e?.bos) ? (e.bos as unknown[]).length : 0;
      const chochN = Array.isArray(e?.choch) ? (e.choch as unknown[]).length : 0;
      const fvgN = Array.isArray(e?.fvg) ? (e.fvg as unknown[]).length : 0;
      const obN = Array.isArray(e?.obs) ? (e.obs as unknown[]).length : 0;
      return [
        'symbol: ' + symbol,
        'timeframe: ' + timeframe,
        'signal: ' + sig,
        'confidence: ' + conf,
        'buyPressure: ' + buyP,
        'sellPressure: ' + sellP,
        'bos: ' + bosN,
        'choch: ' + chochN,
        'fvg: ' + fvgN,
        'ob: ' + obN,
        'entry: ' + entry,
        'stopLoss: ' + stop,
        'targets: ' + tgs,
      ].join('\n');
    })();

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
