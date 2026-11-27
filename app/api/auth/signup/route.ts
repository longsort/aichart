import { NextRequest, NextResponse } from 'next/server';
import {
  buildSiteAuthToken,
  APP_SITE_COOKIE,
  siteAuthCookieOptions,
} from '@/lib/appSiteAuth';
import { createUser } from '@/lib/serverUsers';

export const dynamic = 'force-dynamic';

/**
 * 자가 회원가입.
 * POST { user, password } → role=inventory 고정 (마스터가 나중에 charts/both 부여).
 * 성공 시 바로 로그인 쿠키 발급 → /dashboard
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = String((body as { user?: unknown }).user ?? '');
    const password = String((body as { password?: unknown }).password ?? '');
    const created = await createUser(user, password, 'inventory');
    if (created.ok === false) {
      return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
    }
    const res = NextResponse.json({
      ok: true,
      user: user.trim().toLowerCase(),
      role: created.role,
      redirectTo: '/dashboard',
    });
    res.cookies.set(
      APP_SITE_COOKIE,
      buildSiteAuthToken(user.trim().toLowerCase(), created.role),
      siteAuthCookieOptions()
    );
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식 오류' }, { status: 400 });
  }
}
