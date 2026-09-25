import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import type { AutoScalpPaperTrade } from '@/lib/mergedDeskAutoScalpEngine';
import {
  appendServerAutoScalpTrade,
  readServerAutoScalpTrades,
  serverAutoScalpExpectancy,
} from '@/lib/serverAutoScalpPaperStore';

export const dynamic = 'force-dynamic';

/** GET — 페이퍼 이력·기대값 */
export async function GET(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const trades = readServerAutoScalpTrades(auth.user, symbol, 80);
  const expectancy = serverAutoScalpExpectancy(auth.user, symbol);
  return NextResponse.json({
    ok: true,
    symbol,
    trades,
    expectancy,
    note: '페이퍼 이력 · 실주문은 /live-order · 확정 수익 아님',
  });
}

/** POST — 종료 트레이드 업로드 */
export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const trade = (body as { trade?: AutoScalpPaperTrade }).trade;
  if (!trade || trade.phase !== 'CLOSED') {
    return NextResponse.json({ ok: false, error: 'CLOSED trade 필요' }, { status: 400 });
  }
  appendServerAutoScalpTrade(auth.user, trade);
  return NextResponse.json({
    ok: true,
    expectancy: serverAutoScalpExpectancy(auth.user, trade.symbol),
  });
}
