import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE = 'ailongshort-site';

function base64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Edge 런타임 — lib/appSiteAuth.ts 의 Node HMAC 과 동일한 hex 출력 */
async function verifySiteAuthCookieEdge(token: string, secret: string): Promise<boolean> {
  if (!token.includes('.')) return false;
  const dot = token.lastIndexOf('.');
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!b64 || !sig || !/^[0-9a-f]+$/i.test(sig)) return false;
  try {
    const payload = base64UrlToUtf8(b64);
    const expected = await hmacSha256Hex(secret, payload);
    if (expected.length !== sig.length) return false;
    let ok = true;
    for (let i = 0; i < expected.length; i++) {
      if (expected.charCodeAt(i) !== sig.charCodeAt(i)) ok = false;
    }
    if (!ok) return false;
    const { exp } = JSON.parse(payload) as { exp?: number };
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

const AUTH_WHITELIST_PREFIXES = [
  '/api/auth/verify-briefing',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/visitors',
  /** `/api/telegram/signal-capture` 는 사이트 로그인(쿠키) 필수 — 봇 토큰 악용·무인 스팸 방지 */
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  /** 서버 crontab — 각 라우트가 전용 `Secret`으로 검증 */
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next();
  }
  /** PM2/크론 루프가 `fetch(/api/analyze?...)` 자기호출 — 로그인 쿠키 대신 1회 시크릿(크론과 동일·또는 INTERNAL_ANALYZE_SECRET) */
  if (pathname.startsWith('/api/analyze')) {
    const want = (
      process.env.INTERNAL_ANALYZE_SECRET || process.env.TELEGRAM_MULTITF_CRON_SECRET || ''
    ).trim();
    if (want && request.headers.get('x-internal-analyze-secret') === want) {
      return NextResponse.next();
    }
  }
  if (AUTH_WHITELIST_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const secret = process.env.APP_SESSION_SECRET?.trim() || 'ailongshort-dev-session-secret';
  const raw = request.cookies.get(COOKIE)?.value;
  if (!raw || !(await verifySiteAuthCookieEdge(raw, secret))) {
    return NextResponse.json({ error: '로그인이 필요합니다.', code: 'SITE_AUTH_REQUIRED' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
