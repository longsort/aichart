import { NextRequest, NextResponse } from 'next/server';
import { verifyBriefingLoginBody, buildSiteAuthToken, APP_SITE_COOKIE, siteAuthCookieOptions } from '@/lib/appSiteAuth';

export const dynamic = 'force-dynamic';

/** 앱 로그인 검증 + HttpOnly 세션 쿠키 발급. POST body: { briefingLogin: { user, password } } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = verifyBriefingLoginBody(body as { briefingLogin?: { user?: string; password?: string } });
    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(APP_SITE_COOKIE, buildSiteAuthToken(), siteAuthCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식 오류' }, { status: 400 });
  }
}
