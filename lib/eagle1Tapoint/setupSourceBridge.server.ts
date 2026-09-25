/**
 * Dual setupSources 힌트 — 서버 전용 디스크 영속.
 * API·서버 자동매매만 import. 클라이언트에서 import 금지.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { TapSetupHintRow } from './setupSourceBridge';
import { dualSourceToSetupId } from './setupSourceBridge';

export type { TapSetupHintRow };

const REL = path.join('data', 'tapoint-accum', 'setup-source-hints.json');
const MAX = 80;
const TTL_MS = 45 * 60_000;

function abs(): string {
  return path.join(process.cwd(), REL);
}

function loadAll(): TapSetupHintRow[] {
  try {
    const raw = fs.readFileSync(abs(), 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as TapSetupHintRow[]) : [];
  } catch {
    return [];
  }
}

function saveAll(list: TapSetupHintRow[]): void {
  const trimmed = list
    .filter((r) => Date.now() - Number(r.at) < TTL_MS)
    .slice(-MAX);
  try {
    fs.mkdirSync(path.dirname(abs()), { recursive: true });
    fs.writeFileSync(abs(), JSON.stringify(trimmed, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

export function recordTapSetupSourceHint(row: TapSetupHintRow): void {
  const sym = String(row.symbol || '').toUpperCase();
  if (!sym) return;
  const list = loadAll().filter(
    (x) =>
      !(
        String(x.symbol).toUpperCase() === sym &&
        x.source === row.source &&
        x.direction === row.direction
      )
  );
  list.push({
    ...row,
    symbol: sym,
    at: row.at || Date.now(),
  });
  saveAll(list);
}

export function loadTapSetupSourceHints(symbol: string): {
  sources: string[];
  setupHint: {
    direction: 'LONG' | 'SHORT' | null;
    grade: string | null;
    noteKo: string | null;
  } | null;
} {
  const sym = String(symbol || '').toUpperCase();
  const now = Date.now();
  const rows = loadAll().filter(
    (r) => String(r.symbol).toUpperCase() === sym && now - Number(r.at) < TTL_MS
  );
  if (!rows.length) {
    return { sources: [], setupHint: null };
  }
  const sources = [
    ...new Set(rows.map((r) => String(r.source || '').trim()).filter(Boolean)),
  ];
  const latest = [...rows].sort((a, b) => Number(b.at) - Number(a.at))[0]!;
  const grade =
    rows.find((r) => r.grade === 'S' || r.grade === 's')?.grade ||
    latest.grade ||
    (sources.includes('structure-s') ? 'S' : null);
  const dirs = rows.map((r) => r.direction).filter(Boolean) as Array<
    'LONG' | 'SHORT'
  >;
  const longN = dirs.filter((d) => d === 'LONG').length;
  const shortN = dirs.filter((d) => d === 'SHORT').length;
  let direction: 'LONG' | 'SHORT' | null = latest.direction;
  if (longN > shortN) direction = 'LONG';
  else if (shortN > longN) direction = 'SHORT';

  return {
    sources: sources.map((s) => `setup:${s}`),
    setupHint: {
      direction,
      grade: grade ? String(grade) : null,
      noteKo:
        latest.noteKo ||
        `셋업소스 ${sources.slice(0, 4).join('+')} · 즉시주문아님`,
    },
  };
}

export function recordDualRaceAsSetupHint(params: {
  symbol: string;
  source: string;
  direction: 'LONG' | 'SHORT';
  signalId?: string | null;
  timeframe?: string | null;
  noteKo?: string | null;
  grade?: string | null;
}): void {
  const setupId = dualSourceToSetupId(params.source);
  const isS =
    setupId === 'signal-C-S' || params.grade === 'S' || params.grade === 's';
  recordTapSetupSourceHint({
    symbol: params.symbol,
    source: setupId,
    direction: params.direction,
    grade: isS ? 'S' : params.grade || null,
    noteKo:
      params.noteKo || `Dual ${setupId} · SETUP힌트 · 즉시주문아님`,
    timeframe: params.timeframe || null,
    signalId: params.signalId || null,
    at: Date.now(),
  });
}
