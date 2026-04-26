import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readTradeLearning, writeTradeLearning } from '@/lib/serverTradeLearning';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const state = await readTradeLearning(auth.user);
  return NextResponse.json({ ok: true, state: state ?? null });
}

export async function PUT(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const state = (body as { state?: Record<string, unknown> }).state;
  if (!state || typeof state !== 'object') {
    return NextResponse.json({ ok: false, error: 'state 객체가 필요합니다.' }, { status: 400 });
  }
  await writeTradeLearning(auth.user, state);
  return NextResponse.json({ ok: true });
}
