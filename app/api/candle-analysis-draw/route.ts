import { NextRequest, NextResponse } from 'next/server';
import { resolveOpenAIKey, verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import {
  normalizeCandleAnalysisAiDrawResponse,
  stripJsonFence,
} from '@/lib/candleAnalysisAiDrawNormalize';

export const dynamic = 'force-dynamic';

type CandleRow = { time?: number; open?: number; high?: number; low?: number; close?: number; volume?: number };

type Body = {
  symbol?: string;
  timeframe?: string;
  candles?: CandleRow[];
  analysis?: {
    verdict?: string;
    currentPrice?: number;
    smartOverlay?: {
      prob_long?: number;
      prob_short?: number;
      status?: string;
      comment?: string;
      tp1?: number;
      entry_1?: number;
      breakout_level?: number;
      invalid?: number;
      support_zone?: [number, number];
      resist_zone?: [number, number];
    };
  };
  openaiApiKey?: string;
  briefingLogin?: { user?: string; password?: string };
};

function openaiMiniCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.15 + (completionTokens / 1e6) * 0.6;
}

function geminiFlashCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1e6) * 0.075 + (completionTokens / 1e6) * 0.3;
}

const SYSTEM = `You are a chart drafting assistant for cryptocurrency candle analysis (educational only, not financial advice).
Output ONLY one JSON object (no markdown, no prose outside JSON) with this exact shape:
{
  "bias": "LONG" | "SHORT" | "NEUTRAL",
  "support_hold_ref_pct": number 0-100 (heuristic "support holding" reference, NOT a guarantee),
  "resistance_ref_pct": number 0-100 (heuristic reference),
  "commentary": string[] 2-5 short Korean lines explaining the draft,
  "overlays": array of 3-10 items, each item ONE of:
    {"kind":"zone","label":string,"priceTop":number,"priceBottom":number}
    {"kind":"keyLevel","label":string,"price":number}
    {"kind":"entry","label":string,"price":number}
    {"kind":"stop","label":string,"price":number}
    {"kind":"target","label":string,"price":number}
    {"kind":"label","label":string,"price":number}
    {"kind":"trendLine","label":string,"price1":number,"price2":number,"barOffset1":number,"barOffset2":number}
Rules:
- Prices must be realistic vs last close (roughly within 0.25x-4x).
- LONG bias: place support zone below last close, target above, stop below entry/support.
- SHORT bias: invert.
- NEUTRAL: still draw main support/resist zones and key levels, avoid aggressive targets.
- Labels in Korean, prefix with "AI·" when helpful.
- Never output extra keys at root except bias, support_hold_ref_pct, resistance_ref_pct, commentary, overlays.`;

