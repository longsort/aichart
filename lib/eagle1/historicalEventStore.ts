/**
 * PHASE 12 — Historical Event DB (file store; NO Prisma / WMS mix).
 *
 * Storage path: `data/eagle1/events/{symbol}_{timeframe}.json`
 * File shape: `{ rows: HistoricalEventRecord[], index: HistoricalEventIndex }`
 *
 * ## Index fields
 * - `by_event_id`: event_id → row array index (O(1) load / outcome update)
 * - `by_family`: family → event_id[] (expectancy / similarity pools)
 * - `by_timeframe`: timeframe → event_id[] (query helper; files are usually one TF)
 * - `updated_at`: unix ms when index was last rebuilt
 *
 * ## Immutability (NO REPAINT)
 * Frozen fields (everything except `outcome`) are immutable after first append.
 * Re-append of the same `event_id` is a no-op (keeps the first frozen row).
 * `updateHistoricalEventOutcome` may only write the `outcome` layer.
 *
 * Pipeline / analyze routes stay filesystem-free; scripts & freezeStore wrappers own I/O.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SetupOutcome } from './zoneExpectancy';

export const EAGLE1_EVENT_ENGINE_VERSION = 'eagle1-event-v1';

export type HistoricalEventEvidence = {
  groups: string[]; // e.g. structure, flow, core, strategy
  notes: string[];
};

export type HistoricalEventOutcome = {
  mfe: number | null;
  mae: number | null;
  mfePct?: number | null;
  maePct?: number | null;
  tpFirst?: boolean | null;
  slFirst?: boolean | null;
  netR?: number | null;
  settled_at?: number | null;
};

export type HistoricalEventRecord = {
  event_id: string; // stable: `${symbol}|${tf}|${barTime}|${family}|${direction}`
  symbol: string;
  timeframe: string;
  family: string; // SetupFamily or strategy type
  direction: 'LONG' | 'SHORT';
  bar_time: number; // unix sec of decision bar (known_at)
  bar_index: number;
  engine_version: string; // constant e.g. 'eagle1-event-v1'
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  evidence: HistoricalEventEvidence;
  /** Frozen at issue — never mutate after save */
  frozen_at: number;
  features_hash?: string | null;
  /** Outcome layer — may be updated later without changing frozen fields */
  outcome?: HistoricalEventOutcome | null;
};

export type HistoricalEventIndex = {
  by_event_id: Record<string, number>; // offset or array index
  by_family: Record<string, string[]>; // event_ids
  by_timeframe: Record<string, string[]>;
  updated_at: number;
};

export type HistoricalEventFile = {
  rows: HistoricalEventRecord[];
  index: HistoricalEventIndex;
};

const FROZEN_KEYS = [
  'event_id',
  'symbol',
  'timeframe',
  'family',
  'direction',
  'bar_time',
  'bar_index',
  'engine_version',
  'entry',
  'stop',
  'tp1',
  'evidence',
  'frozen_at',
  'features_hash',
] as const;

function fileName(symbol: string, timeframe: string): string {
  const sym = String(symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const tf = String(timeframe || '1H').replace(/[^A-Za-z0-9]/g, '') || '1H';
  return `${sym}_${tf}.json`;
}

function eventsDir(root: string): string {
  return path.join(root, 'data', 'eagle1', 'events');
}

function eventsPath(symbol: string, timeframe: string, root: string): string {
  return path.join(eventsDir(root), fileName(symbol, timeframe));
}

export function emptyHistoricalEventIndex(at = Date.now()): HistoricalEventIndex {
  return { by_event_id: {}, by_family: {}, by_timeframe: {}, updated_at: at };
}

export function rebuildHistoricalEventIndex(rows: HistoricalEventRecord[]): HistoricalEventIndex {
  const index = emptyHistoricalEventIndex();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    index.by_event_id[row.event_id] = i;
    const fam = row.family || 'unknown';
    const tf = row.timeframe || 'unknown';
    if (!index.by_family[fam]) index.by_family[fam] = [];
    if (!index.by_family[fam]!.includes(row.event_id)) index.by_family[fam]!.push(row.event_id);
    if (!index.by_timeframe[tf]) index.by_timeframe[tf] = [];
    if (!index.by_timeframe[tf]!.includes(row.event_id)) index.by_timeframe[tf]!.push(row.event_id);
  }
  return index;
}

export function buildHistoricalEventId(params: {
  symbol: string;
  timeframe: string;
  bar_time: number;
  family: string;
  direction: 'LONG' | 'SHORT';
}): string {
  const sym = String(params.symbol || 'BTCUSDT').toUpperCase();
  const tf = String(params.timeframe || '');
  const t = Number(params.bar_time) || 0;
  const fam = String(params.family || 'unknown');
  return `${sym}|${tf}|${t}|${fam}|${params.direction}`;
}

function frozenSlice(row: HistoricalEventRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FROZEN_KEYS) out[k] = row[k];
  return out;
}

