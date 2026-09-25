/**
 * POST/GET /api/eagle1/tapoint-accum
 * 타점엔진 누적(성적·거절·저널·시드·진입라벨) 서버 머지 영속.
 * 패치해도 유지 · 빈 덮어쓰기 거부 · 확정수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import {
  readServerTapointAccum,
  writeServerTapointAccumMerge,
  type TapointAccumBlob,
} from '@/lib/tapointAccumServerPersist';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인 필요' }, { status: 401 });
  }
  const blob = readServerTapointAccum(auth.user);
  return NextResponse.json({
    ok: true,
    blob: blob || { updatedAt: 0 },
    hintKo: '서버 누적 · 패치 후에도 유지 · 확정아님',
  });
}

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인 필요' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<TapointAccumBlob>;
  const next = writeServerTapointAccumMerge(auth.user, body);
  return NextResponse.json({
    ok: true,
    updatedAt: next.updatedAt,
    closedN: next.scorecard?.closed?.length ?? 0,
    rejectN: Array.isArray(next.rejects) ? next.rejects.length : 0,
    journalN: Array.isArray(next.journal) ? next.journal.length : 0,
    hintKo: '머지저장 · 누적유지',
  });
}
