/**
 * 폭락구간 MTF 공용 레지스트리 — 심볼별로 각 TF에서 형성된 zone을 저장.
 * 1h에서 뜬 폭락구간 → 15m·4h 전환해도 동일 가격대 zone·라벨 유지.
 * TF당 floor(하방)+ceiling(상방 폭락감시) 슬롯.
 * 폰·PC는 localStorage만 쓰면 갈라지므로 로그인 설정(서버)에도 동기화.
 */
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { filterSharedMtfDumpZones, mtfDumpSlotKey } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { timeframeRank } from '@/lib/constants';

const REGISTRY_KEY = 'ailongshort-mtf-dump-zone-registry-v3';
const MAX_ZONES_PER_SYMBOL = 16;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

type RegistryRow = MtfDumpZoneSpec & { updatedAt: number; symbol: string };

function readAll(): Record<string, RegistryRow[]> {
  if (typeof window === 'undefined') return {};
  try {
    /** localStorage — 폰·PC 세션 유지 (sessionStorage는 탭 닫으면 사라져 PC만 남는 현상) */
    const raw =
      window.localStorage.getItem(REGISTRY_KEY) ||
      window.localStorage.getItem('ailongshort-mtf-dump-zone-registry-v2') ||
      window.sessionStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RegistryRow[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, RegistryRow[]>) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(all);
    window.localStorage.setItem(REGISTRY_KEY, raw);
    try {
      window.sessionStorage.removeItem(REGISTRY_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    /* quota */
  }
}

/** 심볼별 저장된 MTF 폭락 zone (stale·1m 전용 제외) */
export function loadMtfDumpZoneRegistry(symbol: string): MtfDumpZoneSpec[] {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) return [];
  const now = Date.now();
  const rows = (readAll()[sym] ?? []).filter((r) => now - r.updatedAt < STALE_MS);
  return filterSharedMtfDumpZones(
    rows.map(({ updatedAt: _u, symbol: _s, ...spec }) => ({
      ...spec,
      bandRole: spec.bandRole === 'ceiling' ? 'ceiling' : 'floor',
    }))
  );
}

/** 스캔 결과를 레지스트리에 병합 — TF×역할(floor/ceiling) 슬롯 (1m 전용 제외) */
export function persistMtfDumpZoneRegistry(symbol: string, incoming: MtfDumpZoneSpec[]): MtfDumpZoneSpec[] {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) return loadMtfDumpZoneRegistry(sym);
  const sharedIncoming = filterSharedMtfDumpZones(incoming);
  if (!sharedIncoming.length) return loadMtfDumpZoneRegistry(sym);

  const now = Date.now();
  const all = readAll();
  let list: RegistryRow[] = (all[sym] ?? [])
    .filter((r) => now - r.updatedAt < STALE_MS)
    .filter((r) => filterSharedMtfDumpZones([r]).length > 0);

  for (const spec of sharedIncoming) {
    const slot = mtfDumpSlotKey(spec);
    list = list.filter((r) => mtfDumpSlotKey(r) !== slot);
    list.push({
      ...spec,
      bandRole: spec.bandRole === 'ceiling' ? 'ceiling' : 'floor',
      symbol: sym,
      updatedAt: now,
    });
  }

  const bySlot = new Map<string, RegistryRow>();
  for (const row of list.sort((a, b) => timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf))) {
    const slot = mtfDumpSlotKey(row);
    if (!bySlot.has(slot)) bySlot.set(slot, row);
  }
  list = [...bySlot.values()].slice(0, MAX_ZONES_PER_SYMBOL);
  all[sym] = list;
  writeAll(all);
  scheduleDumpRegistryCloudSync(all);
  return list.map(({ updatedAt: _u, symbol: _s, ...spec }) => spec);
}

let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let lastCloudSig = '';

function scheduleDumpRegistryCloudSync(all: Record<string, RegistryRow[]>) {
  if (typeof window === 'undefined') return;
  const sig = JSON.stringify(all);
  if (sig === lastCloudSig) return;
  if (cloudSyncTimer != null) window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => {
    cloudSyncTimer = null;
    lastCloudSig = sig;
    /** 전체 saveSettings 금지 — SETTINGS_CHANGED로 차트가 다시 그려지며 폰·PC가 어긋남 */
    void fetch('/api/user-settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { chartMergedDeskMtfDumpRegistry: all } }),
    }).catch(() => {
      /* 미로그인 등은 로컬만 */
    });
  }, 1600);
}

/** 서버(로그인 설정) → 폰·PC 같은 폭락 레지스트리 */
export function hydrateMtfDumpZoneRegistryFromCloud(blob: unknown): boolean {
  if (typeof window === 'undefined' || !blob || typeof blob !== 'object') return false;
  const incoming = blob as Record<string, RegistryRow[]>;
  const now = Date.now();
  const local = readAll();
  const merged: Record<string, RegistryRow[]> = { ...local };
  let changed = false;
  for (const [sym, rows] of Object.entries(incoming)) {
    if (!Array.isArray(rows) || !sym) continue;
    const bySlot = new Map<string, RegistryRow>();
    for (const row of [...(local[sym] ?? []), ...rows]) {
      if (!row || now - Number(row.updatedAt || 0) >= STALE_MS) continue;
      const slot = mtfDumpSlotKey(row);
      const prev = bySlot.get(slot);
      if (!prev || Number(row.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
        bySlot.set(slot, { ...row, symbol: sym, updatedAt: Number(row.updatedAt) || now });
      }
    }
    const next = [...bySlot.values()].slice(0, MAX_ZONES_PER_SYMBOL);
    const prevSig = JSON.stringify(local[sym] ?? []);
    const nextSig = JSON.stringify(next);
    if (prevSig !== nextSig) changed = true;
    merged[sym] = next;
  }
  if (changed) writeAll(merged);
  return changed;
}

/** 레지스트리 + 이번 스캔 병합 (표시용) — TF×역할 슬롯 */
export function mergeMtfDumpZonesForDisplay(
  registry: MtfDumpZoneSpec[],
  scanned: MtfDumpZoneSpec[]
): MtfDumpZoneSpec[] {
  const bySlot = new Map<string, MtfDumpZoneSpec>();
  for (const spec of registry) bySlot.set(mtfDumpSlotKey(spec), spec);
  for (const spec of scanned) bySlot.set(mtfDumpSlotKey(spec), spec);
  return [...bySlot.values()]
    .sort((a, b) => timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf))
    .slice(0, MAX_ZONES_PER_SYMBOL);
}
