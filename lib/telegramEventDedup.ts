/** 차트 / 멀티TF 워처 공통: 동일 `eventKey` 쿨다운(스팸 방지) */
const last = new Map<string, number>();
const MAX = 400;

export function telegramEventDedupTry(key: string, cooldownMs: number): boolean {
  if (!key) return true;
  const t = Date.now();
  const prev = last.get(key);
  if (prev != null && t - prev < cooldownMs) return false;
  last.set(key, t);
  if (last.size > MAX) {
    const cut = t - 3_600_000;
    for (const [k, v] of last) {
      if (v < cut) last.delete(k);
    }
  }
  return true;
}
