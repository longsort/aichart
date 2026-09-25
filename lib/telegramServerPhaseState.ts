/**
 * 서버 텔레 확정·타점 — 심볼×TF별 phase 상태 (앱 미접속 감지용).
 */
import fs from 'fs';
import path from 'path';
import type { ConfirmPhase } from '@/lib/tradeConfirmDesk';

const DIR = path.join(process.cwd(), 'data', 'telegram-confirm-phase');

export type TelegramServerPhaseRow = {
  phase: ConfirmPhase;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLo: number | null;
  entryHi: number | null;
  entryMid: number | null;
  invalidPrice: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  lastTpHit: 'tp1' | 'tp2' | 'tp3' | null;
  lastPrice: number | null;
  updatedAt: number;
  lastNotifyKey: string;
};

export type TelegramServerPhaseStore = Record<string, TelegramServerPhaseRow>;

function safeUser(user: string): string {
  return user.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

function pairKey(symbol: string, tf: string): string {
  return `${symbol.toUpperCase()}|${tf}`;
}

function filePath(user: string): string {
  return path.join(DIR, `${safeUser(user)}.json`);
}

export function readTelegramServerPhaseStore(user: string): TelegramServerPhaseStore {
  try {
    const p = filePath(user);
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as TelegramServerPhaseStore;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export function writeTelegramServerPhaseStore(user: string, store: TelegramServerPhaseStore): void {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(filePath(user), JSON.stringify(store, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

export function getTelegramServerPhase(
  user: string,
  symbol: string,
  tf: string
): TelegramServerPhaseRow | null {
  const store = readTelegramServerPhaseStore(user);
  return store[pairKey(symbol, tf)] ?? null;
}

export function setTelegramServerPhase(
  user: string,
  symbol: string,
  tf: string,
  row: TelegramServerPhaseRow
): void {
  const store = readTelegramServerPhaseStore(user);
  store[pairKey(symbol, tf)] = row;
  writeTelegramServerPhaseStore(user, store);
}
