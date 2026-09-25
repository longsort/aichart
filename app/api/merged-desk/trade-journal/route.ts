import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import {
  mergeServerTradeEventJournal,
  readServerTradeEventJournal,
} from '@/lib/serverTradeEventJournal';
import type { TradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';

export const dynamic = 'force-dynamic';

/** GET — 서버 기록부 조회 */
export async function GET() {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const events = await readServerTradeEventJournal(auth.user);
  return NextResponse.json({ ok: true, count: events.length, events });
}

/** POST — 로컬 기록부 merge 업로드 */
export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const events = (body as { events?: TradeJournalEvent[] }).events;
  if (!Array.isArray(events)) {
    return NextResponse.json({ ok: false, error: 'events 배열이 필요합니다.' }, { status: 400 });
  }
  const result = await mergeServerTradeEventJournal(auth.user, events);
  return NextResponse.json({ ok: true, ...result });
}