export function frozenFieldsEqual(a: HistoricalEventRecord, b: HistoricalEventRecord): boolean {
  return JSON.stringify(frozenSlice(a)) === JSON.stringify(frozenSlice(b));
}

export function setupOutcomeToHistoricalEvent(
  outcome: SetupOutcome,
  meta: {
    symbol: string;
    timeframe: string;
    bar_time: number;
    entry?: number | null;
    stop?: number | null;
    tp1?: number | null;
    evidence?: HistoricalEventEvidence;
    features_hash?: string | null;
    frozen_at?: number;
    /** When true (default), seed outcome layer from SetupOutcome MFE/MAE — never into frozen body */
    includeOutcome?: boolean;
  }
): HistoricalEventRecord {
  const direction = outcome.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const family = String(outcome.family || 'unknown');
  const event_id = buildHistoricalEventId({
    symbol: meta.symbol,
    timeframe: meta.timeframe,
    bar_time: meta.bar_time,
    family,
    direction,
  });
  const includeOutcome = meta.includeOutcome !== false;
  const row: HistoricalEventRecord = {
    event_id,
    symbol: String(meta.symbol || 'BTCUSDT').toUpperCase(),
    timeframe: String(meta.timeframe || ''),
    family,
    direction,
    bar_time: Number(meta.bar_time) || 0,
    bar_index: Number(outcome.index) || 0,
    engine_version: EAGLE1_EVENT_ENGINE_VERSION,
    entry: meta.entry ?? null,
    stop: meta.stop ?? null,
    tp1: meta.tp1 ?? null,
    evidence: meta.evidence ?? {
      groups: ['expectancy', 'regime:' + String(outcome.regime || 'unknown')],
      notes: [`grossRr=${outcome.grossRr}`],
    },
    frozen_at: meta.frozen_at ?? Date.now(),
    features_hash: meta.features_hash ?? null,
    outcome: null,
  };
  if (includeOutcome) {
    row.outcome = {
      mfe: Number.isFinite(outcome.mfe) ? outcome.mfe : null,
      mae: Number.isFinite(outcome.mae) ? outcome.mae : null,
      mfePct: outcome.mfePct ?? null,
      maePct: outcome.maePct ?? null,
      tpFirst: outcome.tpFirst ?? null,
      slFirst: outcome.slFirst ?? null,
      netR: Number.isFinite(outcome.netR) ? outcome.netR : null,
      settled_at: Date.now(),
    };
  }
  return row;
}

export function loadHistoricalEventFile(
  symbol: string,
  timeframe: string,
  root = process.cwd()
): HistoricalEventFile {
  try {
    const raw = JSON.parse(fs.readFileSync(eventsPath(symbol, timeframe, root), 'utf8')) as HistoricalEventFile;
    const rows = Array.isArray(raw?.rows) ? raw.rows : [];
    const index =
      raw?.index && raw.index.by_event_id
        ? raw.index
        : rebuildHistoricalEventIndex(rows);
    return { rows, index };
  } catch {
    return { rows: [], index: emptyHistoricalEventIndex(0) };
  }
}

export function loadHistoricalEvents(
  symbol: string,
  timeframe: string,
  root = process.cwd()
): HistoricalEventRecord[] {
  return loadHistoricalEventFile(symbol, timeframe, root).rows;
}

function persist(symbol: string, timeframe: string, file: HistoricalEventFile, root: string): void {
  fs.mkdirSync(eventsDir(root), { recursive: true });
  file.index = rebuildHistoricalEventIndex(file.rows);
  fs.writeFileSync(eventsPath(symbol, timeframe, root), JSON.stringify(file, null, 2), 'utf8');
}

/**
 * Append a frozen event. Same event_id → keep first row (no repaint / no overwrite).
 */
export function appendHistoricalEvent(
  row: HistoricalEventRecord,
  root = process.cwd()
): { stored: HistoricalEventRecord; created: boolean } {
  const symbol = row.symbol;
  const timeframe = row.timeframe;
  const file = loadHistoricalEventFile(symbol, timeframe, root);
  const idx = file.index.by_event_id[row.event_id];
  if (idx != null && file.rows[idx]) {
    return { stored: file.rows[idx]!, created: false };
  }
  const frozen: HistoricalEventRecord = {
    ...row,
    engine_version: row.engine_version || EAGLE1_EVENT_ENGINE_VERSION,
    evidence: {
      groups: Array.isArray(row.evidence?.groups) ? [...row.evidence.groups] : [],
      notes: Array.isArray(row.evidence?.notes) ? [...row.evidence.notes] : [],
    },
    outcome: row.outcome ?? null,
  };
  file.rows.push(frozen);
  persist(symbol, timeframe, file, root);
  return { stored: frozen, created: true };
}

/**
 * Update outcome layer only. Frozen fields are never rewritten.
 */
