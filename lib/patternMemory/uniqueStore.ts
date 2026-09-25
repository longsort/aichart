/**
 * Unique OHLCV store: existing Bitget CSV + overlay JSONL.
 * Key = symbol + timeframe + openTime. Overlay wins on same key.
 */
import path from 'node:path';
import { loadEagle1RawCandles } from '@/lib/eagle1/historicalDatabase';
import type { Eagle1RawCandle } from '@/lib/eagle1/rawTypes';
import { appendUtf8, mkdirp, readUtf8IfExists, writeUtf8 } from '@/lib/patternMemory/nodeFs';
import { chartTfToEagle1Tf, eagle1TfToChartTf, tfStepMs } from '@/lib/patternMemory/tfMap';
import type { QualityRepairLog, StoredCandle } from '@/lib/patternMemory/types';

export const PATTERN_MEMORY_DIR = path.join('data', 'pattern-memory');

export function patternMemoryUniqueKey(symbol: string, timeframe: string, openTime: number): string {
  return `${String(symbol).toUpperCase()}|${timeframe}|${openTime}`;
}

export function overlayRel(symbol: string, timeframe: string): string {
  return path.join('ohlcv', `${String(symbol).toUpperCase()}_${eagle1TfToChartTf(timeframe)}.jsonl`);
}

export function metaRel(symbol: string, timeframe: string): string {
  return path.join('meta', `${String(symbol).toUpperCase()}_${eagle1TfToChartTf(timeframe)}.json`);
}

export function paperRel(symbol: string): string {
  return path.join('paper', `${String(symbol).toUpperCase()}.jsonl`);
}

export function overlayPath(symbol: string, timeframe: string, root = process.cwd()): string {
  return path.join(root, PATTERN_MEMORY_DIR, overlayRel(symbol, timeframe));
}

export function metaPath(symbol: string, timeframe: string, root = process.cwd()): string {
  return path.join(root, PATTERN_MEMORY_DIR, metaRel(symbol, timeframe));
}

export function paperPath(symbol: string, root = process.cwd()): string {
  return path.join(root, PATTERN_MEMORY_DIR, paperRel(symbol));
}

export function ensurePatternMemoryDirs(_root = process.cwd()): void {
  for (const sub of ['ohlcv', 'meta', 'paper', 'index'] as const) {
    mkdirp(sub);
  }
}

export function rawToStored(c: Eagle1RawCandle, nowMs = Date.now()): StoredCandle {
  const closeTime = Number(c.close_time) || c.open_time + (tfStepMs(c.timeframe) || 0);
  return {
    symbol: c.symbol,
    timeframe: eagle1TfToChartTf(c.timeframe),
    openTime: c.open_time,
    closeTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    baseVolume: c.base_volume,
    quoteTurnover: c.quote_volume,
    isClosed: closeTime <= nowMs,
  };
}

export function storedToRaw(c: StoredCandle): Eagle1RawCandle {
  return {
    exchange: 'bitget',
    symbol: c.symbol,
    market_type: 'usdt-futures',
    timeframe: chartTfToEagle1Tf(c.timeframe),
    open_time: c.openTime,
    close_time: c.closeTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    base_volume: c.baseVolume,
    quote_volume: c.quoteTurnover,
    source: 'bitget-merged',
    downloaded_at: Date.now(),
  };
}

