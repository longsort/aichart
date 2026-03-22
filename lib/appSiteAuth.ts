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

/** 클라이언트에서 넘어온 문자열 정리 (전각·공백·IME 이슈 완화) */
function normalizeLoginField(s: unknown, lower = false): string {
  let t = String(s ?? '')
    .normalize('NFKC')
    .trim();
  if (lower) t = t.toLowerCase();
  return t;
}

export function verifyBriefingLoginBody(
  body: { briefingLogin?: { user?: string; password?: string } }
): { ok: true } | { ok: false; error: string } {
  const u = normalizeLoginField(body.briefingLogin?.user, true);
  const p = normalizeLoginField(body.briefingLogin?.password, false);

  /** 고정 계정은 .env와 무관하게 항상 허용 (서버 env 꼬임 시에도 접속) */
  if (u === DEFAULT_USER && p === DEFAULT_PASS) {
    return { ok: true };
  }

  const cred = getAppLoginCredentials();
  const cu = normalizeLoginField(cred.user, true);
  const cp = normalizeLoginField(cred.password, false);
  if (u === cu && p === cp) {
    return { ok: true };
  }

  return { ok: false, error: '아이디·비밀번호가 올바르지 않습니다.' };
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
