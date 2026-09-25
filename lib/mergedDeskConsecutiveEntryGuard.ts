/**
 * 코인·국면별 연속 진입 제한 — 같은 국면 3연속 방지.
 * 확정 수익 아님.
 */
const KEY = 'ailongshort.mergedDesk.consecutiveEntry.v1';

const MAX_SAME_REGIME = 2;
const COOLDOWN_MS = 8 * 60 * 1000;

type Row = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  regimeKey: string;
  count: number;
  lastAt: number;
};

type Store = { rows: Row[]; updatedAt: number };

function normSym(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[_-]/g, '');
}

function read(): Store {
  if (typeof window === 'undefined') return { rows: [], updatedAt: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { rows: [], updatedAt: 0 };
    const j = JSON.parse(raw) as Partial<Store>;
    return {
      rows: Array.isArray(j.rows) ? (j.rows as Row[]) : [],
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return { rows: [], updatedAt: 0 };
  }
}

function write(s: Store): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...s, updatedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function buildRegimeKey(params: {
  direction: 'LONG' | 'SHORT';
  sellMid?: number | null;
  buyMid?: number | null;
  timeframe?: string | null;
}): string {
  const sell = params.sellMid != null && params.sellMid > 0 ? Math.round(params.sellMid * 100) : 0;
  const buy = params.buyMid != null && params.buyMid > 0 ? Math.round(params.buyMid * 100) : 0;
  return `${params.direction}|${params.timeframe || ''}|s${sell}|b${buy}`;
}

export function consecutiveEntryGate(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  regimeKey: string;
}): { allow: boolean; reasonKo: string; count: number } {
  const sym = normSym(params.symbol);
  const store = read();
  const now = Date.now();
  const row = store.rows.find(
    (r) =>
      r.symbol === sym &&
      r.direction === params.direction &&
      r.regimeKey === params.regimeKey
  );
  if (!row) {
    return { allow: true, reasonKo: '연속진입 0 · 허용', count: 0 };
  }
  if (now - row.lastAt > COOLDOWN_MS) {
    return { allow: true, reasonKo: '연속진입 쿨다운만료 · 허용', count: 0 };
  }
  if (row.count >= MAX_SAME_REGIME) {
    return {
      allow: false,
      reasonKo: `${sym} ${params.direction} 같은국면 연속${row.count}회≥${MAX_SAME_REGIME} · 진입차단`,
      count: row.count,
    };
  }
  return {
    allow: true,
    reasonKo: `연속진입 ${row.count}/${MAX_SAME_REGIME} · 허용`,
    count: row.count,
  };
}

export function noteConsecutiveEntry(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  regimeKey: string;
}): void {
  const sym = normSym(params.symbol);
  const store = read();
  const now = Date.now();
  const rows = store.rows.filter((r) => now - r.lastAt < COOLDOWN_MS * 3);
  const idx = rows.findIndex(
    (r) =>
      r.symbol === sym &&
      r.direction === params.direction &&
      r.regimeKey === params.regimeKey
  );
  if (idx >= 0) {
    const cur = rows[idx]!;
    if (now - cur.lastAt > COOLDOWN_MS) {
      rows[idx] = { ...cur, count: 1, lastAt: now };
    } else {
      rows[idx] = { ...cur, count: cur.count + 1, lastAt: now };
    }
  } else {
    rows.push({
      symbol: sym,
      direction: params.direction,
      regimeKey: params.regimeKey,
      count: 1,
      lastAt: now,
    });
  }
  write({ rows: rows.slice(-80), updatedAt: now });
}
