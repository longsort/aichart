/**
 * 수익패턴 서버 ARM 동기화.
 * POST: 브라우저 ARM ON/OFF → 서버 파일
 * GET: 서버 ARM 상태
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import {
  ppServerEntryReady,
  readPpServerArm,
  writePpServerArm,
} from '@/lib/profitPattern15m/serverArm';
import { PROFIT_PATTERN_CORE_SYMBOLS } from '@/lib/profitPattern15m/skill';
import { readExchangeKeysMeta } from '@/lib/serverExchangeKeysStore';

export const dynamic = 'force-dynamic';

function authUser(): string | null {
  try {
    const token = cookies().get(APP_SITE_COOKIE)?.value;
    const auth = verifySiteAuthToken(token);
    return auth?.user || null;
  } catch {
    return null;
  }
}

function bitgetKeysConfigured(user: string | null): boolean {
  if (user) {
    const meta = readExchangeKeysMeta(user);
    if (meta?.hasSecret && meta?.hasPassphrase) return true;
  }
  const apiKey = (process.env.BITGET_API_KEY || '').trim();
  const apiSecret = (process.env.BITGET_API_SECRET || '').trim();
  const passphrase = (process.env.BITGET_API_PASSPHRASE || '').trim();
  return Boolean(apiKey && apiSecret && passphrase);
}

export async function GET() {
  const user = authUser();
  const arm = readPpServerArm();
  const keys = bitgetKeysConfigured(user);
  return NextResponse.json({
    ok: true,
    arm,
    serverEntryReady: ppServerEntryReady(arm),
    bitgetKeysConfigured: keys,
    noteKo: keys
      ? '키 있음 · ARM ON+cron 시 실주문'
      : '키 없음 · ARM ON+cron 시 페이퍼 기록만',
  });
}

export async function POST(req: NextRequest) {
  const user = authUser();
  /** cron/내부도 허용 — 시크릿 헤더 */
  const cronSecret = (
    process.env.PROFIT_PATTERN_CRON_SECRET ||
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
    ''
  ).trim();
  const bearer =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const internalOk = Boolean(cronSecret && bearer === cronSecret);
  if (!user && !internalOk) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    liveArmed?: boolean;
    symbols?: string[];
    leverage?: number;
    marginUsdt?: number;
    paperOnly?: boolean;
  };

  const symbols = Array.isArray(body.symbols) ? body.symbols : undefined;

  const arm = writePpServerArm({
    liveArmed: body.liveArmed,
    symbols: symbols?.length ? symbols : [...PROFIT_PATTERN_CORE_SYMBOLS],
    leverage: body.leverage,
    marginUsdt: body.marginUsdt,
    paperOnly: body.paperOnly,
    updatedBy: user || 'cron',
  });

  return NextResponse.json({
    ok: true,
    arm,
    serverEntryReady: ppServerEntryReady(arm),
    bitgetKeysConfigured: bitgetKeysConfigured(user),
  });
}
