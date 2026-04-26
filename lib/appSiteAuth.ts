/**
 * 사이트·AI 공통 앱 로그인 (서버 전용).
 * 기본 계정:
 * - aichart1 ~ aichart10 / longshort1 ~ longshort10
 * - masteradmin / longshortmaster (마스터 관리자)
 */
import crypto from 'crypto';
import { verifyUser } from '@/lib/serverUsers';

export const APP_SITE_COOKIE = 'ailongshort-site';
export type AppRole = 'master_admin' | 'user';
export type AppAuthPayload = { exp: number; user: string; role: AppRole };

export function getAppSessionSecret(): string {
  return process.env.APP_SESSION_SECRET?.trim() || 'ailongshort-dev-session-secret';
}

/** 클라이언트에서 넘어온 문자열 정리 (전각·공백·IME 이슈 완화) */
function normalizeLoginField(s: unknown, lower = false): string {
  let t = String(s ?? '')
    .normalize('NFKC')
    .trim();
  if (lower) t = t.toLowerCase();
  return t;
}

export async function verifyBriefingLoginBody(
  body: { briefingLogin?: { user?: string; password?: string } }
): Promise<{ ok: true; user: string; role: AppRole } | { ok: false; error: string }> {
  const u = normalizeLoginField(body.briefingLogin?.user, true);
  const p = normalizeLoginField(body.briefingLogin?.password, false);
  const found = await verifyUser(u, p);
  if (found) return { ok: true, user: found.user, role: found.role };
  return { ok: false, error: '아이디·비밀번호가 올바르지 않습니다.' };
}

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7일

export function buildSiteAuthToken(user: string, role: AppRole): string {
  const exp = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payloadObj: AppAuthPayload = { exp, user, role };
  const payload = JSON.stringify(payloadObj);
  const secret = getAppSessionSecret();
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${b64}.${sig}`;
}

export function verifySiteAuthToken(token: string | undefined | null): AppAuthPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.lastIndexOf('.');
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!b64 || !sig || !/^[0-9a-f]+$/i.test(sig)) return null;
  try {
    const payload = Buffer.from(b64, 'base64url').toString('utf8');
    const secret = getAppSessionSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(payload) as Partial<AppAuthPayload>;
    if (typeof data.exp !== 'number' || Date.now() >= data.exp) return null;
    if (typeof data.user !== 'string' || !data.user.trim()) return null;
    const role: AppRole = data.role === 'master_admin' ? 'master_admin' : 'user';
    return { exp: data.exp, user: data.user, role };
  } catch {
    return null;
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
