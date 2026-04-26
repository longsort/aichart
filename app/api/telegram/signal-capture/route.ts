import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySiteAuthToken, APP_SITE_COOKIE } from '@/lib/appSiteAuth';
import { verifyTelegramSignal } from '@/lib/telegramSignalHmac';
import { escapeTelegramHtml } from '@/lib/telegramFormatHtml';

export const dynamic = 'force-dynamic';

function getSecondFactorSecret(): string {
  return (process.env.TELEGRAM_SIGNAL_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024; // 텔레 사진·메모리 보호
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // IP 기준 1분당
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

function sanitizeEnvValue(v: string | undefined | null): string {
  return String(v ?? '').trim().replace(/^['"]+|['"]+$/g, '');
}

function parseDataUrlImage(
  dataUrl: string
): { mime: string; bytes: Buffer; error?: string } | null {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2]!, 'base64');
    if (bytes.length > MAX_PHOTO_BYTES) {
      return { mime: m[1]!, bytes: Buffer.alloc(0), error: 'image_too_large' };
    }
    return { mime: m[1]!, bytes };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = sanitizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  /** 클라이언트 `chatId` 는 신뢰하지 않음(임의 채팅으로 봇 스팸 방지) */
  const envChatId = sanitizeEnvValue(process.env.TELEGRAM_CHAT_ID);
  const ip = clientIp(req);
  if (!checkRate(`tg-cap:${ip}`)) {
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
      return NextResponse.json(
        { ok: false, error: 'signal_auth_invalid' },
        { status: 403 }
      );
    }
  }

  try {
    const body = await req.json();
    const debugMeta = {
      symbol: String(body?.symbol || ''),
      timeframe: String(body?.timeframe || ''),
      eventKey: String(body?.eventKey || '').slice(0, 200),
    };
    const chatId = envChatId;
    if (!token || !chatId) {
      return NextResponse.json(
        { ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' },
        { status: 400 }
      );
    }
    const rawText = String(body?.text || '').slice(0, 3900) || '차트 신호 알림';
    const text = escapeTelegramHtml(rawText);
    const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body?.imageDataUrl : '';
    const parsed = imageDataUrl ? parseDataUrlImage(imageDataUrl) : null;
    if (parsed?.error === 'image_too_large') {
      return NextResponse.json({ ok: false, error: 'image_too_large' }, { status: 413 });
    }
    if (parsed && !parsed.error && parsed.bytes.length > 0) {
      const form = new FormData();
      form.set('chat_id', chatId);
      form.set('caption', text.slice(0, 900));
      form.set('parse_mode', 'HTML');
      const photoBytes = new Uint8Array(parsed.bytes);
      form.set('photo', new Blob([photoBytes], { type: parsed.mime }), 'chart.png');
      const photoRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      if (photoRes.ok) return NextResponse.json({ ok: true, sent: 'photo' });
      const photoErr = await photoRes.text().catch(() => '');
      const msgFallback = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      if (msgFallback.ok) return NextResponse.json({ ok: true, sent: 'message-fallback' });
      const msgFallbackErr = await msgFallback.text().catch(() => '');
      console.error('[telegram-signal-capture] photo+fallback failed', {
        ...debugMeta,
        photoStatus: photoRes.status,
        photoErr,
        messageStatus: msgFallback.status,
        messageErr: msgFallbackErr,
      });
      throw new Error(
        `telegram photo ${photoRes.status}${photoErr ? `: ${photoErr}` : ''}; message ${msgFallback.status}${
          msgFallbackErr ? `: ${msgFallbackErr}` : ''
        }`
      );
    }

    const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!msgRes.ok) {
      const msgErr = await msgRes.text().catch(() => '');
      console.error('[telegram-signal-capture] message failed', {
        ...debugMeta,
        status: msgRes.status,
        msgErr,
      });
      throw new Error(`telegram ${msgRes.status}${msgErr ? `: ${msgErr}` : ''}`);
    }
    return NextResponse.json({ ok: true, sent: 'message' });
  } catch (e: any) {
    console.error('[telegram-signal-capture] unhandled error', {
      error: e?.message || 'telegram send failed',
    });
    return NextResponse.json(
      { ok: false, error: e?.message || 'telegram send failed' },
      { status: 500 }
    );
  }
}
