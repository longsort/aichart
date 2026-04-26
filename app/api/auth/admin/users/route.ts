import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { createUser } from '@/lib/serverUsers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  if (auth.role !== 'master_admin') return NextResponse.json({ ok: false, error: '마스터 관리자만 계정을 만들 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const user = String((body as { user?: unknown }).user ?? '');
  const password = String((body as { password?: unknown }).password ?? '');
  const role = (body as { role?: string }).role === 'master_admin' ? 'master_admin' : 'user';
  const created = await createUser(user, password, role);
  if (!created.ok) return NextResponse.json(created, { status: 400 });
  return NextResponse.json({ ok: true, user: user.trim().toLowerCase(), role });
}
