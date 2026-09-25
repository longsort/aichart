import { NextResponse } from 'next/server';
import { isValidOpenAIKeyFormat } from '@/lib/openaiKeyFormat';

export const dynamic = 'force-dynamic';

export async function GET() {
  const openaiEnv = process.env.OPENAI_API_KEY?.trim() ?? '';
  return NextResponse.json({
    openai: isValidOpenAIKeyFormat(openaiEnv),
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    clientOpenAIAllowed: true,
    /** 사이트·AI API 모두 앱 로그인 필요 (기본 aichart / longshort) */
    requiresBriefingLogin: true,
  });
}
