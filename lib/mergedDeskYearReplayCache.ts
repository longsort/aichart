/**
 * 1년 통계 결과 로컬 유지 — 재접속 시 재통계하지 않음.
 * 수동 재실행·재다운만 갱신.
 */
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';

const KEY = 'ailongshort.mergedDesk.yearReplayPacks.v1';

export type CachedYearPack = Record<string, unknown> & {
  summaryKo?: string;
  preferTfs?: string[];
  skipTfs?: string[];
  failBands?: Array<{
    timeframe: string;
    direction: 'LONG' | 'SHORT';
    midPrice: number;
    halfPct: number;
    slCount: number;
  }>;
  savedAt?: number;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readYearReplayPacks(): Partial<Record<AutoTradeCoinKey, CachedYearPack>> {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(KEY), {});
}

export function readYearReplayPack(coin: AutoTradeCoinKey): CachedYearPack | null {
  return readYearReplayPacks()[coin] ?? null;
}

export function writeYearReplayPack(coin: AutoTradeCoinKey, pack: CachedYearPack): void {
  if (typeof window === 'undefined') return;
  const map = readYearReplayPacks();
  /** equityCurve·trades만 제외 — leverageTable·byTf는 UI 복구용으로 유지 */
  const slim = { ...pack } as CachedYearPack & {
    equityCurve?: unknown;
    events?: unknown;
    trades?: unknown;
  };
  delete slim.equityCurve;
  delete slim.events;
  delete slim.trades;
  map[coin] = { ...slim, savedAt: Date.now(), persistSlim: true };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /** 쿼터 초과 시 기존 유지 · 서버 영속으로 보완 */
  }
}

export function clearYearReplayPack(coin: AutoTradeCoinKey): void {
  if (typeof window === 'undefined') return;
  const map = readYearReplayPacks();
  delete map[coin];
  window.localStorage.setItem(KEY, JSON.stringify(map));
}
