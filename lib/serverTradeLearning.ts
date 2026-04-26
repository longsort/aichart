import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'trade-learning.json');

type Store = Record<string, Record<string, unknown>>;

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readAll(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(data: Store) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function readTradeLearning(user: string): Promise<Record<string, unknown> | null> {
  const all = await readAll();
  const k = String(user || '').trim();
  if (!k) return null;
  const v = all[k];
  return v && typeof v === 'object' ? v : null;
}

export async function writeTradeLearning(user: string, state: Record<string, unknown>) {
  const k = String(user || '').trim();
  if (!k) return;
  const all = await readAll();
  all[k] = state;
  await writeAll(all);
}
