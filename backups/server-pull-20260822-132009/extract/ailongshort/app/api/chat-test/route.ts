import { NextRequest, NextResponse } from 'next/server';
import { callOpenAI, callGemini } from '@/lib/ai/dualEngine';
import { resolveOpenAIKey, verifyBriefingLoginIfRequired } from '@/lib/resolveOpenAIKey';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider');
  if (provider !== 'openai' && provider !== 'gemini') {
    return NextResponse.json({ ok: false, error: 'provider는 openai 또는 gemini여야 합니다.' }, { status: 400 });
  }

  if (provider === 'openai') {
    const key = resolveOpenAIKey(undefined, process.env.OPENAI_API_KEY);
    if (!key) {
      return NextResponse.json({
        ok: false,
        error: '서버에 OPENAI_API_KEY가 없습니다. 패널에서 키를 입력한 뒤 POST 테스트를 사용하세요.',
        missingKey: 'OPENAI_API_KEY',
      }, { status: 500 });
    }
    try {
      await callOpenAI('연결 테스트', 'You reply with exactly: OK', key, null);
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      const msg = e?.message || '';
      const is429 = msg.includes('429') || msg.includes('한도 초과');
      const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : msg;
      return NextResponse.json({ ok: false, error: error || 'OpenAI 연결 실패' }, { status: 500 });
    }
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return NextResponse.json({
      ok: false,
      error: 'GEMINI_API_KEY(또는 GOOGLE_API_KEY)가 설정되지 않았습니다.',
      missingKey: 'GEMINI_API_KEY',
    }, { status: 500 });
  }
  try {
    await callGemini('연결 테스트', 'You reply with exactly: OK', key, null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || '';
    const is429 = msg.includes('429') || msg.includes('한도 초과');
    const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : msg;
    return NextResponse.json({ ok: false, error: error || 'Gemini 연결 실패' }, { status: 500 });
  }
}

/** 클라이언트에서 입력한 OpenAI 키 + 브리핑 로그인으로 연결 확인 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const provider = body.provider;
  if (provider !== 'openai' && provider !== 'gemini') {
    return NextResponse.json({ ok: false, error: 'provider는 openai 또는 gemini여야 합니다.' }, { status: 400 });
  }

  const loginCheck = await verifyBriefingLoginIfRequired(body as { briefingLogin?: { user?: string; password?: string } });
  if ('error' in loginCheck) {
    return NextResponse.json({ ok: false, error: loginCheck.error }, { status: 403 });
  }

  if (provider === 'openai') {
    const key = resolveOpenAIKey(body.openaiApiKey as string | undefined, process.env.OPENAI_API_KEY);
    if (!key) {
      return NextResponse.json(
        { ok: false, error: 'OpenAI API 키가 없습니다.', missingKey: 'OPENAI_API_KEY' },
        { status: 500 }
      );
    }
    try {
      await callOpenAI('연결 테스트', 'You reply with exactly: OK', key, null);
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      const msg = e?.message || '';
      const is429 = msg.includes('429') || msg.includes('한도 초과');
      const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : msg;
      return NextResponse.json({ ok: false, error: error || 'OpenAI 연결 실패' }, { status: 500 });
    }
  }

  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!gKey) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY(또는 GOOGLE_API_KEY)가 설정되지 않았습니다.', missingKey: 'GEMINI_API_KEY' },
      { status: 500 }
    );
  }
  try {
    await callGemini('연결 테스트', 'You reply with exactly: OK', gKey, null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || '';
    const is429 = msg.includes('429') || msg.includes('한도 초과');
    const error = is429 ? '요청 한도 초과, 잠시 후 재시도' : msg;
    return NextResponse.json({ ok: false, error: error || 'Gemini 연결 실패' }, { status: 500 });
  }
}
