import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySiteAuthToken, APP_SITE_COOKIE } from '@/lib/appSiteAuth';
import { signTelegramSignal, telegramSignalHmacTimeBucket } from '@/lib/telegramSignalHmac';

export const dynamic = 'force-dynamic';

function getSecondFactorSecret(): string {
  return (process.env.TELEGRAM_SIGNAL_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

/**
 * 2차 검증 토큰(30초 버킷 HMAC) 발급. `TELEGRAM_SIGNAL_SECRET` 미설정 시 2단계 비활성.
 * 클라이언트는 `/api/telegram/signal-capture` 직전에 `X-Telegram-Signal-Auth` 로 전달.
 */
export async function GET() {
  const sec = getSecondFactorSecret();
  if (!sec) {
    return NextResponse.json({ required: false as const, a: null as null, bucket: null as null });
  }
  const raw = cookies().get(APP_SITE_COOKIE)?.value;
  const payload = verifySiteAuthToken(raw);
  if (!payload) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const a = signTelegramSignal(payload.user, sec);
  return NextResponse.json({ required: true as const, a, bucket: telegramSignalHmacTimeBucket() });
}
