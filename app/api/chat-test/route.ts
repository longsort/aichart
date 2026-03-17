import { NextRequest, NextResponse } from 'next/server';
import { callOpenAI, callGemini } from '@/lib/ai/dualEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider');
  if (provider !== 'openai' && provider !== 'gemini') {
    return NextResponse.json({ ok: false, error: 'provider는 openai 또는 gemini여야 합니다.' }, { status: 400 });
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json({
        ok: false,
        error: 'OPENAI_API_KEY가 설정되지 않았습니다.',
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