function readOverlayJsonl(file: string): StoredCandle[] {
  const text = readUtf8IfExists(file);
  if (text == null) return [];
  const out: StoredCandle[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as StoredCandle;
      if (row && Number.isFinite(row.openTime)) out.push(row);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

export function mergeUniqueCandles(rows: StoredCandle[]): { candles: StoredCandle[]; duplicateDropped: number } {
  const map = new Map<string, StoredCandle>();
  let duplicateDropped = 0;
  for (const c of rows) {
    const k = patternMemoryUniqueKey(c.symbol, c.timeframe, c.openTime);
    if (map.has(k)) duplicateDropped += 1;
    map.set(k, c);
  }
  const candles = [...map.values()].sort((a, b) => a.openTime - b.openTime);
  return { candles, duplicateDropped };
}

export function loadUniqueStore(
  symbol: string,
  timeframe: string,
  opts?: { asOfMs?: number; lookbackMs?: number | null }
): { candles: StoredCandle[]; duplicateDropped: number; csvCount: number; overlayCount: number } {
  const now = opts?.asOfMs ?? Date.now();
  const eagleTf = chartTfToEagle1Tf(timeframe);
  const csv = loadEagle1RawCandles(symbol, eagleTf).map((c) => rawToStored(c, now));
  const overlay = readOverlayJsonl(overlayRel(symbol, timeframe));
  const merged = mergeUniqueCandles([...csv, ...overlay]);
  let candles = merged.candles;
  if (opts?.lookbackMs != null) {
    const minT = now - opts.lookbackMs;
    candles = candles.filter((c) => c.openTime >= minT);
  }
  if (opts?.asOfMs != null) {
    candles = candles.filter((c) => c.openTime <= opts.asOfMs!);
  }
  return {
    candles,
    duplicateDropped: merged.duplicateDropped,
    csvCount: csv.length,
    overlayCount: overlay.length,
  };
}

export function appendOverlayCandles(symbol: string, timeframe: string, rows: StoredCandle[]): number {
  if (!rows.length) return 0;
  ensurePatternMemoryDirs();
  const file = overlayRel(symbol, timeframe);
  const existing = loadUniqueStore(symbol, timeframe);
  const have = new Set(existing.candles.map((c) => patternMemoryUniqueKey(c.symbol, c.timeframe, c.openTime)));
  const fresh = rows.filter((c) => !have.has(patternMemoryUniqueKey(c.symbol, c.timeframe, c.openTime)));
  if (!fresh.length) return 0;
  const chunk = fresh.map((c) => JSON.stringify(c)).join('\n') + '\n';
  appendUtf8(file, chunk);
  return fresh.length;
}

export function upsertOverlayCandles(symbol: string, timeframe: string, rows: StoredCandle[]): number {
  if (!rows.length) return 0;
  ensurePatternMemoryDirs();
  const loaded = loadUniqueStore(symbol, timeframe);
  const { candles } = mergeUniqueCandles([...loaded.candles, ...rows]);
  const file = overlayRel(symbol, timeframe);
  const csvKeys = new Set(
    loadEagle1RawCandles(symbol, chartTfToEagle1Tf(timeframe)).map((c) =>
      patternMemoryUniqueKey(c.symbol, eagle1TfToChartTf(c.timeframe), c.open_time)
    )
  );
  const overlayOnly = candles.filter(
    (c) => !csvKeys.has(patternMemoryUniqueKey(c.symbol, c.timeframe, c.openTime))
  );
  writeUtf8(file, overlayOnly.map((c) => JSON.stringify(c)).join('\n') + (overlayOnly.length ? '\n' : ''));
  return overlayOnly.length;
}

export type StoreMeta = {
  symbol: string;
  timeframe: string;
  lastSyncAt: number;
  lastClosedOpenTime: number | null;
  count: number;
  firstOpenTime: number | null;
  lastOpenTime: number | null;
  repair: QualityRepairLog;
  incrementalLogs: string[];
};

export function emptyRepair(): QualityRepairLog {
  return {
    duplicateDropped: 0,
    missingFilled: 0,
    gapWindowsRepaired: 0,
    invalidOhlcRepaired: 0,
    negativeVolumeRepaired: 0,
    unfinishedDropped: 0,
    apiPages: 0,
  };
}

export function readStoreMeta(symbol: string, timeframe: string): StoreMeta | null {
  const text = readUtf8IfExists(metaRel(symbol, timeframe));
  if (text == null) return null;
  try {
    return JSON.parse(text) as StoreMeta;
  } catch {
    return null;
  }
}

export function writeStoreMeta(meta: StoreMeta): void {
  ensurePatternMemoryDirs();
  writeUtf8(metaRel(meta.symbol, meta.timeframe), JSON.stringify(meta, null, 2));
}

export function lastClosedCandle(candles: StoredCandle[], asOfMs = Date.now()): StoredCandle | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i]!;
    if (c.isClosed && c.closeTime <= asOfMs) return c;
  }
  return null;
}
