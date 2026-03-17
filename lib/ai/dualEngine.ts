const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export type ChatUsage = {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

export type SingleReply = {
  reply: string;
  usage: ChatUsage;
};

export type DualReply = {
  gpt: string;
  gemini: string;
  consensus: string;
  difference: string;
  usage?: { gpt?: ChatUsage; gemini?: ChatUsage };
};

const OPENAI_429_RETRIES = 3;
const OPENAI_429_DELAY_MS = 2000;
const GEMINI_429_RETRIES = 3;
const GEMINI_429_DELAY_MS = 2000;
const RATE_LIMIT_MSG = '요청 한도 초과, 잠시 후 재시도';

export type OpenAIChatOptions = {
  temperature?: number;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

async function callOpenAI(
  message: string,
  systemContext: string,
  apiKey: string,
  chartImageBase64: string | null,
  options?: OpenAIChatOptions
): Promise<SingleReply> {
  type MessageItem = { role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> };
  const messages: MessageItem[] = [
    { role: 'system', content: systemContext },
  ];
  const history = options?.conversationHistory ?? [];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  const userContent: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = chartImageBase64
    ? [
        { type: 'text' as const, text: message },
        { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${chartImageBase64}` } },
      ]
    : message;
  messages.push({ role: 'user', content: userContent });

  const temperature = options?.temperature ?? 0.7;
  let lastRes: Response | null = null;
  let lastBody = '';
  for (let attempt = 0; attempt <= OPENAI_429_RETRIES; attempt++) {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1024,
        temperature,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      const usage = data.usage || {};
      const inT = usage.prompt_tokens || 0;
      const outT = usage.completion_tokens || 0;
      const cost = (inT / 1e6) * 0.15 + (outT / 1e6) * 0.6;
      return {
        reply: content,
        usage: { provider: 'openai', inputTokens: inT, outputTokens: outT, estimatedCost: cost },
      };
    }
    lastRes = res;
    lastBody = await res.text();
    if (res.status === 429 && attempt < OPENAI_429_RETRIES) {
      const retryAfter = lastRes.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 60000) : OPENAI_429_DELAY_MS * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    break;
  }
  const msg = lastRes?.status === 429 ? RATE_LIMIT_MSG : `OpenAI: ${lastRes?.status ?? 'error'} ${lastBody || ''}`;
  throw new Error(msg);
}

async function callGemini(
  message: string,
  systemContext: string,
  apiKey: string,
  chartImageBase64: string | null
): Promise<SingleReply> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: `System context:\n${systemContext}\n\nUser: ${message}` },
  ];
  if (chartImageBase64) {
    parts.push({ inlineData: { mimeType: 'image/png', data: chartImageBase64 } });
  }
  let lastRes: Response | null = null;
  let lastBody = '';
  for (let attempt = 0; attempt <= GEMINI_429_RETRIES; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = data.usageMetadata || {};
      const inT = usage.promptTokenCount || 0;
      const outT = usage.candidatesTokenCount || usage.totalTokenCount - inT || 0;
      const cost = (inT / 1e6) * 0.075 + (outT / 1e6) * 0.3;
      return {
        reply: text,
        usage: { provider: 'gemini', inputTokens: inT, outputTokens: outT, estimatedCost: cost },
      };
    }
    lastRes = res;
    lastBody = await res.text();
    if (res.status === 429 && attempt < GEMINI_429_RETRIES) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 60000) : GEMINI_429_DELAY_MS * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    break;
  }
  const msg = lastRes?.status === 429 ? RATE_LIMIT_MSG : `Gemini: ${lastRes?.status ?? 'error'} ${lastBody || ''}`;
  throw new Error(msg);
}

export async function runDual(
  message: string,
  systemContext: string,
  openaiKey: string,
  geminiKey: string,
  chartImageBase64: string | null
): Promise<DualReply> {
  const consensusPrompt = `다음 두 AI의 답변을 비교해 공통 결론(consensus)과 차이점(difference)을 각각 2~3문장으로 요약해 JSON만 반환: {"consensus":"...", "difference":"..."}\n\nGPT:\n`;
  let gptReply = '';
  let geminiReply = '';
  let gptUsage: ChatUsage | undefined;
  let geminiUsage: ChatUsage | undefined;

  const [gptResult, geminiResult] = await Promise.allSettled([
    callOpenAI(message, systemContext, openaiKey, chartImageBase64),
    callGemini(message, systemContext, geminiKey, chartImageBase64),
  ]);

  if (gptResult.status === 'fulfilled') {
    gptReply = gptResult.value.reply;
    gptUsage = gptResult.value.usage;
  }
  if (geminiResult.status === 'fulfilled') {
    geminiReply = geminiResult.value.reply;
    geminiUsage = geminiResult.value.usage;
  }

  let consensus = '두 모델 응답을 비교할 수 없습니다.';
  let difference = '일부 또는 전체 API 호출이 실패했습니다.';

  if (gptReply && geminiReply) {
    try {
      const sumRes = await callOpenAI(
        consensusPrompt + gptReply + '\n\nGemini:\n' + geminiReply,
        'You output only valid JSON.',
        openaiKey,
        null
      );
      const raw = sumRes.reply.replace(/```json?\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(raw) as { consensus?: string; difference?: string };
      consensus = parsed.consensus || consensus;
      difference = parsed.difference || difference;
    } catch {
      consensus = '공통점: 롱/숏 판단 일치 시 여기 표시.';
      difference = 'GPT와 Gemini 답변 차이 요약.';
    }
  } else if (gptReply) {
    consensus = gptReply.slice(0, 300);
    difference = 'Gemini 호출 실패.';
  } else if (geminiReply) {
    consensus = geminiReply.slice(0, 300);
    difference = 'OpenAI 호출 실패.';
  }

  return {
    gpt: gptReply || '(실패)',
    gemini: geminiReply || '(실패)',
    consensus,
    difference,
    usage: { gpt: gptUsage, gemini: geminiUsage },
  };
}

export async function callOpenAIStream(
  message: string,
  systemContext: string,
  apiKey: string,
  chartImageBase64: string | null,
  options?: OpenAIChatOptions
): Promise<{ stream: ReadableStream<Uint8Array>; usagePromise: Promise<ChatUsage> }> {
  type MessageItem = { role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> };
  const messages: MessageItem[] = [{ role: 'system', content: systemContext }];
  const history = options?.conversationHistory ?? [];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  const userContent: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = chartImageBase64
    ? [{ type: 'text' as const, text: message }, { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${chartImageBase64}` } }]
    : message;
  messages.push({ role: 'user', content: userContent });

  const temperature = options?.temperature ?? 0.7;
  let res: Response | null = null;
  let lastBody = '';
  for (let attempt = 0; attempt <= OPENAI_429_RETRIES; attempt++) {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 1024, temperature, stream: true }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) break;
    lastBody = await res.text();
    if (res.status === 429 && attempt < OPENAI_429_RETRIES) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 60000) : OPENAI_429_DELAY_MS * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(res.status === 429 ? RATE_LIMIT_MSG : `OpenAI: ${res.status} ${lastBody}`);
  }
  const reader = res!.body!.getReader();
  const decoder = new TextDecoder();
  let usageResolve!: (u: ChatUsage) => void;
  const usagePromise = new Promise<ChatUsage>(r => { usageResolve = r; });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = '';
      let inT = 0, outT = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const j = JSON.parse(data);
                const content = j.choices?.[0]?.delta?.content;
                if (content) controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: content }) + '\n'));
                if (j.usage) {
                  inT = j.usage.prompt_tokens || 0;
                  outT = j.usage.completion_tokens || 0;
                }
              } catch {}
            }
          }
        }
        const cost = (inT / 1e6) * 0.15 + (outT / 1e6) * 0.6;
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ usage: { provider: 'openai', inputTokens: inT, outputTokens: outT, estimatedCost: cost } }) + '\n'));
        usageResolve({ provider: 'openai', inputTokens: inT, outputTokens: outT, estimatedCost: cost });
      } catch (e) {
        usageResolve({ provider: 'openai', inputTokens: 0, outputTokens: 0, estimatedCost: 0 });
      } finally {
        controller.close();
      }
    },
  });
  return { stream, usagePromise };
}

export { callOpenAI, callGemini };
