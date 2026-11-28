import { prisma } from '@/lib/prisma';
import { InventoryLotStatus, MaterialType, ProcessOrderStatus, ProcessStep } from '@prisma/client';
import { mopiItemCodeToFinished } from '@/lib/wms/yuil-catalog-size-grid';

export type MopiSkuQueueRow = {
  id: string;
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
  materialType: string;
  locationName: string;
  onHand: number;
  pendingQty: number;
  finishedItemCode: string;
  finishedItemId: string | null;
};

/** 모피 카탈로그 SKU + 보유/대기 (M-* SEMI_RAW) */
export async function listMopiSkuRows(): Promise<MopiSkuQueueRow[]> {
  const items = await prisma.item.findMany({
    where: {
      isActive: true,
      materialType: MaterialType.SEMI_RAW,
      itemCode: { startsWith: 'M-' },
    },
    include: {
      location: { select: { name: true, zone: true } },
      lots: { select: { quantity: true, status: true } },
      pendingInbound: { select: { quantity: true } },
    },
    orderBy: [{ pressureClass: 'asc' }, { itemCode: 'asc' }],
  });

  const finishedCodes = [...new Set(items.map((it) => mopiItemCodeToFinished(it.itemCode)))];
  const finished = await prisma.item.findMany({
    where: { itemCode: { in: finishedCodes }, isActive: true },
    select: { id: true, itemCode: true },
  });
  const finishedByCode = new Map(finished.map((f) => [f.itemCode, f.id]));

  return items.map((it) => {
    const finishedItemCode = mopiItemCodeToFinished(it.itemCode);
    const onHand = it.lots
      .filter((l) => l.status !== InventoryLotStatus.SHIPPED && l.status !== InventoryLotStatus.DEFECT)
      .reduce((s, l) => s + l.quantity, 0);
    return {
      id: it.id,
      itemCode: it.itemCode,
      itemName: it.itemName,
      pressureClass: it.pressureClass,
      size: it.size,
      materialType: it.materialType,
      locationName: it.location
        ? `${it.location.zone ? `${it.location.zone}/` : ''}${it.location.name}`
        : '—',
      onHand,
      pendingQty: it.pendingInbound?.quantity ?? 0,
      finishedItemCode,
      finishedItemId: finishedByCode.get(finishedItemCode) ?? null,
    };
  });
}

/** 가공대기 — 모피 보유 > 0 (입고완료 후, 홀가공 미진입 잔량) */
export async function listMopiMachiningWaitRows(): Promise<MopiSkuQueueRow[]> {
  const rows = await listMopiSkuRows();
  return rows.filter((r) => r.onHand > 0);
}

export type MopiHoleWaitRow = {
  orderId: string;
  orderNo: string;
  quantity: number;
  createdAt: Date;
  mopiItemId: string;
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
  materialType: string;
  locationName: string;
  finishedItemId: string;
  finishedItemCode: string;
  finishedItemName: string;
  sourceLotId: string;
  sourceLotQty: number;
};

/**
 * 홀가공대기 — ProcessOrder PROCESSING + DRILLING (가공완료 직후).
 * 모피 재고는 가공완료 시점에 이미 차감됨.
 */
export async function listMopiHoleWaitRows(): Promise<MopiHoleWaitRow[]> {
  const orders = await prisma.processOrder.findMany({
    where: {
      status: ProcessOrderStatus.PROCESSING,
      processStep: ProcessStep.DRILLING,
      sourceLot: {
        item: {
          materialType: MaterialType.SEMI_RAW,
          itemCode: { startsWith: 'M-' },
        },
      },
    },
    include: {
      sourceLot: {
        include: {
          item: {
            include: { location: { select: { name: true, zone: true } } },
          },
        },
      },
      targetItem: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return orders.map((o) => {
    const it = o.sourceLot.item;
    return {
      orderId: o.id,
      orderNo: o.orderNo,
      quantity: o.inputQty,
      createdAt: o.createdAt,
      mopiItemId: it.id,
      itemCode: it.itemCode,
      itemName: it.itemName,
      pressureClass: it.pressureClass,
      size: it.size,
      materialType: it.materialType,
      locationName: it.location
        ? `${it.location.zone ? `${it.location.zone}/` : ''}${it.location.name}`
        : '—',
      finishedItemId: o.targetItemId,
      finishedItemCode: o.targetItem.itemCode,
      finishedItemName: o.targetItem.itemName,
      sourceLotId: o.sourceLotId,
      sourceLotQty: o.sourceLot.quantity,
    };
  });
}
