/** 클라이언트 → `/api/telegram/*` 2차 검증 헤더 (30초 HMAC 캐시) */
let authCache: { a: string; t: number } | null = null;

export async function getTelegramSignalAuthHeaders(): Promise<Record<string, string>> {
  const now = Date.now();
  if (authCache && now - authCache.t < 12_000) {
    return { 'X-Telegram-Signal-Auth': authCache.a };
  }
  try {
    const r = await fetch('/api/telegram/signal-auth', { credentials: 'same-origin' });
    if (!r.ok) {
      authCache = null;
      return {};
    }
    const j = (await r.json()) as { required?: boolean; a?: string };
    if (!j.required || !j.a) return {};
    authCache = { a: String(j.a), t: now };
    return { 'X-Telegram-Signal-Auth': String(j.a) };
  } catch {
    return {};
  }
}
