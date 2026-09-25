/**
 * 서버측 가상매매·확정신호 저장 — data/ 디렉터리 JSON 파일
 * self-hosted Node 서버에서 정상 동작.
 * Vercel 등 read-only FS 환경에서는 메모리 fallback (재시작 시 초기화됨)
 */

import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');

/** FS 쓰기 실패 시 메모리 fallback (서버리스용) */
const memoryFallback = new Map<string, { virtual?: StoredVirtualData; signals?: ConfirmedSignalRecord[]; softSignals?: SoftSignalRecord[] }>();
const VIRTUAL_DIR = path.join(DATA_DIR, 'virtual-store');
const SIGNALS_DIR = path.join(DATA_DIR, 'confirmed-signals');
const SOFT_SIGNALS_DIR = path.join(DATA_DIR, 'soft-signals');
const ALERT_RULES_DIR = path.join(DATA_DIR, 'alert-rules');
const SMART_WORKFLOW_DIR = path.join(DATA_DIR, 'smart-workflow');

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

export type SoftSignalRecord = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  state: 'READY' | 'TRIGGERED';
  signalTime: number;
  at: number;
};

export type AlertRuleRecord = {
  id: string;
  symbol: string; // e.g. BTCUSDT or '*'
  timeframe: string; // e.g. 1h or '*'
  minTotalScore: number;
  minProbabilityEdge: number;
  minConditionsMet: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SmartWorkflowStateRecord = {
  symbol: string;
  timeframe: string;
  state: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID';
  at: number;
  score: number;
  probabilityEdge: number;
  signalTime?: number;
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

/** 보조신호(READY/TRIGGERED) 목록 읽기 */
export function readSoftSignals(clientId: string): SoftSignalRecord[] {
  const mem = memoryFallback.get(clientId)?.softSignals;
  if (mem) return mem;
  const safe = safeFilename(clientId);
  const filePath = path.join(SOFT_SIGNALS_DIR, `${safe}.json`);
  const arr = readJsonFile<SoftSignalRecord[]>(filePath, []);
  return Array.isArray(arr) ? arr : [];
}

/** 보조신호(READY/TRIGGERED) 추가 */
export function appendSoftSignal(clientId: string, signal: SoftSignalRecord): boolean {
  const list = readSoftSignals(clientId);
  const exists = list.some((x) =>
    x.symbol === signal.symbol &&
    x.timeframe === signal.timeframe &&
    x.direction === signal.direction &&
    x.state === signal.state &&
    x.signalTime === signal.signalTime
  );
  if (exists) return true;
  list.push(signal);
  const trimmed = list.slice(-6000);
  const safe = safeFilename(clientId);
  const filePath = path.join(SOFT_SIGNALS_DIR, `${safe}.json`);
  const ok = writeJsonFile(filePath, trimmed);
  if (!ok) {
    const prev = memoryFallback.get(clientId) || {};
    memoryFallback.set(clientId, { ...prev, softSignals: trimmed });
  }
  return ok;
}

/** 알림 규칙 읽기 */
export function readAlertRules(clientId: string): AlertRuleRecord[] {
  const safe = safeFilename(clientId);
  const filePath = path.join(ALERT_RULES_DIR, `${safe}.json`);
  const arr = readJsonFile<AlertRuleRecord[]>(filePath, []);
  return Array.isArray(arr) ? arr : [];
}

/** 알림 규칙 저장(전체 교체) */
export function writeAlertRules(clientId: string, rules: AlertRuleRecord[]): boolean {
  const safe = safeFilename(clientId);
  const filePath = path.join(ALERT_RULES_DIR, `${safe}.json`);
  return writeJsonFile(filePath, rules.slice(-400));
}

export function readSmartWorkflowStates(clientId: string): SmartWorkflowStateRecord[] {
  const safe = safeFilename(clientId);
  const filePath = path.join(SMART_WORKFLOW_DIR, `${safe}.json`);
  const arr = readJsonFile<SmartWorkflowStateRecord[]>(filePath, []);
  return Array.isArray(arr) ? arr : [];
}

export function appendSmartWorkflowState(clientId: string, row: SmartWorkflowStateRecord): boolean {
  const list = readSmartWorkflowStates(clientId);
  list.push(row);
  const safe = safeFilename(clientId);
  const filePath = path.join(SMART_WORKFLOW_DIR, `${safe}.json`);
  return writeJsonFile(filePath, list.slice(-4000));
}
