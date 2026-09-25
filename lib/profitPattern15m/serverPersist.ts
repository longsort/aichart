/**
 * 서버 일일캡 · 신호 중복방지 · 서버 락 파일.
 */
import fs from 'fs';
import path from 'path';
import {
  PP_PAPER_MAX_TRADES_PER_DAY,
  ppUtcDayKey,
} from '@/lib/profitPattern15m/paperPolicy';
import { ppNormalizeSymbol } from '@/lib/profitPattern15m/skill';
import type { PpLockedLevels } from '@/lib/profitPattern15m/lockedLevels';

const DIR = path.join(process.cwd(), 'data', 'eagle1');
const DAY_CAP = path.join(DIR, 'profit_pattern_server_daycap.json');
const FIRED = path.join(DIR, 'profit_pattern_server_fired.json');
const LOCKS = path.join(DIR, 'profit_pattern_server_locks.json');

function ensure() {
  fs.mkdirSync(DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

type DayCapFile = { day: string; bySymbol: Record<string, number> };

export function ppServerDayCapCanEnter(
  symbol: string,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  const day = ppUtcDayKey(nowSec);
  const s = readJson<DayCapFile>(DAY_CAP, { day: '', bySymbol: {} });
  if (s.day !== day) return true;
  const n = Number(s.bySymbol[ppNormalizeSymbol(symbol)]) || 0;
  return n < PP_PAPER_MAX_TRADES_PER_DAY;
}

export function ppServerDayCapRecord(
  symbol: string,
  nowSec = Math.floor(Date.now() / 1000)
): void {
  const day = ppUtcDayKey(nowSec);
  const sym = ppNormalizeSymbol(symbol);
  const s = readJson<DayCapFile>(DAY_CAP, { day: '', bySymbol: {} });
  if (s.day !== day) {
    writeJson(DAY_CAP, { day, bySymbol: { [sym]: 1 } });
    return;
  }
  writeJson(DAY_CAP, {
    day,
    bySymbol: { ...s.bySymbol, [sym]: (Number(s.bySymbol[sym]) || 0) + 1 },
  });
}

type FiredFile = { ids: string[]; at: number };

export function ppServerWasFired(eventId: string): boolean {
  const f = readJson<FiredFile>(FIRED, { ids: [], at: 0 });
  return f.ids.includes(eventId);
}

export function ppServerMarkFired(eventId: string): void {
  const f = readJson<FiredFile>(FIRED, { ids: [], at: 0 });
  const ids = [eventId, ...f.ids.filter((x) => x !== eventId)].slice(0, 4000);
  writeJson(FIRED, { ids, at: Date.now() });
}

export function ppServerLockLevels(row: PpLockedLevels): void {
  const sym = ppNormalizeSymbol(row.symbol);
  const all = readJson<Record<string, PpLockedLevels>>(LOCKS, {});
  all[sym] = { ...row, symbol: sym };
  writeJson(LOCKS, all);
}

export function ppServerGetLock(symbol: string): PpLockedLevels | null {
  const all = readJson<Record<string, PpLockedLevels>>(LOCKS, {});
  return all[ppNormalizeSymbol(symbol)] || null;
}

export function ppServerClearLock(symbol: string): void {
  const all = readJson<Record<string, PpLockedLevels>>(LOCKS, {});
  const sym = ppNormalizeSymbol(symbol);
  if (!(sym in all)) return;
  delete all[sym];
  writeJson(LOCKS, all);
}

export function ppServerAppendJournal(row: Record<string, unknown>): void {
  ensure();
  const sym = ppNormalizeSymbol(String(row.symbol || 'UNKNOWN'));
  const file = path.join(DIR, 'profit_pattern_journal', `${sym}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    JSON.stringify({ ...row, savedAt: Date.now(), via: 'server' }) + '\n',
    'utf8'
  );
}
