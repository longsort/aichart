/**
 * Dual A/B/C · S급 → setupSources 힌트 (클라이언트).
 * localStorage만 사용 — fs/path 금지 (webpack 클라이언트 번들).
 * 서버 디스크 영속은 setupSourceBridge.server.ts.
 */
export type TapSetupHintRow = {
  symbol: string;
  source: string;
  direction: 'LONG' | 'SHORT' | null;
  grade?: string | null;
  noteKo?: string | null;
  timeframe?: string | null;
  at: number;
  signalId?: string | null;
};

const LS_KEY = 'ailongshort.tap.setupHints.v1';
const MAX = 80;
const TTL_MS = 45 * 60_000;

function loadAll(): TapSetupHintRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as TapSetupHintRow[]) : [];
  } catch {
    return [];
  }
}

function saveAll(list: TapSetupHintRow[]): void {
  if (typeof window === 'undefined') return;
  const trimmed = list
    .filter((r) => Date.now() - Number(r.at) < TTL_MS)
    .slice(-MAX);
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

/** 스캔/레이스가 신호 발견 시 호출 — 주문 아님 */
export function recordTapSetupSourceHint(row: TapSetupHintRow): void {
  const sym = String(row.symbol || '').toUpperCase();
  if (!sym) return;
  const list = loadAll().filter(
    (x) =>
      !(
        String(x.symbol).toUpperCase() === sym &&
        x.source === row.source &&
        x.direction === row.direction
      )
  );
  list.push({
    ...row,
    symbol: sym,
    at: row.at || Date.now(),
  });
  saveAll(list);
}

export function loadTapSetupSourceHints(symbol: string): {
  sources: string[];
  setupHint: {
    direction: 'LONG' | 'SHORT' | null;
    grade: string | null;
    noteKo: string | null;
  } | null;
} {
  const sym = String(symbol || '').toUpperCase();
  const now = Date.now();
  const rows = loadAll().filter(
    (r) => String(r.symbol).toUpperCase() === sym && now - Number(r.at) < TTL_MS
  );
  if (!rows.length) {
    return { sources: [], setupHint: null };
  }
  const sources = [
    ...new Set(rows.map((r) => String(r.source || '').trim()).filter(Boolean)),
  ];
  const latest = [...rows].sort((a, b) => Number(b.at) - Number(a.at))[0]!;
  const grade =
    rows.find((r) => r.grade === 'S' || r.grade === 's')?.grade ||
    latest.grade ||
    (sources.includes('structure-s') ? 'S' : null);
  const dirs = rows.map((r) => r.direction).filter(Boolean) as Array<
    'LONG' | 'SHORT'
  >;
  const longN = dirs.filter((d) => d === 'LONG').length;
  const shortN = dirs.filter((d) => d === 'SHORT').length;
  let direction: 'LONG' | 'SHORT' | null = latest.direction;
  if (longN > shortN) direction = 'LONG';
  else if (shortN > longN) direction = 'SHORT';

  return {
    sources: sources.map((s) => `setup:${s}`),
    setupHint: {
      direction,
      grade: grade ? String(grade) : null,
      noteKo:
        latest.noteKo ||
        `셋업소스 ${sources.slice(0, 4).join('+')} · 즉시주문아님`,
    },
  };
}

/** Dual 소스 id → 표시용 */
export function dualSourceToSetupId(src: string): string {
  const s = String(src || '');
  if (s === 'rb-scalp') return 'signal-A-fast';
  if (s === 'btc-rocket-cart') return 'signal-B-rocket';
  if (s === 'structure-s') return 'signal-C-S';
  if (s === 'ai-zone') return 'ai-zone';
  if (s === 'bnb-ppl-candle') return 'bnb-ppl';
  return s || 'unknown';
}

/**
 * Dual A/B/C·S급 레이스 승자 → 힌트만 기록.
 * tapOnly에서도 호출 가능 · 주문 아님.
 */
export function recordDualRaceAsSetupHint(params: {
  symbol: string;
  source: string;
  direction: 'LONG' | 'SHORT';
  signalId?: string | null;
  timeframe?: string | null;
  noteKo?: string | null;
  grade?: string | null;
}): void {
  const setupId = dualSourceToSetupId(params.source);
  const isS =
    setupId === 'signal-C-S' || params.grade === 'S' || params.grade === 's';
  recordTapSetupSourceHint({
    symbol: params.symbol,
    source: setupId,
    direction: params.direction,
    grade: isS ? 'S' : params.grade || null,
    noteKo:
      params.noteKo || `Dual ${setupId} · SETUP힌트 · 즉시주문아님`,
    timeframe: params.timeframe || null,
    signalId: params.signalId || null,
    at: Date.now(),
  });
}
