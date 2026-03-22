/** OpenAI 키 형식만 검사 — 클라이언트·서버 공용 (Node 전용 모듈 없음) */

export function isValidOpenAIKeyFormat(k: string | undefined | null): k is string {
  if (!k || typeof k !== 'string') return false;
  const t = k.trim();
  return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t) || /^sk-proj-[a-zA-Z0-9_\-]{20,}$/.test(t);
}

export function resolveOpenAIKey(bodyKey: unknown, envKey: string | undefined): string | null {
  const b = typeof bodyKey === 'string' ? bodyKey.trim() : '';
  if (isValidOpenAIKeyFormat(b)) return b;
  if (envKey && isValidOpenAIKeyFormat(envKey.trim())) return envKey.trim();
  return null;
}
