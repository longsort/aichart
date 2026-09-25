import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqualUtf8 } from '@/lib/serverRouteGuard';

/** crontab `/api/cron/*` — 시크릿 미설정이면 503, 불일치 401 */
export function assertTelegramCronSecret(req: NextRequest): NextResponse | null {
  const expected = (process.env.TELEGRAM_MULTITF_CRON_SECRET || '').trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_MULTITF_CRON_SECRET not set' },
      { status: 503 }
    );
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const hdr = req.headers.get('x-telegram-cron-secret')?.trim() || '';
  if (!timingSafeEqualUtf8(bearer, expected) && !timingSafeEqualUtf8(hdr, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
