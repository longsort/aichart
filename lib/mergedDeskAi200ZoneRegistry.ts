/**
 * AI200 확정 타점 zone — 심볼·TF별 레지스트리 (LTF 전환해도 동일 가격 zone 유지).
 * 확정 승률·수익 보장 아님.
 */
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';

export const AI200_SCAN_TFS = ['1m', '3m', '5m', '15m'] as const;

export type Ai200ZoneSpec = {
  sourceTf: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  top: number;
  bot: number;
  mid: number;
  formedTime: number;
  evidenceKo: string[];
  detailKo: string;
};

const REGISTRY_KEY = 'ailongshort-ai200-zone-registry-v1';
const MAX_ZONES_PER_SYMBOL = 8;
const STALE_MS = 6 * 60 * 60 * 1000;

type RegistryRow = Ai200ZoneSpec & { updatedAt: number; symbol: string };

function readAll(): Record<string, RegistryRow[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RegistryRow[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, RegistryRow[]>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

export function ai200SlotKey(z: Pick<Ai200ZoneSpec, 'sourceTf' | 'direction' | 'entry'>): string {
  const tf = normalizeChartTimeframe(z.sourceTf);
  const e = Math.round(z.entry * 100) / 100;
  return `${tf}:${z.direction}:${e}`;
}

export function resolveAi200ScanTfs(chartTf: string): string[] {
  const chart = normalizeChartTimeframe(chartTf);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tf of [...AI200_SCAN_TFS, chart]) {
    const n = normalizeChartTimeframe(tf);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort((a, b) => timeframeRank(a) - timeframeRank(b));
}

export function loadAi200ZoneRegistry(symbol: string): Ai200ZoneSpec[] {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) return [];
  const now = Date.now();
  return (readAll()[sym] ?? [])
    .filter((r) => now - r.updatedAt < STALE_MS)
    .map(({ updatedAt: _u, symbol: _s, ...spec }) => ({
      ...spec,
      tp1: Number(spec.tp1) || 0,
      tp2: Number(spec.tp2) || 0,
      tp3: Number(spec.tp3) || 0,
    }));
}

export function persistAi200ZoneRegistry(
  symbol: string,
  incoming: Ai200ZoneSpec[]
): Ai200ZoneSpec[] {
  const sym = String(symbol || '').toUpperCase();
  if (!sym || !incoming.length) return loadAi200ZoneRegistry(sym);

  const now = Date.now();
  const all = readAll();
  let list: RegistryRow[] = (all[sym] ?? []).filter((r) => now - r.updatedAt < STALE_MS);

  for (const spec of incoming) {
    const slot = ai200SlotKey(spec);
    list = list.filter((r) => ai200SlotKey(r) !== slot);
    list.push({ ...spec, symbol: sym, updatedAt: now });
  }

  const bySlot = new Map<string, RegistryRow>();
  for (const row of list.sort((a, b) => timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf))) {
    const slot = ai200SlotKey(row);
    if (!bySlot.has(slot)) bySlot.set(slot, row);
  }
  list = [...bySlot.values()].slice(0, MAX_ZONES_PER_SYMBOL);
  all[sym] = list;
  writeAll(all);
  return list.map(({ updatedAt: _u, symbol: _s, ...spec }) => spec);
}

export function mergeAi200ZonesForDisplay(
  registry: Ai200ZoneSpec[],
  scanned: Ai200ZoneSpec[]
): Ai200ZoneSpec[] {
  const bySlot = new Map<string, Ai200ZoneSpec>();
  for (const spec of [...registry, ...scanned].sort(
    (a, b) => timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf)
  )) {
    const slot = ai200SlotKey(spec);
    if (!bySlot.has(slot)) bySlot.set(slot, spec);
  }
  return [...bySlot.values()]
    .sort((a, b) => timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf))
    .slice(0, MAX_ZONES_PER_SYMBOL);
}
