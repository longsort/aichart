/**
 * Server-only freeze + stats JSON. Pipeline stays filesystem-free.
 * Historical events (PHASE 12) live under data/eagle1/events/ — see historicalEventStore.
 */
import fs from 'fs';
import path from 'path';
import type { Eagle1Zone } from './zoneEngine';
import type { FrozenTrade } from './tradeManage';
import type { ExpectancyCatalog } from './zoneExpectancy';
import type { SetupOutcome } from './zoneExpectancy';
import {
  appendHistoricalEvent as appendHistoricalEventImpl,
  loadHistoricalEvents as loadHistoricalEventsImpl,
  updateHistoricalEventOutcome as updateHistoricalEventOutcomeImpl,
  type HistoricalEventOutcome,
  type HistoricalEventRecord,
} from './historicalEventStore';

export type { HistoricalEventRecord, HistoricalEventOutcome, HistoricalEventEvidence, HistoricalEventIndex } from './historicalEventStore';

export type Eagle1FreezeFile = {
  symbol: string;
  timeframe: string;
  zones: Eagle1Zone[];
  trade: FrozenTrade | null;
  updated_at: number;
};

function freezeName(symbol: string, timeframe: string): string {
  return `${symbol}_${timeframe}.json`;
}

export function loadEagle1Freeze(symbol: string, timeframe: string, _root = process.cwd()): Eagle1FreezeFile | null {
  void _root;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'freeze', freezeName(symbol, timeframe)), 'utf8')
    ) as Eagle1FreezeFile;
    if (!raw || !Array.isArray(raw.zones)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveEagle1Freeze(row: Eagle1FreezeFile, _root = process.cwd()): void {
  void _root;
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1', 'freeze'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'eagle1', 'freeze', freezeName(row.symbol, row.timeframe)),
    JSON.stringify(row, null, 2),
    'utf8'
  );
}

export function loadExpectancyCatalog(
  symbol: string,
  timeframe: string,
  _root = process.cwd()
): ExpectancyCatalog | null {
  void _root;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'stats', freezeName(symbol, timeframe)), 'utf8')
    ) as ExpectancyCatalog;
  } catch {
    return null;
  }
}

export function saveExpectancyCatalog(cat: ExpectancyCatalog, _root = process.cwd()): void {
  void _root;
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1', 'stats'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'eagle1', 'stats', freezeName(cat.symbol, cat.timeframe)),
    JSON.stringify(cat, null, 2),
    'utf8'
  );
}

export function loadSetupOutcomes(symbol: string, timeframe: string, _root = process.cwd()): SetupOutcome[] {
  void _root;
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'data', 'eagle1', 'stats', `${symbol}_${timeframe}_outcomes.json`),
        'utf8'
      )
    ) as { rows?: SetupOutcome[] };
    return Array.isArray(raw.rows) ? raw.rows : [];
  } catch {
    return [];
  }
}

export function saveSetupOutcomes(
  symbol: string,
  timeframe: string,
  rows: SetupOutcome[],
  _root = process.cwd()
): void {
  void _root;
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1', 'stats'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'eagle1', 'stats', `${symbol}_${timeframe}_outcomes.json`),
    JSON.stringify({ symbol, timeframe, rows, n: rows.length }, null, 2),
    'utf8'
  );
}

export type CombinationSnapshotFile = {
  symbol: string;
  timeframe: string;
  at: number;
  promoted: string | null;
  summaryKo: string;
  hits: Array<{
    id: string;
    complete: boolean;
    promote: boolean;
    sampleSize: number;
    tpBeforeSl: number | null;
    netExpectancy: number | null;
    note: string;
  }>;
};

export function loadCombinationSnapshot(
  symbol: string,
  timeframe: string,
  _root = process.cwd()
): CombinationSnapshotFile | null {
  void _root;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'combo', freezeName(symbol, timeframe)), 'utf8')
    ) as CombinationSnapshotFile;
  } catch {
    return null;
  }
}

export function saveCombinationSnapshot(row: CombinationSnapshotFile, _root = process.cwd()): void {
  void _root;
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1', 'combo'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'eagle1', 'combo', freezeName(row.symbol, row.timeframe)),
    JSON.stringify(row, null, 2),
    'utf8'
  );
}

/** PHASE 12 — thin delegates to historicalEventStore (analyze route should not thrash disk every request). */
export function appendHistoricalEvent(
  row: HistoricalEventRecord,
  root = process.cwd()
): { stored: HistoricalEventRecord; created: boolean } {
  return appendHistoricalEventImpl(row, root);
}

export function loadHistoricalEvents(
  symbol: string,
  timeframe: string,
  root = process.cwd()
): HistoricalEventRecord[] {
  return loadHistoricalEventsImpl(symbol, timeframe, root);
}

export function updateHistoricalEventOutcome(
  symbol: string,
  timeframe: string,
  event_id: string,
  outcome: HistoricalEventOutcome,
  root = process.cwd()
): HistoricalEventRecord | null {
  return updateHistoricalEventOutcomeImpl(symbol, timeframe, event_id, outcome, root);
}
