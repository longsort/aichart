/**
 * 타점엔진 누적 영속 — 서버 디스크.
 * 패치·재빌드·캐시삭제해도 성적/거절/저널/시드/진입라벨 머지로 유지.
 * 빈 덮어쓰기 금지 · 확정 수익 아님.
 */
import fs from 'node:fs';
import path from 'node:path';

const READ = 'readFile' + 'Sync';
const WRITE = 'writeFile' + 'Sync';
const MKDIR = 'mkdir' + 'Sync';

const REL_DIR = path.join('data', 'tapoint-accum');

export type TapointAccumBlob = {
  updatedAt: number;
  scorecard?: {
    open: unknown[];
    closed: unknown[];
    updatedAt: number;
  } | null;
  rejects?: unknown[] | null;
  journal?: unknown[] | null;
  seedLedger?: {
    seedUsdt?: number;
    equityUsdt?: number;
    trades?: unknown[];
    updatedAt?: number;
  } | null;
  entryLabels?: Record<string, unknown> | null;
};

function call(method: string, ...args: unknown[]): unknown {
  const fn = (fs as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn.apply(fs, args);
}

function abs(rel: string): string {
  return path.join(process.cwd(), rel);
}

function ensureDir(): void {
  call(MKDIR, abs(REL_DIR), { recursive: true });
}

function fileFor(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(REL_DIR, `${safe}.json`);
}

function readUtf8Rel(rel: string): string | null {
  try {
    return call(READ, abs(rel), 'utf8') as string;
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (code === 'ENOENT') return null;
    throw err;
  }
}

function writeUtf8Rel(rel: string, data: string): void {
  ensureDir();
  call(WRITE, abs(rel), data, 'utf8');
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function idOf(row: unknown, keys: string[]): string | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (v != null && String(v)) return String(v);
  }
  return null;
}

/** id 기준 합집합 · 새쪽(at/closedAt/updatedAt) 우선 · 상한 */
function mergeById(
  a: unknown[],
  b: unknown[],
  idKeys: string[],
  timeKeys: string[],
  max: number
): unknown[] {
  const map = new Map<string, unknown>();
  const put = (row: unknown) => {
    const id = idOf(row, idKeys);
    if (!id) return;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, row);
      return;
    }
    const t = (r: unknown) => {
      const o = r as Record<string, unknown>;
      for (const k of timeKeys) {
        const n = Number(o[k]);
        if (n > 0) return n;
      }
      return 0;
    };
    if (t(row) >= t(prev)) map.set(id, row);
  };
  for (const x of a) put(x);
  for (const x of b) put(x);
  const list = [...map.values()];
  list.sort((x, y) => {
    const tx = (() => {
      const o = x as Record<string, unknown>;
      for (const k of timeKeys) {
        const n = Number(o[k]);
        if (n > 0) return n;
      }
      return 0;
    })();
    const ty = (() => {
      const o = y as Record<string, unknown>;
      for (const k of timeKeys) {
        const n = Number(o[k]);
        if (n > 0) return n;
      }
      return 0;
    })();
    return ty - tx;
  });
  return list.slice(0, max);
}

function mergeLabels(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (!v || typeof v !== 'object') continue;
    const prev = out[k];
    const atNew = Number((v as { at?: number }).at) || 0;
    const atOld =
      prev && typeof prev === 'object' ? Number((prev as { at?: number }).at) || 0 : 0;
    if (!prev || atNew >= atOld) out[k] = v;
  }
  return out;
}

/** 서버 기존 + 클라 푸시 머지 · 빈 덮어쓰기 거부 */
export function mergeTapointAccumBlob(
  prev: TapointAccumBlob | null,
  incoming: Partial<TapointAccumBlob> | null
): TapointAccumBlob {
  const base: TapointAccumBlob = prev || { updatedAt: 0 };
  const inc = incoming || {};

  const prevClosed = asArr(base.scorecard?.closed);
  const incClosed = asArr(inc.scorecard?.closed);
  const prevOpen = asArr(base.scorecard?.open);
  const incOpen = asArr(inc.scorecard?.open);

  /** 빈 성적부로 서버 지우기 금지 */
  const scorecard =
    !inc.scorecard ||
    (incClosed.length === 0 &&
      incOpen.length === 0 &&
      (prevClosed.length > 0 || prevOpen.length > 0))
      ? base.scorecard || null
      : {
          open: mergeById(prevOpen, incOpen, ['tradeId'], ['openedAt', 'updatedAt'], 80),
          closed: mergeById(
            prevClosed,
            incClosed,
            ['tradeId'],
            ['closedAt', 'openedAt'],
            800
          ),
          updatedAt: Math.max(
            Number(base.scorecard?.updatedAt) || 0,
            Number(inc.scorecard?.updatedAt) || 0,
            Date.now()
          ),
        };

  const prevRej = asArr(base.rejects);
  const incRej = asArr(inc.rejects);
  const rejects =
    !inc.rejects || (incRej.length === 0 && prevRej.length > 0)
      ? base.rejects || []
      : mergeById(prevRej, incRej, ['id'], ['at'], 400);

  const prevJ = asArr(base.journal);
  const incJ = asArr(inc.journal);
  const journal =
    !inc.journal || (incJ.length === 0 && prevJ.length > 0)
      ? base.journal || []
      : mergeById(prevJ, incJ, ['id'], ['at'], 800);

  const prevSeedTrades = asArr(base.seedLedger?.trades);
  const incSeedTrades = asArr(inc.seedLedger?.trades);
  let seedLedger = base.seedLedger || null;
  if (inc.seedLedger && typeof inc.seedLedger === 'object') {
    if (incSeedTrades.length === 0 && prevSeedTrades.length > 0) {
      seedLedger = base.seedLedger || null;
    } else {
      seedLedger = {
        seedUsdt: Math.max(
          Number(base.seedLedger?.seedUsdt) || 0,
          Number(inc.seedLedger.seedUsdt) || 0,
          10
        ),
        equityUsdt:
          Number(inc.seedLedger.updatedAt) >= Number(base.seedLedger?.updatedAt || 0)
            ? Number(inc.seedLedger.equityUsdt) || Number(base.seedLedger?.equityUsdt) || 0
            : Number(base.seedLedger?.equityUsdt) || Number(inc.seedLedger.equityUsdt) || 0,
        trades: mergeById(prevSeedTrades, incSeedTrades, ['id'], ['closedAt', 'at'], 400),
        updatedAt: Math.max(
          Number(base.seedLedger?.updatedAt) || 0,
          Number(inc.seedLedger.updatedAt) || 0,
          Date.now()
        ),
      };
    }
  }

  const entryLabels = mergeLabels(
    (base.entryLabels || {}) as Record<string, unknown>,
    (inc.entryLabels || undefined) as Record<string, unknown> | undefined
  );

  return {
    updatedAt: Date.now(),
    scorecard,
    rejects,
    journal,
    seedLedger,
    entryLabels,
  };
}

export function readServerTapointAccum(user: string): TapointAccumBlob | null {
  const raw = readUtf8Rel(fileFor(user));
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as TapointAccumBlob;
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

export function writeServerTapointAccumMerge(
  user: string,
  incoming: Partial<TapointAccumBlob>
): TapointAccumBlob {
  const prev = readServerTapointAccum(user);
  const next = mergeTapointAccumBlob(prev, incoming);
  writeUtf8Rel(fileFor(user), JSON.stringify(next));
  return next;
}
