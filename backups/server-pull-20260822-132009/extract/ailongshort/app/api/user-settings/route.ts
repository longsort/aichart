import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readUserSettings, writeUserSettings } from '@/lib/serverUserSettings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const settings = await readUserSettings(auth.user);
  return NextResponse.json({ ok: true, user: auth.user, settings: settings ?? {} });
}

export async function PUT(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const settings = (body as { settings?: Record<string, unknown> }).settings;
  if (!settings || typeof settings !== 'object') {
    return NextResponse.json({ ok: false, error: 'settings 객체가 필요합니다.' }, { status: 400 });
  }
  try {
    await writeUserSettings(auth.user, settings);
    return NextResponse.json({ ok: true, user: auth.user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[user-settings] write failed:', msg);
    return NextResponse.json(
      { ok: false, error: '설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', detail: msg },
      { status: 500 }
    );
  }
}
