/**
 * 서버 텔레그램 이벤트 디듀프 — 동일 자리 스팸 방지.
 * 쿨다운보다 긴 TTL로 키를 유지 (예전 1h 정리 → 긴 쿨다운이 무력화되던 버그 수정).
 */
import { promises as fs } from 'fs';
import path from 'path';

const DEDUP = path.join(process.cwd(), 'data', 'telegram-multitf-cron-dedup.json');
const MAX_KEYS = 800;
/** 최대 쿨다운(48h)보다 길게 보관 — 키 조기 삭제 방지 */
const TOMB_MS = 72 * 60 * 60_000;

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
  const cd = Math.max(0, Number(cooldownMs) || 0);
  if (prev != null && t - prev < cd) {
    return false;
  }
  row[key] = t;
  const cut = t - TOMB_MS;
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

/** 가격 버킷 — mid가 조금 흔들려도 같은 자리로 취급 */
export function telegramPriceBucket(price: number, mid: number): number {
  const p = Math.max(Number(price) || 0, Number(mid) || 0, 1);
  const step = Math.max(p * 0.004, p >= 1000 ? 25 : 0.5); // ~0.4%
  return Math.round(Number(mid) / step);
}
