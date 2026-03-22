import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySiteAuthToken, APP_SITE_COOKIE } from '@/lib/appSiteAuth';

export const dynamic = 'force-dynamic';

/** 브라우저 세션(쿠키) 유효 여부 — 미들웨어 화이트리스트 (로그인 전 체크용) */
export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  if (!token || !verifySiteAuthToken(token)) {
    return NextResponse.json({ ok: false, authenticated: false });
  }
  return NextResponse.json({ ok: true, authenticated: true });
}