function buildUserPayload(symbol: string, tf: string, candles: CandleRow[], analysis: Body['analysis']): string {
  const tail = candles.slice(-52);
  const csv = tail
    .map((c) => {
      const t = Number(c.time);
      const o = Number(c.open);
      const h = Number(c.high);
      const l = Number(c.low);
      const cl = Number(c.close);
      const v = Number(c.volume);
      if (![t, o, h, l, cl].every((x) => Number.isFinite(x))) return '';
      return `${t},${o},${h},${l},${cl},${Number.isFinite(v) ? v : 0}`;
    })
    .filter(Boolean)
    .join('\n');
  const last = tail[tail.length - 1];
  const lc = last ? Number(last.close) : 0;
  const so = analysis?.smartOverlay;
  const meta = [
    `symbol=${symbol} timeframe=${tf}`,
    `last_close=${lc}`,
    `verdict=${analysis?.verdict ?? '-'}`,
    so
      ? `smart prob_long=${so.prob_long ?? '-'} prob_short=${so.prob_short ?? '-'} status=${so.status ?? '-'}`
      : '',
    so?.tp1 != null ? `tp1=${so.tp1}` : '',
    so?.entry_1 != null ? `entry_1=${so.entry_1}` : '',
    so?.breakout_level != null ? `breakout=${so.breakout_level}` : '',
    so?.invalid != null ? `invalid=${so.invalid}` : '',
    so?.support_zone ? `support_zone=${so.support_zone.join(',')}` : '',
    so?.resist_zone ? `resist_zone=${so.resist_zone.join(',')}` : '',
    so?.comment ? `smart_comment=${String(so.comment).slice(0, 280)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `${meta}\n\nOHLCV rows (time,open,high,low,close,volume):\n${csv}\n\nProduce the JSON draft.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const loginCheck = await verifyBriefingLoginIfRequired(body);
    if ('error' in loginCheck) {
      return NextResponse.json({ ok: false, error: loginCheck.error }, { status: 403 });
    }

    const openaiKey = resolveOpenAIKey(body.openaiApiKey, process.env.OPENAI_API_KEY);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const useGemini = !!geminiKey && !openaiKey;
    const key = useGemini ? geminiKey : openaiKey;
    if (!key) {
      return NextResponse.json(
        {
          ok: false,
          error: 'OpenAI 또는 Gemini API 키가 필요합니다. AI 패널 키 또는 서버 OPENAI_API_KEY / GEMINI_API_KEY.',
        },
        { status: 500 }
      );
    }

    const symbol = String(body.symbol || '').trim();
    const tf = String(body.timeframe || '').trim();
    const candles = Array.isArray(body.candles) ? body.candles : [];
    if (!symbol || !tf || candles.length < 8) {
      return NextResponse.json({ ok: false, error: 'symbol, timeframe, candles(>=8) 필수' }, { status: 400 });
    }

    const valid = candles.filter(
      (c) =>
        typeof c.time === 'number' &&
        typeof c.open === 'number' &&
        typeof c.high === 'number' &&
        typeof c.low === 'number' &&
        typeof c.close === 'number'
    );
    if (valid.length < 8) {
      return NextResponse.json({ ok: false, error: '캔들 필드(time,ohlc)가 올바른 행이 8개 미만입니다.' }, { status: 400 });
    }

    const tFirst = valid[0].time as number;
    const tLast = valid[valid.length - 1].time as number;
    const lastClose = valid[valid.length - 1].close as number;
    const barSec = candleBarDurationSec(tf, tLast);

    const userContent = buildUserPayload(symbol, tf, valid, body.analysis);

    let text = '';
    let inT = 0;
    let outT = 0;
    let provider: 'openai' | 'gemini' = 'openai';

    if (useGemini) {
      provider = 'gemini';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${SYSTEM}\n\n${userContent}` }] }],
            generationConfig: { maxOutputTokens: 1800, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(45000),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ ok: false, error: `Gemini: ${res.status} ${err}` }, { status: 500 });
      }
      const data = await res.json();
      text = stripJsonFence(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '');
      const usageMeta = data.usageMetadata || {};
      inT = usageMeta.promptTokenCount || 0;
      outT = usageMeta.candidatesTokenCount || Math.max(0, (usageMeta.totalTokenCount || 0) - inT);
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userContent },
          ],
          max_tokens: 2000,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ ok: false, error: `OpenAI: ${res.status} ${err}` }, { status: 500 });
      }
      const data = await res.json();
      text = stripJsonFence(data.choices?.[0]?.message?.content?.trim() ?? '');
      const usage = data.usage || {};
      inT = usage.prompt_tokens || 0;
      outT = usage.completion_tokens || 0;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: '모델 응답 JSON 파싱 실패', raw: text.slice(0, 400) },
        { status: 502 }
      );
    }

    const bundle = normalizeCandleAnalysisAiDrawResponse(parsed, tFirst, tLast, lastClose, {
      maxOverlays: 12,
      barSec,
    });
    const disclaimer = '(AI 작도·교육용 참고, 매매 조언 아님)';
    const head: string[] = [disclaimer];
    if (bundle.supportHoldRefPct != null) {
      head.push(`지지 참고치(AI): 약 ${bundle.supportHoldRefPct}% (통계적 확률 아님)`);
    }
    if (bundle.resistanceRefPct != null) {
      head.push(`저항 참고치(AI): 약 ${bundle.resistanceRefPct}% (통계적 확률 아님)`);
    }
    head.push(`방향(AI 참고): ${bundle.bias}`);
    const commentary = [...head, ...bundle.commentary];

    const estimatedCostUsd =
      provider === 'gemini' ? geminiFlashCostUsd(inT, outT) : openaiMiniCostUsd(inT, outT);

    return NextResponse.json({
      ok: true,
      overlays: bundle.overlays,
      commentary,
      bias: bundle.bias,
      supportHoldRefPct: bundle.supportHoldRefPct,
      resistanceRefPct: bundle.resistanceRefPct,
      usage: { provider, inputTokens: inT, outputTokens: outT, estimatedCostUsd },
      barSecUsed: barSec,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'candle-analysis-draw failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
