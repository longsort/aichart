/**
 * 수익패턴·타점 진입/청산 기록 — 추후 보강용.
 * localStorage 링버퍼 + 선택적 서버 POST.
 */
import { ppNormalizeSymbol } from '@/lib/profitPattern15m/skill';

const KEY = 'ailongshort.profitPattern15m.tradeJournal.v1';
const MAX = 800;

export type PpJournalEventKind =
  | 'SIGNAL'
  | 'ENTRY'
  | 'LOCK'
  | 'EXIT_TP'
  | 'EXIT_SL'
  | 'EXIT_TIMEOUT_VOID'
  | 'EXIT_MANUAL'
  | 'SKIP'
  | 'NOTE';

export type PpJournalRow = {
  id: string;
  atMs: number;
  kind: PpJournalEventKind;
  symbol: string;
  timeframe?: string;
  direction?: 'LONG' | 'SHORT' | null;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  exit?: number | null;
  netRoePct?: number | null;
  sizeScale?: number | null;
  eventId?: string | null;
  path?: string | null;
  reasonKo?: string;
  policyKo?: string;
  meta?: Record<string, unknown>;
};

function readAll(): PpJournalRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const j = JSON.parse(window.localStorage.getItem(KEY) || '[]') as PpJournalRow[];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeAll(rows: PpJournalRow[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX)));
}

export function ppJournalAppend(
  row: Omit<PpJournalRow, 'id' | 'atMs'> & { id?: string; atMs?: number }
): PpJournalRow {
  const full: PpJournalRow = {
    ...row,
    id:
      row.id ||
      `ppj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    atMs: row.atMs || Date.now(),
    symbol: ppNormalizeSymbol(row.symbol),
  };
  const all = readAll();
  all.unshift(full);
  writeAll(all);
  try {
    void fetch('/api/profit-pattern/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  return full;
}

export function ppJournalList(opts?: {
  symbol?: string;
  limit?: number;
}): PpJournalRow[] {
  const lim = Math.max(1, Math.min(MAX, opts?.limit || 100));
  const sym = opts?.symbol ? ppNormalizeSymbol(opts.symbol) : '';
  return readAll()
    .filter((r) => !sym || r.symbol === sym)
    .slice(0, lim);
}

export function ppJournalClear(symbol?: string): void {
  if (!symbol) {
    writeAll([]);
    return;
  }
  const sym = ppNormalizeSymbol(symbol);
  writeAll(readAll().filter((r) => r.symbol !== sym));
}
