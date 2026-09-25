/**
 * 계정별 마지막 차트 자리(심볼·TF) — aichart1/2/3 동시 사용 시 서로 덮어쓰지 않음.
 */
import { sessionScopedStorageKey } from '@/lib/settings';

const BASE = 'ailongshort-desk-live-session-v1';

export type DeskLiveSession = {
  symbol: string;
  timeframe: string;
};

export function readDeskLiveSession(): DeskLiveSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(sessionScopedStorageKey(BASE));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<DeskLiveSession>;
    const symbol = String(j.symbol || '').toUpperCase().trim();
    const timeframe = String(j.timeframe || '').trim();
    if (!symbol || !timeframe) return null;
    return { symbol, timeframe };
  } catch {
    return null;
  }
}

export function writeDeskLiveSession(next: DeskLiveSession): void {
  if (typeof window === 'undefined') return;
  const symbol = String(next.symbol || '').toUpperCase().trim();
  const timeframe = String(next.timeframe || '').trim();
  if (!symbol || !timeframe) return;
  try {
    window.localStorage.setItem(
      sessionScopedStorageKey(BASE),
      JSON.stringify({ symbol, timeframe, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}
