/** 서버 API용 — OpenAI 키 + 앱 로그인 검증 */

export { isValidOpenAIKeyFormat, resolveOpenAIKey } from './openaiKeyFormat';

import { verifyBriefingLoginBody } from '@/lib/appSiteAuth';

/** 앱 로그인 필수 (기본 계정: aichart / longshort, env로 변경 가능) */
export function verifyBriefingLoginIfRequired(
  body: { briefingLogin?: { user?: string; password?: string } }
): { ok: true } | { ok: false; error: string } {
  const r = verifyBriefingLoginBody(body);
  if (r.ok === false) {
    return { ok: false, error: `${r.error} AI 대화 패널에서도 동일 계정을 사용하세요.` };
  }
  return { ok: true };
}
