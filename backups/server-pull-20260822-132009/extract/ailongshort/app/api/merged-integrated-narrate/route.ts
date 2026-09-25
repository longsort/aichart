import { NextRequest, NextResponse } from 'next/server';
import { callGemini } from '@/lib/ai/dualEngine';
import { verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

export const dynamic = 'force-dynamic';

const SYSTEM = `당신은 암호화폐 MTF 통합 분석 데스크용 한국어 AI 정밀 브리핑 작성자다.
입력 JSON의 masterDirection, modules, gatePartials, scenarios, htfContextKo, tradeLevels, analysisFusion(심층 다차원 점수·확인포인트)는 서버 엔진이 집계한 값이다.
deterministicNarrativeKo는 규칙 기반 엔진 요약이다 — 방향·등급을 바꾸지 말고, 이를 보완·구체화만 할 것.
analysisFusion.depthGrade·confirmationMet가 낮으면 신중·대기 톤을 유지할 것.
상위 TF(HTF) 맥락을 반드시 1문장에 언급하고, 무효(invalid) 시나리오·리스크를 짧게 포함할 것.
출력은 한국어 3~4문장, 최대 400자, 마크다운·목록·따옴표 없이 본문만.
투자 권유·확정 수익 표현 금지. 조건부·검증 필요성 유지.`;

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
    const chartTf = String(body?.chartTf ?? body?.timeframe ?? '').trim() || '—';
    const payload = body?.integrated;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'integrated 필수' }, { status: 400 });
    }

    const userMsg = `심볼 ${symbol}, 차트 TF ${chartTf}.
아래는 ARES 통합 연동 허브 JSON이다. MTF·Strike·트레이드·차트 AI가 어떻게 맞거나 어긋나는지 트레이더가 이해하기 쉽게 설명하라.

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
