import { prisma } from '@/lib/prisma';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';

export type PendingInboundRow = {
  itemId: string;
  quantity: number;
  updatedAt: Date;
};

export type PendingPressureStat = {
  pressureClass: string;
  label: string;
  skuCount: number;
  qtyTotal: number;
};

export type PendingSkuStatRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
  quantity: number;
};

/** 사이즈 문자열 숫자 정렬용 (50A → 50) */
function sizeSortKey(size: string): number {
  const m = String(size || '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/** itemId → 대기 수량 (quantity > 0만) */
export async function mapPendingQtyByItemId(): Promise<Map<string, number>> {
  const rows = await prisma.pendingInbound.findMany({
    where: { quantity: { gt: 0 } },
    select: { itemId: true, quantity: true },
  });
  return new Map(rows.map((r) => [r.itemId, r.quantity]));
}

/** 압력등급별 집계 + SKU별(압력·사이즈·대기수량) 목록 (DB 대기만) */
export async function listPendingPressureStats(): Promise<{
  stats: PendingPressureStat[];
  skuTotal: number;
  qtyTotal: number;
  items: PendingSkuStatRow[];
}> {
  const rows = await prisma.pendingInbound.findMany({
    where: { quantity: { gt: 0 } },
    include: {
      item: {
        select: {
          itemCode: true,
          itemName: true,
          pressureClass: true,
          size: true,
          isActive: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const active = rows.filter((r) => r.item.isActive);
  const map = new Map<string, PendingPressureStat>();
  for (const r of active) {
    const key = (r.item.pressureClass || '').trim() || '—';
    const cur = map.get(key) || {
      pressureClass: key,
      label: catalogPressureChipLabel(key) || key,
      skuCount: 0,
      qtyTotal: 0,
    };
    cur.skuCount += 1;
    cur.qtyTotal += r.quantity;
    map.set(key, cur);
  }

  const stats = [...map.values()].sort(
    (a, b) => b.skuCount - a.skuCount || a.pressureClass.localeCompare(b.pressureClass, 'ko'),
  );
  const qtyTotal = active.reduce((s, r) => s + r.quantity, 0);

  const items: PendingSkuStatRow[] = active
    .map((r) => ({
      itemId: r.itemId,
      itemCode: r.item.itemCode,
      itemName: r.item.itemName,
      pressureClass: r.item.pressureClass,
      size: r.item.size,
      quantity: r.quantity,
    }))
    .sort((a, b) => {
      const pa = (a.pressureClass || '').localeCompare(b.pressureClass || '', 'ko');
      if (pa !== 0) return pa;
      const sa = sizeSortKey(a.size) - sizeSortKey(b.size);
      if (sa !== 0) return sa;
      return b.quantity - a.quantity || a.itemCode.localeCompare(b.itemCode, 'ko');
    });

  return {
    stats,
    skuTotal: active.length,
    qtyTotal,
    items,
  };
}
