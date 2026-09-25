/**
 * 15m 기관밴드 Paper — LIVE 아님. BTC 3m QS/SNIPER와 주문 분리.
 */
export const INST_BAND_15M_PAPER_KEY = 'ailongshort.instBand15m.paper.v1';

export type InstBand15mPaperRow = {
  signalId: string;
  ts: number;
  symbol: string;
  timeframe: '15m';
  side: 'LONG' | 'SHORT';
  entry: number;
  tp: number;
  sl: number;
  band1: string;
  band2: string;
  whyKo: string;
  live: false;
};

const MAX = 200;

export function listInstBand15mPaper(limit = 40): InstBand15mPaperRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(INST_BAND_15M_PAPER_KEY);
    const list: InstBand15mPaperRow[] = raw ? JSON.parse(raw) : [];
    return list.slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

export function recordInstBand15mPaper(row: InstBand15mPaperRow): void {
  if (typeof window === 'undefined') return;
  if (row.live !== false) return;
  try {
    const raw = window.localStorage.getItem(INST_BAND_15M_PAPER_KEY);
    const list: InstBand15mPaperRow[] = raw ? JSON.parse(raw) : [];
    if (list.some((x) => x.signalId === row.signalId)) return;
    list.unshift({ ...row, live: false, timeframe: '15m' });
    window.localStorage.setItem(INST_BAND_15M_PAPER_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota */
  }
}
