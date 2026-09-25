/**
 * Server-only microstructure ring buffers under data/eagle1/series/.
 * Pipeline stays filesystem-free; dataService ingests on each fetch.
 */
import fs from 'fs';
import path from 'path';
import type { BookSnap, LiqPoint, OfiBucket } from './microstructureSeries';

export const OFI10_MAX = 2_160;
export const OFI30_MAX = 720;
export const BOOK_MAX = 500;
export const LIQ_MAX = 2_000;

export type MicrostructureFile = {
  symbol: string;
  updated_at: number;
  ofi10s: OfiBucket[];
  ofi30s: OfiBucket[];
  books: BookSnap[];
  liqs: LiqPoint[];
};

function seriesName(symbol: string): string {
  return `${String(symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT'}.json`;
}

function emptyFile(symbol: string): MicrostructureFile {
  return { symbol, updated_at: 0, ofi10s: [], ofi30s: [], books: [], liqs: [] };
}

export function loadMicrostructureSeries(symbol: string, _root = process.cwd()): MicrostructureFile {
  void _root;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'eagle1', 'series', seriesName(symbol)), 'utf8')
    ) as MicrostructureFile;
    if (!raw || !Array.isArray(raw.ofi10s)) return emptyFile(symbol);
    return {
      symbol: raw.symbol || symbol,
      updated_at: Number(raw.updated_at) || 0,
      ofi10s: Array.isArray(raw.ofi10s) ? raw.ofi10s : [],
      ofi30s: Array.isArray(raw.ofi30s) ? raw.ofi30s : [],
      books: Array.isArray(raw.books) ? raw.books : [],
      liqs: Array.isArray(raw.liqs) ? raw.liqs : [],
    };
  } catch {
    return emptyFile(symbol);
  }
}

function mergeOfi(prev: OfiBucket[], next: OfiBucket[], max: number): OfiBucket[] {
  const map = new Map<number, OfiBucket>();
  for (const row of [...prev, ...next]) {
    if (!Number.isFinite(row.t) || !Number.isFinite(row.ofi)) continue;
    const old = map.get(row.t);
    const nextTot = row.buyQty + row.sellQty;
    const oldTot = old ? old.buyQty + old.sellQty : -1;
    if (!old || nextTot >= oldTot) map.set(row.t, row);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-max);
}

function mergeBooks(prev: BookSnap[], next: BookSnap[], max: number): BookSnap[] {
  const map = new Map<number, BookSnap>();
  for (const row of [...prev, ...next]) {
    if (!Number.isFinite(row.t) || row.t <= 0) continue;
    map.set(row.t, row);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-max);
}

function liqKey(p: LiqPoint): string {
  return `${p.t}:${p.side}:${p.price}:${p.amount}`;
}

function mergeLiqs(prev: LiqPoint[], next: LiqPoint[], max: number): LiqPoint[] {
  const map = new Map<string, LiqPoint>();
  for (const row of [...prev, ...next]) {
    if (!Number.isFinite(row.t) || !(row.usd > 0)) continue;
    map.set(liqKey(row), row);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-max);
}

export function ingestMicrostructureSeries(
  input: {
    symbol: string;
    ofi10s?: OfiBucket[];
    ofi30s?: OfiBucket[];
    book?: BookSnap | null;
    liqs?: LiqPoint[];
  },
  root = process.cwd()
): MicrostructureFile {
  const prev = loadMicrostructureSeries(input.symbol, root);
  const next: MicrostructureFile = {
    symbol: String(input.symbol || prev.symbol || 'BTCUSDT').toUpperCase(),
    updated_at: Date.now(),
    ofi10s: mergeOfi(prev.ofi10s, input.ofi10s ?? [], OFI10_MAX),
    ofi30s: mergeOfi(prev.ofi30s, input.ofi30s ?? [], OFI30_MAX),
    books: mergeBooks(prev.books, input.book ? [input.book] : [], BOOK_MAX),
    liqs: mergeLiqs(prev.liqs, input.liqs ?? [], LIQ_MAX),
  };
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1', 'series'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'data', 'eagle1', 'series', seriesName(next.symbol)),
    JSON.stringify(next),
    'utf8'
  );
  return next;
}
