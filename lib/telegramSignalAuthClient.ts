/**
 * 브라우저: /api/telegram/signal-capture 2차 HMAC 헤더(12초 캐시).
 * ChartView / 멀티TF 워처 공통.
 */
let cache: { a: string; t: number } | null = null;

export async function getTelegramSignalAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const c = cache;
  if (c && Date.now() - c.t < 12_000) {
    return { 'X-Telegram-Signal-Auth': c.a };
  }
  const r = await fetch('/api/telegram/signal-auth', { credentials: 'same-origin' });
  if (r.status === 401) {
    cache = null;
    return {};
  }
  if (!r.ok) return {};
  const j = (await r.json().catch(() => ({}))) as { required?: boolean; a?: string };
  if (!j.required || !j.a) return {};
  cache = { a: String(j.a), t: Date.now() };
  return { 'X-Telegram-Signal-Auth': String(j.a) };
}