export function updateHistoricalEventOutcome(
  symbol: string,
  timeframe: string,
  event_id: string,
  outcome: HistoricalEventOutcome,
  root = process.cwd()
): HistoricalEventRecord | null {
  const file = loadHistoricalEventFile(symbol, timeframe, root);
  const idx = file.index.by_event_id[event_id];
  if (idx == null || !file.rows[idx]) return null;
  const prev = file.rows[idx]!;
  const next: HistoricalEventRecord = {
    ...prev,
    outcome: {
      mfe: outcome.mfe ?? null,
      mae: outcome.mae ?? null,
      mfePct: outcome.mfePct ?? null,
      maePct: outcome.maePct ?? null,
      tpFirst: outcome.tpFirst ?? null,
      slFirst: outcome.slFirst ?? null,
      netR: outcome.netR ?? null,
      settled_at: outcome.settled_at ?? Date.now(),
    },
  };
  if (!frozenFieldsEqual(prev, next)) {
    throw new Error('historicalEventStore: frozen field mutation blocked');
  }
  file.rows[idx] = next;
  persist(symbol, timeframe, file, root);
  return next;
}

/** Acceptance: create → reload → immutable frozen → outcome update leaves entry/stop intact */
export function historicalEventStoreAcceptance(root?: string): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const own = root == null;
  const dir = root ?? fs.mkdtempSync(path.join(os.tmpdir(), 'eagle1-events-'));
  try {
    const sample: HistoricalEventRecord = {
      event_id: buildHistoricalEventId({
        symbol: 'BTCUSDT',
        timeframe: '1H',
        bar_time: 1_700_000_000,
        family: 'poc_hold',
        direction: 'LONG',
      }),
      symbol: 'BTCUSDT',
      timeframe: '1H',
      family: 'poc_hold',
      direction: 'LONG',
      bar_time: 1_700_000_000,
      bar_index: 42,
      engine_version: EAGLE1_EVENT_ENGINE_VERSION,
      entry: 100,
      stop: 95,
      tp1: 110,
      evidence: { groups: ['structure', 'core'], notes: ['selftest'] },
      frozen_at: 1_700_000_100,
      features_hash: 'abc',
      outcome: null,
    };
    const a = appendHistoricalEvent(sample, dir);
    if (!a.created) notes.push('first append should create');
    const loaded = loadHistoricalEvents('BTCUSDT', '1H', dir);
    if (loaded.length !== 1) notes.push(`reload n=${loaded.length}`);
    const row0 = loaded[0]!;
    if (row0.entry !== 100 || row0.stop !== 95) notes.push('frozen entry/stop lost on reload');
    if (row0.event_id !== sample.event_id) notes.push('event_id mismatch');

    const again = appendHistoricalEvent(
      { ...sample, entry: 999, stop: 1, frozen_at: 9_999_999_999, evidence: { groups: ['hack'], notes: [] } },
      dir
    );
    if (again.created) notes.push('duplicate append must not create');
    if (again.stored.entry !== 100 || again.stored.stop !== 95) notes.push('duplicate append mutated frozen');
    if (again.stored.frozen_at !== sample.frozen_at) notes.push('frozen_at mutated on re-append');

    const updated = updateHistoricalEventOutcome(
      'BTCUSDT',
      '1H',
      sample.event_id,
      { mfe: 2.5, mae: 0.4, mfePct: 2.5, maePct: 0.4, tpFirst: true, slFirst: false, netR: 1.8 },
      dir
    );
    if (!updated?.outcome || updated.outcome.mfe !== 2.5 || updated.outcome.mae !== 0.4) {
      notes.push('outcome MFE/MAE not stored');
    }
    if (updated?.entry !== 100 || updated?.stop !== 95 || updated?.tp1 !== 110) {
      notes.push('outcome update changed entry/stop/tp1');
    }
    if (updated && !frozenFieldsEqual(row0, updated)) notes.push('frozen slice changed after outcome');

    const fromSetup = setupOutcomeToHistoricalEvent(
      {
        family: 'ob_retest',
        regime: 'trend',
        direction: 'SHORT',
        index: 7,
        tpFirst: false,
        slFirst: true,
        mfe: 0.2,
        mae: 1.1,
        netR: -1,
        grossRr: 2,
      },
      { symbol: 'ETHUSDT', timeframe: '15m', bar_time: 1_700_100_000, entry: 50, stop: 52, tp1: 45 }
    );
    if (!fromSetup.event_id.includes('ob_retest') || fromSetup.outcome?.mae !== 1.1) {
      notes.push('setupOutcomeToHistoricalEvent');
    }
    if (fromSetup.entry !== 50 || fromSetup.engine_version !== EAGLE1_EVENT_ENGINE_VERSION) {
      notes.push('adapter frozen fields');
    }

    const file = loadHistoricalEventFile('BTCUSDT', '1H', dir);
    if (file.index.by_event_id[sample.event_id] !== 0) notes.push('by_event_id index');
    if (!file.index.by_family['poc_hold']?.includes(sample.event_id)) notes.push('by_family index');
    if (!file.index.by_timeframe['1H']?.includes(sample.event_id)) notes.push('by_timeframe index');
  } catch (e) {
    notes.push(e instanceof Error ? e.message : String(e));
  } finally {
    if (own) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: notes.length === 0, notes };
}
