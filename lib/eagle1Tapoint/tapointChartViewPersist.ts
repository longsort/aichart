/**
 * 타점 차트 가시범위 — 심볼·TF별 localStorage 저장.
 * 서버/리로드·봉 갱신해도 사용자가 맞춰 둔 자리 유지. 계정별로 분리.
 */
import { sessionScopedStorageKey } from '@/lib/settings';
export type TapointChartViewSnap = {
  logical: { from: number; to: number } | null;
  timeRange: { from: number; to: number } | null;
  /** 사용자가 휠·드래그로 맞춘 적 있음 */
  interacted: boolean;
  updatedAt: number;
};

const KEY_BASE = 'ailongshort.eagle1Tapoint.chartView.v1';

function persistStoreKey(): string {
  return sessionScopedStorageKey(KEY_BASE);
}

function storageKey(symbol: string, timeframe: string): string {
  const s = String(symbol || 'BTCUSDT').toUpperCase();
  const tf = String(timeframe || '3m');
  return `${s}|${tf}`;
}

function readAll(): Record<string, TapointChartViewSnap> {
  if (typeof window === 'undefined') return {};
  try {
    const raw =
      window.localStorage.getItem(persistStoreKey()) ||
      window.localStorage.getItem(KEY_BASE);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, TapointChartViewSnap>;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, TapointChartViewSnap>): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = Object.keys(map);
    if (keys.length > 80) {
      const sorted = keys.sort(
        (a, b) => (map[a]?.updatedAt || 0) - (map[b]?.updatedAt || 0)
      );
      for (const k of sorted.slice(0, keys.length - 60)) delete map[k];
    }
    window.localStorage.setItem(persistStoreKey(), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readTapointChartView(
  symbol: string,
  timeframe: string
): TapointChartViewSnap | null {
  const row = readAll()[storageKey(symbol, timeframe)];
  if (!row || !row.interacted) return null;
  const okLogical =
    row.logical &&
    Number.isFinite(row.logical.from) &&
    Number.isFinite(row.logical.to) &&
    row.logical.to - row.logical.from > 2;
  const okTime =
    row.timeRange &&
    Number.isFinite(row.timeRange.from) &&
    Number.isFinite(row.timeRange.to) &&
    row.timeRange.to > row.timeRange.from;
  if (!okLogical && !okTime) return null;
  return {
    logical: okLogical ? row.logical : null,
    timeRange: okTime ? row.timeRange : null,
    interacted: true,
    updatedAt: Number(row.updatedAt) || 0,
  };
}

export function writeTapointChartView(
  symbol: string,
  timeframe: string,
  snap: {
    logical: { from: number; to: number } | null;
    timeRange: { from: number; to: number } | null;
    interacted?: boolean;
  }
): void {
  if (!snap.logical && !snap.timeRange) return;
  const map = readAll();
  map[storageKey(symbol, timeframe)] = {
    logical: snap.logical,
    timeRange: snap.timeRange,
    interacted: snap.interacted !== false,
    updatedAt: Date.now(),
  };
  writeAll(map);
}

export function clearTapointChartView(symbol: string, timeframe: string): void {
  const map = readAll();
  delete map[storageKey(symbol, timeframe)];
  writeAll(map);
}
