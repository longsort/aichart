/** 서버 API용 — OpenAI 키 + 앱 로그인 검증 */

export { isValidOpenAIKeyFormat, resolveOpenAIKey } from './openaiKeyFormat';

import { cookies, headers } from 'next/headers';
import { APP_SITE_COOKIE, verifyBriefingLoginBody, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { clientIpFromHeaders, consumeRouteRateLimit } from '@/lib/serverRouteGuard';

/** 앱 로그인 필수 — 사이트 쿠키 또는 바디 로그인. AI 라우트 분당 한도. */
export async function verifyBriefingLoginIfRequired(
  body: { briefingLogin?: { user?: string; password?: string } }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = clientIpFromHeaders(headers());
  if (!consumeRouteRateLimit(`ai:${ip}`, 24, 60_000)) {
    return { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' };
  }
  const raw = cookies().get(APP_SITE_COOKIE)?.value;
  if (verifySiteAuthToken(raw)) return { ok: true };
  const r = await verifyBriefingLoginBody(body);
  if (r.ok === false) {
    return { ok: false, error: `${r.error} AI 대화 패널에서도 동일 계정을 사용하세요.` };
  }
  return { ok: true };
}
