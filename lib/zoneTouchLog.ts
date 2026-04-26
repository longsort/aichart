/**
 * 존 근접 시 체결 편향 스냅샷 — localStorage 누적 (통계 참고용, 확정 수익률 아님).
 */

const LS_KEY = 'ailongshort-zone-touch-log-v1';
const MAX_ENTRIES = 600;
const DEDUPE_MS = 90_000;

export type ZoneTouchContext = 'inst-lower' | 'inst-upper' | 'cp-lower' | 'cp-upper' | 'ref';

export type ZoneTouchEntry = {
  ts: number;
  symbol: string;
  timeframe: string;
  context: ZoneTouchContext;
  buyPressure: number;
  dominant: 'buy' | 'sell' | 'neutral';
};

function loadAll(): ZoneTouchEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? (j as ZoneTouchEntry[]).filter((e) => e && typeof e.ts === 'number') : [];
  } catch {
    return [];
  }
}

function saveAll(rows: ZoneTouchEntry[]) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-MAX_ENTRIES)));
  } catch {}
}

const lastDedupe = new Map<string, number>();

function dedupeKey(symbol: string, tf: string, ctx: ZoneTouchContext): string {
  return `${symbol}|${tf}|${ctx}`;
}

/** 근접 이벤트 1건 기록 (같은 심볼·TF·맥락은 DEDUPE_MS 안 중복) */
export function appendZoneTouch(entry: ZoneTouchEntry): void {
  if (typeof window === 'undefined') return;
  const k = dedupeKey(entry.symbol, entry.timeframe, entry.context);
  const now = entry.ts;
  const prev = lastDedupe.get(k) ?? 0;
  if (now - prev < DEDUPE_MS) return;
  lastDedupe.set(k, now);

  const all = loadAll();
  all.push(entry);
  saveAll(all);
}

export type ZoneTouchStats = {
  windowMs: number;
  total: number;
  buyDominant: number;
  sellDominant: number;
  neutral: number;
};

export function getZoneTouchStats(symbol: string, timeframe: string, windowMs: number): ZoneTouchStats {
  if (typeof window === 'undefined') {
    return { windowMs, total: 0, buyDominant: 0, sellDominant: 0, neutral: 0 };
  }
  const cutoff = Date.now() - windowMs;
  const rows = loadAll().filter((e) => e.symbol === symbol && e.timeframe === timeframe && e.ts >= cutoff);
  let buyDominant = 0;
  let sellDominant = 0;
  let neutral = 0;
  for (const e of rows) {
    if (e.dominant === 'buy') buyDominant++;
    else if (e.dominant === 'sell') sellDominant++;
    else neutral++;
  }
  return {
    windowMs,
    total: rows.length,
    buyDominant,
    sellDominant,
    neutral,
  };
}

export function clearZoneTouchLog(): void {
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {}
  lastDedupe.clear();
}
