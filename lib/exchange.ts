/**
 * 거래소 HTTP 호출: 실패 시 에러 코드뿐 아니라 응답 body 전체를 상세 로그.
 * (451/403/400 등 원인 파악용)
 */

export async function exchangeFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  if (res.ok) return res;
  const body = await res.text();
  try {
    const parsed = body.length > 500 ? body.slice(0, 500) + '...' : body;
    console.error(`[exchange] ${res.status} ${url}\nbody=${parsed}`);
  } catch {
    console.error(`[exchange] ${res.status} ${url}\nbody=${body}`);
  }
  return res;
}
