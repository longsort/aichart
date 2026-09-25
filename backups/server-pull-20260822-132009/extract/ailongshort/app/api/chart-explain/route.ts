import { NextRequest, NextResponse } from 'next/server';
import type { ChartExplainRequest } from '@/types/chartExplain';
import { resolveOpenAIKey, verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

type ChartExplainBody = ChartExplainRequest & {
  detectedVisionPatterns?: unknown[];
  dominantPattern?: unknown;
  patternVisionSummary?: string;
  openaiApiKey?: string;
  briefingLogin?: { user?: string; password?: string };
};

function openaiMiniCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.15 + (completionTokens / 1e6) * 0.6;
}

function geminiFlashCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.075 + (completionTokens / 1e6) * 0.3;
}

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `너는 트레이딩 구조를 설명하는 AI다.
사용자가 차트 특정 지점을 클릭하면 그 위치에서 발생한 구조적 이유를 자연스럽게 설명하라.
패턴 라벨을 클릭한 경우에는 해당 패턴만 집중 설명하라(왜 그 패턴으로 봤는지, 실패 시나리오 포함).

규칙:
- 대화체 한국어
- 3~5문장 (패턴 설명 시 4~6문장 가능)
- 너무 길지 않게
- 핵심 구조 중심 설명

설명 대상: BOS, CHOCH, FVG, OB, Sweep, Liquidity, Pattern Vision(삼각형/웨지/더블탑·바텀/채널 등)

예시:
사용자: "이 지점 설명해줘"
AI: "이 구간에서는 이전 고점을 돌파하면서 BOS가 발생했어. 그 이후 바로 위쪽에 있는 FVG 영역이 채워지면서 가격이 잠시 조정된 구조야."`;

function buildUserMessage(data: ChartExplainRequest, visionContext?: { detectedVisionPatterns?: Array<{ id: string; type: string; label: string; confidence: number; bias: string; reason: string }>; dominantPattern?: { type: string; confidence: number; bias: string; label?: string; reason?: string } | null; patternVisionSummary?: string }): string {
  const { symbol, timeframe, candleData, engineData, patternId } = data;
  const t = new Date(candleData.timestamp * 1000).toLocaleString('ko-KR');
  const parts = [
    `[클릭한 캔들] ${t} (${symbol} ${timeframe})`,
    `가격: O=${candleData.open} H=${candleData.high} L=${candleData.low} C=${candleData.close} Vol=${candleData.volume}`,
    `이 캔들 주변 구조:`,
    `BOS: ${engineData.bos.length}개`,
    `CHOCH: ${engineData.choch.length}개`,
    `FVG 근처: ${engineData.fvgNearby.length}개`,
    `OB 근처: ${engineData.obNearby.length}개`,
    `스윕: ${engineData.sweep.length}개`,
    `EQH: ${engineData.eqh.length}개, EQL: ${engineData.eql.length}개`,
  ];
  if (visionContext?.detectedVisionPatterns?.length) {
    parts.push('감지된 패턴 비전: ' + visionContext.detectedVisionPatterns.map(p => `${p.label}(${p.id}) ${p.confidence}%`).join(', '));
    if (visionContext.patternVisionSummary) parts.push('패턴 요약: ' + visionContext.patternVisionSummary);
  }
  if (patternId && visionContext?.detectedVisionPatterns?.length) {
    const p = visionContext.detectedVisionPatterns.find((x: { id: string }) => x.id === patternId);
    if (p) {
      parts.push('');
      parts.push(`[선택된 패턴] ${p.label} (${p.type})`);
      parts.push(`신뢰도 ${p.confidence}%, 편향 ${p.bias}`);
      parts.push(`판단 이유: ${p.reason}`);
      return parts.join('\n') + '\n\n이 패턴에 대해 설명해줘: (1) 왜 이 패턴으로 봤는지 (2) 보통 어떤 방향성이 나오는지 (3) 실패 시나리오는 어떤 경우인지. 4~6문장으로 답해줘.';
    }
  }
  return parts.join('\n') + '\n\n이 지점을 3~5문장으로 구조적으로 설명해줘.';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChartExplainBody;
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
        { error: 'OpenAI API 키가 없습니다. AI 패널에서 키를 입력하거나 서버에 OPENAI_API_KEY / GEMINI_API_KEY를 설정하세요.' },
        { status: 500 }
      );
    }
    if (!body?.symbol || !body?.candleData || !body?.engineData) {
      return NextResponse.json({ error: 'symbol, candleData, engineData 필수' }, { status: 400 });
    }

    const visionContext = (body.detectedVisionPatterns || body.patternVisionSummary)
      ? { detectedVisionPatterns: body.detectedVisionPatterns as any[], dominantPattern: body.dominantPattern as any, patternVisionSummary: body.patternVisionSummary }
      : undefined;
    const userMessage = buildUserMessage(body, visionContext);

    if (useGemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `System context:\n${SYSTEM_PROMPT}\n\nUser: ${userMessage}` }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Gemini: ${res.status} ${err}` }, { status: 500 });
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      const usageMeta = data.usageMetadata || {};
      const inT = usageMeta.promptTokenCount || 0;
      const outT = usageMeta.candidatesTokenCount || Math.max(0, (usageMeta.totalTokenCount || 0) - inT);
      const estimatedCost = geminiFlashCostUsd(inT, outT);
      return NextResponse.json({
        explanation: text,
        usage: { provider: 'gemini', inputTokens: inT, outputTokens: outT, estimatedCost },
      });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenAI: ${res.status} ${err}` }, { status: 500 });
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    const usage = data.usage || {};
    const inT = usage.prompt_tokens || 0;
    const outT = usage.completion_tokens || 0;
    const estimatedCost = openaiMiniCostUsd(inT, outT);
    return NextResponse.json({
      explanation: text,
      usage: { provider: 'openai', inputTokens: inT, outputTokens: outT, estimatedCost },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'chart-explain failed' }, { status: 500 });
  }
}
