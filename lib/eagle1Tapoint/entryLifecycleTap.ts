/**
 * §15 후반 — EXECUTED / MANAGE / EXIT / OUTCOME
 * 서버 전용 (API·오케스트레이터·live-order). 클라이언트에서 import 금지.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { TapEntryState } from './types';

export type TapLifecycleRow = {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryState: TapEntryState;
  entryPrice: number | null;
  openedAt: number;
  closedAt?: number | null;
  exitPrice?: number | null;
  pnlPct?: number | null;
  noteKo?: string | null;
  paper?: boolean;
};

const REL = path.join('data', 'tapoint-accum', 'entry-lifecycle.json');
const MAX = 200;

function abs(): string {
  return path.join(process.cwd(), REL);
}

function load(): TapLifecycleRow[] {
  try {
    const j = JSON.parse(fs.readFileSync(abs(), 'utf8'));
    return Array.isArray(j) ? (j as TapLifecycleRow[]) : [];
  } catch {
    return [];
  }
}

function save(list: TapLifecycleRow[]): void {
  try {
    fs.mkdirSync(path.dirname(abs()), { recursive: true });
    fs.writeFileSync(abs(), JSON.stringify(list.slice(-MAX), null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

export function markTapLifecycleExecuted(params: {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  paper?: boolean;
  noteKo?: string | null;
}): TapLifecycleRow {
  const list = load().filter((x) => x.signalId !== params.signalId);
  const row: TapLifecycleRow = {
    signalId: params.signalId,
    symbol: String(params.symbol).toUpperCase(),
    direction: params.direction,
    entryState: 'EXECUTED',
    entryPrice: params.entryPrice,
    openedAt: Date.now(),
    paper: params.paper === true,
    noteKo: params.noteKo || '체결 · EXECUTED',
  };
  list.push(row);
  save(list);
  if (params.paper) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { bumpTapPaperStats } = require('./paperLiveGateTap') as {
        bumpTapPaperStats: (k: 'confirmed' | 'reject') => void;
      };
      bumpTapPaperStats('confirmed');
    } catch {
      /* ignore */
    }
  }
  return row;
}

export function markTapLifecycleManage(
  signalId: string,
  noteKo?: string
): TapLifecycleRow | null {
  const list = load();
  const i = list.findIndex((x) => x.signalId === signalId);
  if (i < 0) return null;
  list[i] = {
    ...list[i]!,
    entryState: 'MANAGE',
    noteKo: noteKo || list[i]!.noteKo || 'MANAGE',
  };
  save(list);
  return list[i]!;
}

export function markTapLifecycleExit(params: {
  signalId: string;
  exitPrice: number;
  noteKo?: string | null;
}): TapLifecycleRow | null {
  const list = load();
  const i = list.findIndex((x) => x.signalId === params.signalId);
  if (i < 0) return null;
  const row = list[i]!;
  const entry = Number(row.entryPrice) || 0;
  const exit = Number(params.exitPrice) || 0;
  let pnlPct: number | null = null;
  if (entry > 0 && exit > 0) {
    const raw =
      row.direction === 'LONG' ? (exit - entry) / entry : (entry - exit) / entry;
    pnlPct = raw * 100;
  }
  list[i] = {
    ...row,
    entryState: 'OUTCOME',
    closedAt: Date.now(),
    exitPrice: exit,
    pnlPct,
    noteKo:
      params.noteKo ||
      `OUTCOME · ${pnlPct != null ? pnlPct.toFixed(2) + '%' : '—'}`,
  };
  save(list);
  return list[i]!;
}

export function getTapLifecycle(signalId: string): TapLifecycleRow | null {
  return load().find((x) => x.signalId === signalId) || null;
}

export function listTapLifecycles(limit = 40): TapLifecycleRow[] {
  return load().slice(-limit).reverse();
}

export function overlayEntryStateIfOpen(
  symbol: string,
  current: TapEntryState
): TapEntryState {
  const sym = String(symbol).toUpperCase();
  const open = load().find(
    (x) =>
      x.symbol === sym &&
      (x.entryState === 'EXECUTED' || x.entryState === 'MANAGE') &&
      !x.closedAt
  );
  if (!open) return current;
  return open.entryState === 'EXECUTED' ? 'MANAGE' : open.entryState;
}
