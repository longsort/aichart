import { NextRequest, NextResponse } from 'next/server';
import { resolveOpenAIKey, verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

export const dynamic = 'force-dynamic';

const SYSTEM = `당신은 암호화폐 단기 캔들 분석가다. 사용자에게 한 문장(한국어)만 출력한다.
규칙: 22단어 이내, 존댓말 생략(간결체), 가격 숫자는 입력에 있으면 유지, 추측 과장 금지.`;

type Body = {
  symbol?: string;
  timeframe?: string;
  verdict?: string;
  status?: string;
  ruleComment?: string;
  insights?: string[];
  openaiApiKey?: string;
  briefingLogin?: { user?: string; password?: string };
};

function openaiMiniCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.15 + (completionTokens / 1e6) * 0.6;
}

function geminiFlashCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.075 + (completionTokens / 1e6) * 0.3;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const loginCheck = await verifyBriefingLoginIfRequired(body);
    if ('error' in loginCheck) {
      return NextResponse.json({ error: loginCheck.error }, { status: 403 });
    }

    const openaiKey = resolveOpenAIKey(body.openaiApiKey, process.env.OPENAI_API_KEY);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const useGemini = !!geminiKey && !openaiKey;
    const key = useGemini ? geminiKey : openaiKey;
    if (!key) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY 또는 GEMINI_API_KEY, 또는 클라이언트 OpenAI 키가 필요합니다.' },
        { status: 500 }
      );
    }

    const symbol = String(body.symbol || '').trim();
    const tf = String(body.timeframe || '').trim();
    if (!symbol || !tf) {
      return NextResponse.json({ error: 'symbol, timeframe 필수' }, { status: 400 });
    }

    const userLine = [
      `[${symbol} ${tf}]`,
      `판정: ${body.verdict ?? '-'}`,
      `상태: ${body.status ?? '-'}`,
      `룰 요약: ${(body.ruleComment || '').slice(0, 200)}`,
      body.insights?.length ? `칩: ${body.insights.slice(0, 10).join(' · ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (useGemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${SYSTEM}\n\n${userLine}` }] }],
            generationConfig: { maxOutputTokens: 120, temperature: 0.25 },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Gemini: ${res.status} ${err}` }, { status: 500 });
      }
      const data = await res.json();
      const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().replace(/\s+/g, ' ');
      const usageMeta = data.usageMetadata || {};
      const inT = usageMeta.promptTokenCount || 0;
      const outT = usageMeta.candidatesTokenCount || Math.max(0, (usageMeta.totalTokenCount || 0) - inT);
      return NextResponse.json({
        aiLine: text.slice(0, 160),
        usage: { provider: 'gemini', inputTokens: inT, outputTokens: outT, estimatedCostUsd: geminiFlashCostUsd(inT, outT) },
      });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userLine },
        ],
        max_tokens: 120,
        temperature: 0.25,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenAI: ${res.status} ${err}` }, { status: 500 });
    }
    const data = await res.json();
    const text = String(data.choices?.[0]?.message?.content ?? '').trim().replace(/\s+/g, ' ');
    const usage = data.usage || {};
    const inT = usage.prompt_tokens || 0;
    const outT = usage.completion_tokens || 0;
    return NextResponse.json({
      aiLine: text.slice(0, 160),
      usage: { provider: 'openai', inputTokens: inT, outputTokens: outT, estimatedCostUsd: openaiMiniCostUsd(inT, outT) },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'candle-analysis-ai-comment failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
