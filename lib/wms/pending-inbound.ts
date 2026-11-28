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

/** itemId → 대기 수량 (quantity > 0만) */
export async function mapPendingQtyByItemId(): Promise<Map<string, number>> {
  const rows = await prisma.pendingInbound.findMany({
    where: { quantity: { gt: 0 } },
    select: { itemId: true, quantity: true },
  });
  return new Map(rows.map((r) => [r.itemId, r.quantity]));
}

/** 압력등급별 입고대기 SKU 수·수량 합 (DB 대기만) */
export async function listPendingPressureStats(): Promise<{
  stats: PendingPressureStat[];
  skuTotal: number;
  qtyTotal: number;
  items: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    pressureClass: string;
    size: string;
    quantity: number;
  }>;
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

  return {
    stats,
    skuTotal: active.length,
    qtyTotal,
    items: active.map((r) => ({
      itemId: r.itemId,
      itemCode: r.item.itemCode,
      itemName: r.item.itemName,
      pressureClass: r.item.pressureClass,
      size: r.item.size,
      quantity: r.quantity,
    })),
  };
}
