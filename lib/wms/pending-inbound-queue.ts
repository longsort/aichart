/**
 * 입고대기 대기열 — 사용자가 담은 SKU만 (전체 미입고 450과 분리).
 * 브라우저 localStorage · 통계 팝업과 공유.
 */

export const PENDING_INBOUND_QUEUE_KEY = 'wms-pending-inbound-queue-v1';

export type PendingInboundQueueItem = {
  id: string;
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
  /** 사용자가 적어 둔 입고 예정 수량(선택) */
  qty?: number;
  addedAt: number;
};

export type PendingPressureStat = {
  pressureClass: string;
  skuCount: number;
  qtyTotal: number;
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readPendingInboundQueue(): PendingInboundQueueItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_INBOUND_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is PendingInboundQueueItem => {
        if (!x || typeof x !== 'object') return false;
        const o = x as Record<string, unknown>;
        return typeof o.id === 'string' && o.id.length > 0;
      })
      .map((o) => ({
        id: String(o.id),
        itemCode: String(o.itemCode || ''),
        itemName: String(o.itemName || ''),
        pressureClass: String(o.pressureClass || '').trim() || '—',
        size: String(o.size || ''),
        qty: typeof o.qty === 'number' && o.qty > 0 ? o.qty : undefined,
        addedAt: typeof o.addedAt === 'number' ? o.addedAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

export function writePendingInboundQueue(items: PendingInboundQueueItem[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PENDING_INBOUND_QUEUE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('wms-pending-inbound-queue'));
  } catch {
    /* quota / private mode */
  }
}

export function upsertPendingInboundQueueItem(
  item: Omit<PendingInboundQueueItem, 'addedAt'> & { addedAt?: number },
): PendingInboundQueueItem[] {
  const prev = readPendingInboundQueue();
  const next = prev.filter((x) => x.id !== item.id);
  next.unshift({
    ...item,
    pressureClass: (item.pressureClass || '').trim() || '—',
    addedAt: item.addedAt ?? Date.now(),
  });
  writePendingInboundQueue(next);
  return next;
}

export function removePendingInboundQueueItem(id: string): PendingInboundQueueItem[] {
  const next = readPendingInboundQueue().filter((x) => x.id !== id);
  writePendingInboundQueue(next);
  return next;
}

export function clearPendingInboundQueue() {
  writePendingInboundQueue([]);
}

/** 대기열 SKU → 압력등급별 건수·예정수량 (통계 팝업용) */
export function aggregatePendingPressureStats(
  items: PendingInboundQueueItem[] = readPendingInboundQueue(),
): PendingPressureStat[] {
  const map = new Map<string, PendingPressureStat>();
  for (const it of items) {
    const key = (it.pressureClass || '').trim() || '—';
    const cur = map.get(key) || { pressureClass: key, skuCount: 0, qtyTotal: 0 };
    cur.skuCount += 1;
    cur.qtyTotal += typeof it.qty === 'number' && it.qty > 0 ? it.qty : 0;
    map.set(key, cur);
  }
  return [...map.values()].sort(
    (a, b) => b.skuCount - a.skuCount || a.pressureClass.localeCompare(b.pressureClass, 'ko'),
  );
}
