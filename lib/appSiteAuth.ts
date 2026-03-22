/**
 * 사이트·AI 공통 앱 로그인 (서버 전용).
 * 기본 ID/비번: aichart / longshort — 운영에서는 APP_BRIEFING_LOGIN_* 및 APP_SESSION_SECRET 으로 변경 권장.
 */
import crypto from 'crypto';

export const APP_SITE_COOKIE = 'ailongshort-site';

export function getAppSessionSecret(): string {
  return process.env.APP_SESSION_SECRET?.trim() || 'ailongshort-dev-session-secret';
}

/** 로그인에 사용할 계정. 기본: aichart / longshort (env로 오버라이드 가능) */
const DEFAULT_USER = 'aichart';
const DEFAULT_PASS = 'longshort';

export function getAppLoginCredentials(): { user: string; password: string } {
  const envUser = process.env.APP_BRIEFING_LOGIN_USER?.trim();
  const envPass = process.env.APP_BRIEFING_LOGIN_PASSWORD?.trim();
  return {
    user: envUser && envUser.length > 0 ? envUser : DEFAULT_USER,
    password: envPass && envPass.length > 0 ? envPass : DEFAULT_PASS,
  };
}

export function verifyBriefingLoginBody(
  body: { briefingLogin?: { user?: string; password?: string } }
): { ok: true } | { ok: false; error: string } {
  const cred = getAppLoginCredentials();
  const u = (body.briefingLogin?.user ?? '').toString().trim();
  const p = (body.briefingLogin?.password ?? '').toString().trim();
  if (u !== cred.user || p !== cred.password) {
    return { ok: false, error: '아이디·비밀번호가 올바르지 않습니다.' };
  }
  return { ok: true };
}

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7일

export function buildSiteAuthToken(): string {
  const exp = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payload = JSON.stringify({ exp });
  const secret = getAppSessionSecret();
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${b64}.${sig}`;
}

export function verifySiteAuthToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const dot = token.lastIndexOf('.');
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!b64 || !sig || !/^[0-9a-f]+$/i.test(sig)) return false;
  try {
    const payload = Buffer.from(b64, 'base64url').toString('utf8');
    const secret = getAppSessionSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const { exp } = JSON.parse(payload) as { exp?: number };
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

export function siteAuthCookieOptions() {
  const useHttps = process.env.APP_USE_HTTPS === 'true';
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
    secure: useHttps,
  };
}
