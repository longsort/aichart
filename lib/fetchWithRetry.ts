const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 1500;

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = DEFAULT_RETRIES,
  delayMs = DEFAULT_DELAY_MS
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      const shouldRetry = !res.ok && res.status >= 500 && attempt < retries;
      if (!shouldRetry) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e: unknown) {
      lastError = e;
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
      if (name === 'AbortError') throw e;
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
  }
  throw lastError;
}
