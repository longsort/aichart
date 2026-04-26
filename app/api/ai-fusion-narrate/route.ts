import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai/dualEngine';
import { verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';
import type { AiFusionSignal } from '@/lib/aiFusionSignal';

export const dynamic = 'force-dynamic';

const SYSTEM = `당신은 암호화폐 차트용 한국어 코멘트 작성자다.
입력 JSON의 verdict(LONG/SHORT/WATCH), tier(confirmed/likely/watch), confidence, reasonCodes는 서버 엔진이 이미 확정한 값이다.
절대로 방향·등급을 바꾸거나 반대로 해석하지 말 것.
출력은 반드시 한국어 1~2문장, 최대 220자, 마크다운·목록·따옴표 없이 본문만. 투자 권유 문구는 쓰지 말 것.`;

export async function POST(req: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY 미설정', missingKey: 'GEMINI_API_KEY' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const loginCheck = await verifyBriefingLoginIfRequired(body as { briefingLogin?: { user?: string; password?: string } });
    if (loginCheck.ok === false) {
      return NextResponse.json({ error: loginCheck.error }, { status: 403 });
    }

    const symbol = String(body?.symbol ?? '').trim() || '—';
    const timeframe = String(body?.timeframe ?? '').trim() || '—';
    const fusion = body?.fusion as AiFusionSignal | undefined;
    if (!fusion || typeof fusion !== 'object') {
      return NextResponse.json({ error: 'fusion 필수' }, { status: 400 });
    }

    const userMsg = `심볼 ${symbol}, 타임프레임 ${timeframe}.
아래는 서버 합성 신호(JSON)다. 이를 바탕으로 트레이더가 이해하기 쉬운 짧은 설명만 작성하라.

${JSON.stringify({
      verdict: fusion.verdict,
      tier: fusion.tier,
      confidence: fusion.confidence,
      markerLabel: fusion.markerLabel,
      narrative: fusion.narrative,
      reasonCodes: fusion.reasonCodes,
      longHits: fusion.longHits,
      shortHits: fusion.shortHits,
    })}`;

    const result = await callGemini(userMsg, SYSTEM, key, null);
    let narrative = String(result.reply || '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);

    if (!narrative) {
      return NextResponse.json({ error: '빈 응답' }, { status: 502 });
    }

    return NextResponse.json({
      narrative,
      usage: result.usage,
    });
  } catch (e: any) {
    const msg = e?.message || '';
    const is429 = msg.includes('429') || msg.includes('한도');
    return NextResponse.json(
      { error: is429 ? '요청 한도 초과, 잠시 후 재시도' : msg || 'narrate failed' },
      { status: 500 }
    );
  }
}
