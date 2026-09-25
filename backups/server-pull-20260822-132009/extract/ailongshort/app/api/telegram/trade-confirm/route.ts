import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySiteAuthToken, APP_SITE_COOKIE } from '@/lib/appSiteAuth';
import { verifyTelegramSignal } from '@/lib/telegramSignalHmac';
import { sendTelegramHtmlToEnvChat } from '@/lib/telegramBotSendHtml';
import { formatTelegramTradeConfirmHtml } from '@/lib/telegramTradeConfirmMessage';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';

export const dynamic = 'force-dynamic';

function getSecondFactorSecret(): string {
  return (process.env.TELEGRAM_SIGNAL_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const rateBucket = new Map<string, { n: number; t: number }>();

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

const VALID_KINDS = new Set<ConfirmNotifyKind>([
  'candidate',
  'confirmed',
  'confirmed_full',
  'at_entry',
  'invalid',
]);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!checkRate(`tg-conf:${ip}`)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const secondFactor = getSecondFactorSecret();
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
    const notifyKey = String(body?.notifyKey || '').slice(0, 240);
    const kind = String(body?.kind || '') as ConfirmNotifyKind;
    if (!notifyKey || !VALID_KINDS.has(kind)) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }

    const symbol = String(body?.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = String(body?.timeframe || '1h');
    const desk = body?.desk as TradeConfirmDesk | undefined;
    if (!desk?.phase) {
      return NextResponse.json({ ok: false, error: 'desk_required' }, { status: 400 });
    }

    const html = formatTelegramTradeConfirmHtml({
      symbol,
      timeframe,
      desk: { ...desk, notifyKind: kind },
      taConfirmKo: typeof body?.confirmKo === 'string' ? body.confirmKo : undefined,
      taInvalidKo: typeof body?.invalidKo === 'string' ? body.invalidKo : undefined,
      uiModeKo: typeof body?.uiModeKo === 'string' ? body.uiModeKo : undefined,
    });

    const sent = await sendTelegramHtmlToEnvChat(html);
    if (sent.ok === false) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, notifyKey, kind });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'telegram send failed';
    console.error('[telegram-trade-confirm]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
