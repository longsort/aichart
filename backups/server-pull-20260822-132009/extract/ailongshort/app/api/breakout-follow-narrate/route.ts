import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai/dualEngine';
import { verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';
import type { BreakoutFollowChain } from '@/lib/breakoutFollowChain';

export const dynamic = 'force-dynamic';

const SYSTEM = `당신은 암호화폐 차트용 한국어 코멘트 작성자다.
입력 JSON의 phase·bias·upPath·downPath·headlineKo는 서버 엔진이 확정한 연동 시나리오다.
방향·단계를 바꾸지 말 것. 돌파 후 상방·이탈 시 하방 경로를 1~2문장으로 짧게 연결해 설명하라.
최대 240자, 마크다운·목록 없음, 투자 권유·확정 수익 금지.`;

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
    const chain = body?.breakoutFollow as BreakoutFollowChain | undefined;
    if (!chain || typeof chain !== 'object') {
      return NextResponse.json({ error: 'breakoutFollow 필수' }, { status: 400 });
    }

    const userMsg = `심볼 ${symbol}, TF ${timeframe}.
돌파·안착 연동 체인(JSON). 돌파/안착 이후 상방·하방 목표를 한 흐름으로 설명하라.

${JSON.stringify({
      phase: chain.phase,
      bias: chain.bias,
      headlineKo: chain.headlineKo,
      actionLineKo: chain.actionLineKo,
      oppositeLineKo: chain.oppositeLineKo,
      trigger: chain.triggerPrice,
      invalidation: chain.invalidationPrice,
      upPath: chain.upPath,
      downPath: chain.downPath,
    })}`;

    const result = await callGemini(userMsg, SYSTEM, key, null);
    let narrative = String(result.reply || '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    if (!narrative) {
      return NextResponse.json({ error: '빈 응답' }, { status: 502 });
    }

    return NextResponse.json({ narrative, usage: result.usage });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    const is429 = msg.includes('429') || msg.includes('한도');
    return NextResponse.json(
      { error: is429 ? '요청 한도 초과, 잠시 후 재시도' : msg || 'narrate failed' },
      { status: 500 }
    );
  }
}
