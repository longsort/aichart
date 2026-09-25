/**
 * QUICK SCALP Paper 신호 링버퍼 — 클라이언트 로컬.
 * 확정 수익 아님. 서버 fs 없음(클라이언트 안전).
 */
export type QuickScalpPaperRow = {
  signalId: string;
  ts: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  tp: number;
  sl: number;
  score: number;
  adverse: number;
  grade: string;
  waitReason: string;
  whyKo: string;
};

const KEY = 'ailongshort.quickScalp.paper.v1';
const MAX = 200;

export function recordQuickScalpPaperSignal(row: QuickScalpPaperRow): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: QuickScalpPaperRow[] = raw ? JSON.parse(raw) : [];
    if (list.some((x) => x.signalId === row.signalId)) return;
    list.unshift(row);
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
}
