/**
 * 진입 후 E/SL/TP 고정 — 재계산으로 움직이지 않음.
 * 심볼별 localStorage · 포지션 청산 시 clear.
 */
import { ppNormalizeSymbol } from '@/lib/profitPattern15m/skill';

const KEY = 'ailongshort.profitPattern15m.lockedLevels.v1';

export type PpLockedLevels = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  /** 진입 시각(sec) */
  lockedAt: number;
  /** 신호/주문 id */
  eventId: string;
  source: 'profitPattern' | 'instBand' | 'tapoint' | string;
  /** 차트 라벨 */
  lineEntryKo?: string;
  lineSlKo?: string;
  lineTpKo?: string;
};

type Store = Record<string, PpLockedLevels>;

function readStore(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const j = JSON.parse(window.localStorage.getItem(KEY) || '{}') as Store;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function ppGetLockedLevels(symbol: string): PpLockedLevels | null {
  const sym = ppNormalizeSymbol(symbol);
  const row = readStore()[sym];
  if (!row) return null;
  if (!(row.entry > 0 && row.sl > 0 && row.tp > 0)) return null;
  return row;
}

export function ppLockLevels(levels: PpLockedLevels): PpLockedLevels {
  const sym = ppNormalizeSymbol(levels.symbol);
  const next: PpLockedLevels = {
    ...levels,
    symbol: sym,
    lockedAt: levels.lockedAt || Math.floor(Date.now() / 1000),
  };
  const s = readStore();
  s[sym] = next;
  writeStore(s);
  return next;
}

export function ppClearLockedLevels(symbol: string): void {
  const sym = ppNormalizeSymbol(symbol);
  const s = readStore();
  if (!(sym in s)) return;
  delete s[sym];
  writeStore(s);
}

export function ppListLockedLevels(): PpLockedLevels[] {
  return Object.values(readStore());
}
