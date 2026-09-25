/**
 * 포지션 진입 텔레그램 — 클라이언트(가상) / 서버 공용.
 * POST { symbol, direction, price, sl?, tp?, ... }
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { notifyMergedDeskPositionEntry } from '@/lib/mergedDeskLiveEntryTelegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol || '').toUpperCase();
  const direction = body.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const price = Number(body.price);
  if (!symbol || !(price > 0)) {
    return NextResponse.json({ ok: false, error: 'symbol·price 필요' }, { status: 400 });
  }

  const r = await notifyMergedDeskPositionEntry({
    symbol,
    direction,
    price,
    sl: body.sl != null ? Number(body.sl) : null,
    tp: body.tp != null ? Number(body.tp) : null,
    size: body.size != null ? String(body.size) : null,
    marginUsdt: body.marginUsdt != null ? Number(body.marginUsdt) : null,
    equityPct: body.equityPct != null ? Number(body.equityPct) : null,
    leverage: body.leverage != null ? Number(body.leverage) : null,
    orderId: body.orderId != null ? String(body.orderId) : null,
    source: body.source != null ? String(body.source) : null,
    signalId: body.signalId != null ? String(body.signalId) : null,
    mode: body.mode === 'virtual' ? 'virtual' : 'live',
    timeframe: body.timeframe != null ? String(body.timeframe) : null,
    noteKo: body.noteKo != null ? String(body.noteKo) : null,
    signalKo: body.signalKo != null ? String(body.signalKo) : null,
    evidenceKo: body.evidenceKo != null ? String(body.evidenceKo) : null,
    fourStrategyId: body.fourStrategyId != null ? String(body.fourStrategyId) : null,
    analysisTags: Array.isArray(body.analysisTags)
      ? body.analysisTags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
      : null,
    entryScore:
      body.entryScore != null && Number(body.entryScore) > 0
        ? Number(body.entryScore)
        : null,
  });

  return NextResponse.json({
    ok: r.ok,
    error: r.error,
    msg: r.ok ? '텔레그램 진입 알림 전송' : r.error || '전송 실패',
  });
}
