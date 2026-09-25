/**
 * POST /api/telegram/tapoint-confirm
 * 타점 확정롱/숏 전환 알림 · 확정 수익 아님.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySiteAuthToken, APP_SITE_COOKIE } from '@/lib/appSiteAuth';
import { verifyTelegramSignal } from '@/lib/telegramSignalHmac';
import { sendTelegramHtmlToEnvChat } from '@/lib/telegramBotSendHtml';
import { buildTapointConfirmTelegramHtml } from '@/lib/eagle1Tapoint/tapointConfirmAlert';

export const dynamic = 'force-dynamic';

function getSecondFactorSecret(): string {
  return (process.env.TELEGRAM_SIGNAL_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const rateBucket = new Map<string, { n: number; t: number }>();
const dedupBucket = new Map<string, number>();

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function checkRate(key: string): boolean {
  const now = Date.now();
  const row = rateBucket.get(key);
  if (!row || now - row.t > RATE_WINDOW_MS) {
    rateBucket.set(key, { n: 1, t: now });
    return true;
  }
  if (row.n >= RATE_MAX) return false;
  row.n += 1;
  return true;
}

function dedupPass(eventKey: string): boolean {
  const now = Date.now();
  const prev = dedupBucket.get(eventKey);
  if (prev && now - prev < 15 * 60_000) return false;
  dedupBucket.set(eventKey, now);
  if (dedupBucket.size > 2000) {
    const keys = [...dedupBucket.keys()].slice(0, 800);
    for (const k of keys) dedupBucket.delete(k);
  }
  return true;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!checkRate(`tg-tap-confirm:${ip}`)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const secondFactor = getSecondFactorSecret();
  const botOn = Boolean((process.env.TELEGRAM_BOT_TOKEN || '').trim());
  if (botOn && !secondFactor) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_SIGNAL_SECRET required when TELEGRAM_BOT_TOKEN is set' },
      { status: 503 }
    );
  }
  if (secondFactor) {
    const raw = cookies().get(APP_SITE_COOKIE)?.value;
    const session = verifySiteAuthToken(raw);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const sig = req.headers.get('x-telegram-signal-auth')?.trim() || '';
    if (!verifyTelegramSignal(sig, session.user, secondFactor)) {
      return NextResponse.json({ ok: false, error: 'signal_auth_invalid' }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const eventKey = String(body?.eventKey || '').slice(0, 280);
    if (!eventKey) {
      return NextResponse.json({ ok: false, error: 'event_key_required' }, { status: 400 });
    }
    if (!dedupPass(eventKey)) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    const side = body?.side === 'LONG' || body?.side === 'SHORT' ? body.side : null;
    let html = typeof body?.html === 'string' ? body.html : '';
    if (!html && side) {
      html = buildTapointConfirmTelegramHtml({
        symbol: String(body?.symbol || 'BTCUSDT'),
        timeframe: String(body?.timeframe || '—'),
        side,
        entry: body?.entry != null ? Number(body.entry) : null,
        sl: body?.sl != null ? Number(body.sl) : null,
        tp: body?.tp != null ? Number(body.tp) : null,
        signalId: body?.signalId != null ? String(body.signalId) : null,
        reasonKo: typeof body?.reasonKo === 'string' ? body.reasonKo : null,
        entryScore: body?.entryScore != null ? Number(body.entryScore) : null,
      });
    }
    if (!html) {
      return NextResponse.json({ ok: false, error: 'html_or_side_required' }, { status: 400 });
    }

    const sent = await sendTelegramHtmlToEnvChat(html);
    if (sent.ok === false) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, eventKey });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'telegram tapoint confirm failed';
    console.error('[telegram-tapoint-confirm]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
