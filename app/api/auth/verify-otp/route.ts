import { NextRequest, NextResponse } from 'next/server';
import {
  buildSiteAuthToken,
  APP_SITE_COOKIE,
  siteAuthCookieOptions,
  homePathForUser,
  normalizeAppRole,
  type AppRole,
} from '@/lib/appSiteAuth';
import { getClientIp } from '@/lib/auth/client-ip';
import { verifyOtpChallenge } from '@/lib/auth/login-otp-store';

export const dynamic = 'force-dynamic';

/** 외부 IP OTP 확인 후 세션 쿠키 발급 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { challengeId?: string; code?: string };
    const challengeId = String(body.challengeId || '').trim();
    const code = String(body.code || '').trim();
    if (!challengeId || !code) {
      return NextResponse.json({ ok: false, error: '인증 코드와 세션이 필요합니다.' }, { status: 400 });
    }
    const ip = getClientIp(req);
    const result = verifyOtpChallenge(challengeId, code, ip);
    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
    }
    const role = normalizeAppRole(result.role) as AppRole;
    const redirectTo = homePathForUser(result.user, role);
    const res = NextResponse.json({
      ok: true,
      user: result.user,
      role,
      redirectTo,
    });
    res.cookies.set(APP_SITE_COOKIE, buildSiteAuthToken(result.user, role), siteAuthCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식 오류' }, { status: 400 });
  }
}
