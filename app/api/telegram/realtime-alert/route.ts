import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySiteAuthToken, APP_SITE_COOKIE } from '@/lib/appSiteAuth';
import { verifyTelegramSignal } from '@/lib/telegramSignalHmac';
import { sendTelegramHtmlToEnvChat } from '@/lib/telegramBotSendHtml';

export const dynamic = 'force-dynamic';

function getSecondFactorSecret(): string {
  return (process.env.TELEGRAM_SIGNAL_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 50;
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
  if (prev && now - prev < 120_000) return false;
  dedupBucket.set(eventKey, now);
  if (dedupBucket.size > 2000) {
    const keys = [...dedupBucket.keys()].slice(0, 800);
    for (const k of keys) dedupBucket.delete(k);
  }
  return true;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (m) => (m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&amp;'));
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!checkRate(`tg-rt:${ip}`)) {
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
    const eventKey = String(body?.eventKey || '').slice(0, 260);
    if (!eventKey) {
      return NextResponse.json({ ok: false, error: 'event_key_required' }, { status: 400 });
    }
    if (!dedupPass(eventKey)) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    const symbol = String(body?.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = String(body?.timeframe || '1h');
    const alertText = String(body?.alertText || '실시간 경보');
    const defendState = String(body?.defendState || '');
    const strongSide = String(body?.strongSide || 'WAIT');
    const priority = String(body?.priority || '대기');
    const rr = body?.rr != null && Number.isFinite(Number(body.rr)) ? Number(body.rr) : null;
    const defendPrice = body?.defendPrice != null && Number.isFinite(Number(body.defendPrice)) ? Number(body.defendPrice) : null;
    const attackPrice = body?.attackPrice != null && Number.isFinite(Number(body.attackPrice)) ? Number(body.attackPrice) : null;
    const buyPressure = Number.isFinite(Number(body?.buyPressure)) ? Number(body.buyPressure) : null;
    const sellPressure = Number.isFinite(Number(body?.sellPressure)) ? Number(body.sellPressure) : null;

    const html = [
      `<b>⚡ 실시간 신규 경보</b>`,
      `${esc(symbol)} · ${esc(timeframe)}`,
      '',
      `<b>${esc(alertText)}</b>`,
      defendState ? `상태: <b>${esc(defendState)}</b>` : '',
      `신호: <b>${esc(strongSide)}</b> · 우선순위: <b>${esc(priority)}</b>`,
      `RR: <b>${rr != null ? rr.toFixed(2) : '–'}</b>`,
      `방어: <b>${defendPrice != null ? defendPrice.toLocaleString() : '–'}</b> · 공격: <b>${attackPrice != null ? attackPrice.toLocaleString() : '–'}</b>`,
      `유입: 매수 <b>${buyPressure != null ? `${buyPressure}%` : '–'}</b> / 매도 <b>${sellPressure != null ? `${sellPressure}%` : '–'}</b>`,
    ]
      .filter(Boolean)
      .join('\n');

    const sent = await sendTelegramHtmlToEnvChat(html);
    if (sent.ok === false) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, eventKey });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'telegram realtime alert failed';
    console.error('[telegram-realtime-alert]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
