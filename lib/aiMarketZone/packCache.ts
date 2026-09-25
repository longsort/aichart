/**
 * STEP20 — buildPack 결과 짧은 메모리 캐시 (동일 닫힌봉·통계면 재계산 스킵).
 */
import type { AmzEnginePack } from './types';

type Entry = { key: string; at: number; pack: AmzEnginePack };

let last: Entry | null = null;
const TTL_MS = 8_000;

export function amzPackCacheGet(key: string): AmzEnginePack | null {
  if (!last || last.key !== key) return null;
  if (Date.now() - last.at > TTL_MS) return null;
  return last.pack;
}

export function amzPackCacheSet(key: string, pack: AmzEnginePack): void {
  last = { key, at: Date.now(), pack };
}

export function amzPackCacheKey(parts: {
  symbol: string;
  timeframe: string;
  closedTime: number;
  len: number;
  statsAt: string;
  ofFlag: string;
}): string {
  return `${parts.symbol}|${parts.timeframe}|${parts.closedTime}|${parts.len}|${parts.statsAt}|${parts.ofFlag}`;
}
