/**
 * 서버측 가상매매·확정신호 저장 — data/ 디렉터리 JSON 파일
 * self-hosted Node 서버에서 정상 동작.
 * Vercel 등 read-only FS 환경에서는 메모리 fallback (재시작 시 초기화됨)
 */

import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');

/** FS 쓰기 실패 시 메모리 fallback (서버리스용) */
const memoryFallback = new Map<string, { virtual?: StoredVirtualData; signals?: ConfirmedSignalRecord[] }>();
const VIRTUAL_DIR = path.join(DATA_DIR, 'virtual-store');
const SIGNALS_DIR = path.join(DATA_DIR, 'confirmed-signals');

function ensureDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function safeFilename(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

export type StoredVirtualData = {
  trades: unknown[];
  failedSignals: unknown[];
  updatedAt: number;
};

export type ConfirmedSignalRecord = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  targets: number[];
  entryTime: number;
  at: number;
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw || 'null') as T ?? fallback;
    }
  } catch {}
  return fallback;
}

function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** 가상매매·실패신호 읽기 */
export function readVirtualStore(clientId: string): StoredVirtualData {
  const mem = memoryFallback.get(clientId)?.virtual;
  if (mem) return mem;

  const safe = safeFilename(clientId);
  const filePath = path.join(VIRTUAL_DIR, `${safe}.json`);
  const fallback: StoredVirtualData = { trades: [], failedSignals: [], updatedAt: 0 };
  const data = readJsonFile<StoredVirtualData>(filePath, fallback);
  if (!data || typeof data !== 'object') return fallback;
  return {
    trades: Array.isArray(data.trades) ? data.trades : [],
    failedSignals: Array.isArray(data.failedSignals) ? data.failedSignals : [],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

/** 가상매매·실패신호 저장 */
export function writeVirtualStore(
  clientId: string,
  trades: unknown[],
  failedSignals: unknown[]
): boolean {
  const payload: StoredVirtualData = {
    trades: trades.slice(-500),
    failedSignals: failedSignals.slice(-500),
    updatedAt: Date.now(),
  };
  const safe = safeFilename(clientId);
  const filePath = path.join(VIRTUAL_DIR, `${safe}.json`);
  const ok = writeJsonFile(filePath, payload);
  if (!ok) {
    const prev = memoryFallback.get(clientId) || {};
    memoryFallback.set(clientId, { ...prev, virtual: payload });
  }
  return ok;
}

/** 확정신호 목록 읽기 */
export function readConfirmedSignals(clientId: string): ConfirmedSignalRecord[] {
  const mem = memoryFallback.get(clientId)?.signals;
  if (mem) return mem;

  const safe = safeFilename(clientId);
  const filePath = path.join(SIGNALS_DIR, `${safe}.json`);
  const arr = readJsonFile<ConfirmedSignalRecord[]>(filePath, []);
  return Array.isArray(arr) ? arr : [];
}

/** 확정신호 추가 */
export function appendConfirmedSignal(
  clientId: string,
  signal: ConfirmedSignalRecord
): boolean {
  const list = readConfirmedSignals(clientId);
  list.push(signal);
  const trimmed = list.slice(-2000);
  const safe = safeFilename(clientId);
  const filePath = path.join(SIGNALS_DIR, `${safe}.json`);
  const ok = writeJsonFile(filePath, trimmed);
  if (!ok) {
    const prev = memoryFallback.get(clientId) || {};
    memoryFallback.set(clientId, { ...prev, signals: trimmed });
  }
  return ok;
}
