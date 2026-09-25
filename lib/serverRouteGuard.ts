/**
 * API 내부 가드 — 운영 세션 시크릿·레이트리밋·크론 비교.
 * 확정 수익·투자 권유와 무관.
 */

export const APP_SESSION_SECRET_FALLBACK = 'ailongshort-dev-session-secret';

export function isNodeProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 운영 공용 인증 시크릿.
 * 우선순위:
 * 1) APP_SESSION_SECRET
 * 2) INTERNAL_ANALYZE_SECRET
 * 3) TELEGRAM_MULTITF_CRON_SECRET
 * 4) 개발 fallback
 */
export function resolveAppSessionSecret(): string {
  return (
    process.env.APP_SESSION_SECRET?.trim() ||
    process.env.INTERNAL_ANALYZE_SECRET?.trim() ||
    process.env.TELEGRAM_MULTITF_CRON_SECRET?.trim() ||
    APP_SESSION_SECRET_FALLBACK
  );
}

/** 운영에서 기본 시크릿이면 로그인 쿠키가 예측 가능 — 차단 */
export function productionSessionSecretMisconfigured(): boolean {
  if (!isNodeProduction()) return false;
  const s = resolveAppSessionSecret();
  return !s || s === APP_SESSION_SECRET_FALLBACK;
}

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ok = 0;
  for (let i = 0; i < a.length; i++) ok |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ok === 0;
}

const rateBuckets = new Map<string, { n: number; t: number }>();

/** 프로세스 메모리 버킷 — 인스턴스당. max회 / windowMs */
export function consumeRouteRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const row = rateBuckets.get(key);
  if (!row || now - row.t > windowMs) {
    rateBuckets.set(key, { n: 1, t: now });
    if (rateBuckets.size > 4000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.t > windowMs) rateBuckets.delete(k);
      }
    }
    return true;
  }
  if (row.n >= max) return false;
  row.n += 1;
  return true;
}

export function clientIpFromHeaders(h: { get(name: string): string | null }): string {
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim() || 'unknown';
  return h.get('x-real-ip')?.trim() || 'unknown';
}

export function sanitizeWebhookField(v: unknown, max = 80): string {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/@everyone|@here|<@!?\d+>/gi, '')
    .slice(0, max);
}

export function isHttpsWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}
