'use client';

/**
 * 통합·분석 — 마스터 확정 저널 (로컬 + trade-learning 동기화).
 * 로그·피드백용 — 확정 수익·투자 권유 아님.
 */
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import { loadLearningState } from '@/lib/unifiedTrade';

const JOURNAL_KEY = 'ailongshort-merged-master-journal-v1';

export type MasterFuturesJournalEntry = {
  at: number;
  symbol: string;
  timeframe: string;
  side: MasterFuturesDecision['side'];
  grade: MasterFuturesDecision['grade'];
  entryAllowed: boolean;
  strength: number;
  entry: number;
  stop: number;
  tp1: number;
  rr: number;
  gates: number;
  reasonKo: string;
  invalidationKo: string;
  result?: 'win' | 'loss' | 'be' | 'open';
  noteKo?: string;
};

function loadJournal(): MasterFuturesJournalEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MasterFuturesJournalEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 80) : [];
  } catch {
    return [];
  }
}

function saveJournal(items: MasterFuturesJournalEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {}
}

export function listMasterFuturesJournal(): MasterFuturesJournalEntry[] {
  return loadJournal();
}

export function appendMasterFuturesJournal(params: {
  symbol: string;
  timeframe: string;
  master: MasterFuturesDecision;
  noteKo?: string;
}): MasterFuturesJournalEntry {
  const entry: MasterFuturesJournalEntry = {
    at: Date.now(),
    symbol: params.symbol,
    timeframe: params.timeframe,
    side: params.master.side,
    grade: params.master.grade,
    entryAllowed: params.master.entryAllowed,
    strength: params.master.strength,
    entry: params.master.entryPrice,
    stop: params.master.stopPrice,
    tp1: params.master.tp1,
    rr: params.master.rr,
    gates: params.master.gatesPassCount,
    reasonKo: params.master.reasonKo,
    invalidationKo: params.master.invalidationKo,
    result: 'open',
    noteKo: params.noteKo,
  };
  const next = [entry, ...loadJournal()].slice(0, 80);
  saveJournal(next);

  try {
    const state = loadLearningState();
    void fetch('/api/trade-learning', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        masterJournal: {
          at: entry.at,
          symbol: entry.symbol,
          timeframe: entry.timeframe,
          side: entry.side,
          grade: entry.grade,
          entryAllowed: entry.entryAllowed,
        },
      }),
    }).catch(() => {});
  } catch {}

  return entry;
}

export function markMasterFuturesJournalResult(
  at: number,
  result: 'win' | 'loss' | 'be'
): void {
  const list = loadJournal();
  const idx = list.findIndex((e) => e.at === at);
  if (idx < 0) return;
  list[idx] = { ...list[idx]!, result };
  saveJournal(list);
}
