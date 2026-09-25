import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai/dualEngine';
import { verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

export const dynamic = 'force-dynamic';

const SYSTEM = `당신은 마감·안착 데스크용 한국어 AI 정밀 브리핑 작성자다.
입력 JSON의 masterDirection, modules, gatePartials, scenarios, htfContextKo, tradeLevels는 서버가 집계한 값이다.
deterministicNarrativeKo가 있으면 방향·등급을 바꾸지 말고 보완만 할 것.
상위 TF 맥락·무효 시나리오·리스크를 1문장 이상 포함.
출력은 3~4문장, 최대 420자, 마크다운·목록·따옴표 없이 본문만.
투자 권유·확정 수익 금지.`;

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
    const chartTf = String(body?.chartTf ?? '').trim() || '—';
    const payload = body?.briefing;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'briefing 필수' }, { status: 400 });
    }

    const userMsg = `심볼 ${symbol}, 차트 TF ${chartTf}.
아래는 마감·안착 통합 AI 정밀 브리핑 JSON이다. 핵심보드·Strike·마감안착·트레이드·전 TF가 어떻게 맞는지 설명하라.

${JSON.stringify(payload)}`;

    const result = await callGemini(userMsg, SYSTEM, key, null);
    let narrative = String(result.reply || '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 420);

    if (!narrative) {
      return NextResponse.json({ error: '빈 응답' }, { status: 502 });
    }

    return NextResponse.json({ narrative, usage: result.usage });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const is429 = msg.includes('429') || msg.includes('한도');
    return NextResponse.json(
      { error: is429 ? '요청 한도 초과, 잠시 후 재시도' : msg || 'narrate failed' },
      { status: 500 }
    );
  }
}
