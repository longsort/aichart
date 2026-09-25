/**
 * 타점 decide 공용 캐시 — 심볼·TF는 시장 공용이라 사용자 간 공유.
 * 여러 명 동시 접속 시 Bitget·오케스트레이터 중복 폭주 완화.
 * 확정 수익 아님.
 */
import type { TapointDecisionReport } from '@/lib/eagle1Tapoint/types';

const TTL_MS = Math.max(
  2_000,
  Math.min(12_000, Number(process.env.TAPOINT_DECIDE_CACHE_TTL_MS || 4_000) || 4_000)
);

type Entry = {
  at: number;
  report: TapointDecisionReport;
};

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<TapointDecisionReport>>();

function keyOf(symbol: string, timeframe: string): string {
  return `${String(symbol || '').toUpperCase()}|${String(timeframe || '').toLowerCase()}`;
}

export function getCachedTapointReport(
  symbol: string,
  timeframe: string
): TapointDecisionReport | null {
  const k = keyOf(symbol, timeframe);
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(k);
    return null;
  }
  return hit.report;
}

export function setCachedTapointReport(
  symbol: string,
  timeframe: string,
  report: TapointDecisionReport
): void {
  const k = keyOf(symbol, timeframe);
  cache.set(k, { at: Date.now(), report });
  if (cache.size > 60) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/** 동시 요청 1회만 실행 · 나머지는 같은 Promise 공유 */
export async function runTapointDecideShared(
  symbol: string,
  timeframe: string,
  factory: () => Promise<TapointDecisionReport>
): Promise<{ report: TapointDecisionReport; cacheHit: boolean }> {
  const cached = getCachedTapointReport(symbol, timeframe);
  if (cached) return { report: cached, cacheHit: true };

  const k = keyOf(symbol, timeframe);
  const pending = inflight.get(k);
  if (pending) {
    const report = await pending;
    return { report, cacheHit: true };
  }

  const p = (async () => {
    const report = await factory();
    setCachedTapointReport(symbol, timeframe, report);
    return report;
  })().finally(() => {
    inflight.delete(k);
  });
  inflight.set(k, p);
  const report = await p;
  return { report, cacheHit: false };
}
