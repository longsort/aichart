/**
 * 서버측 통합데스크 신호 기록부 — 사용자별 JSON (data/trade-event-journal.json)
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { TradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'trade-event-journal.json');

type UserJournalStore = Record<
  string,
  {
    updatedAt: number;
    events: TradeJournalEvent[];
  }
>;

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readAll(): Promise<UserJournalStore> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserJournalStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(data: UserJournalStore) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function readServerTradeEventJournal(user: string): Promise<TradeJournalEvent[]> {
  const k = String(user || '').trim();
  if (!k) return [];
  const all = await readAll();
  return Array.isArray(all[k]?.events) ? all[k]!.events : [];
}

/** incoming 이벤트 id 기준 merge (로컬 우선·서버 보충) */
export async function mergeServerTradeEventJournal(
  user: string,
  incoming: TradeJournalEvent[]
): Promise<{ merged: number; total: number }> {
  const k = String(user || '').trim();
  if (!k || !incoming.length) return { merged: 0, total: 0 };
  const all = await readAll();
  const prev = Array.isArray(all[k]?.events) ? all[k]!.events : [];
  const ids = new Set(prev.map((e) => e.id));
  const fresh = incoming.filter((e) => e?.id && !ids.has(e.id));
  const next = [...fresh, ...prev].slice(0, 2000);
  all[k] = { updatedAt: Date.now(), events: next };
  await writeAll(all);
  return { merged: fresh.length, total: next.length };
}

export async function replaceServerTradeEventJournal(user: string, events: TradeJournalEvent[]) {
  const k = String(user || '').trim();
  if (!k) return;
  const all = await readAll();
  all[k] = { updatedAt: Date.now(), events: events.slice(0, 2000) };
  await writeAll(all);
}
