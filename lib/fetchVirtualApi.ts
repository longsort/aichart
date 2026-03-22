import { getClientId } from '@/lib/clientId';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

/** API 요청 시 X-Client-Id 헤더 자동 첨부 */
export async function fetchVirtualApi(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const clientId = getClientId();
  const headers = new Headers(init?.headers);
  headers.set('X-Client-Id', clientId);
  return fetchWithRetry(path, { ...init, headers });
}
