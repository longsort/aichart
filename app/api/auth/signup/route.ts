import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 공개 회원가입 비활성 — 허용 계정(u1, aichart1~3)만 로그인.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: '회원가입이 비활성화되어 있습니다. 허용된 계정으로 로그인하세요.' },
    { status: 403 },
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: '회원가입이 비활성화되어 있습니다.' },
    { status: 403 },
  );
}
