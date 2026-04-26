import { promises as fs } from 'fs';
import path from 'path';

const DEDUP = path.join(process.cwd(), 'data', 'telegram-multitf-cron-dedup.json');
const MAX_KEYS = 400;
const TOMB = 3_600_000; // 1h 이전 키 정리

type Row = Record<string, number>;

async function readRow(): Promise<Row> {
  try {
    const raw = await fs.readFile(DEDUP, 'utf8');
    const p = JSON.parse(raw) as Row;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

async function writeRow(row: Row) {
  await fs.mkdir(path.dirname(DEDUP), { recursive: true });
  await fs.writeFile(DEDUP, JSON.stringify(row), 'utf8');
}

/** 서버 PM2/크론: 동일 eventKey 쿨다운(스팸 방지) — 앱·탭 끄고도 지속 */
export async function telegramEventDedupServerTry(
  key: string,
  cooldownMs: number
): Promise<boolean> {
  if (!key) return true;
  const t = Date.now();
  const row = await readRow();
  const prev = row[key];
  if (prev != null && t - prev < cooldownMs) {
    return false;
  }
  row[key] = t;
  const cut = t - TOMB;
  for (const [k, v] of Object.entries(row)) {
    if (v < cut) delete row[k];
  }
  if (Object.keys(row).length > MAX_KEYS) {
    const ent = Object.entries(row).sort((a, b) => a[1] - b[1]);
    while (ent.length > Math.floor(MAX_KEYS * 0.7)) {
      const drop = ent.shift();
      if (drop) delete row[drop[0]];
    }
  }
  await writeRow(row);
  return true;
}
