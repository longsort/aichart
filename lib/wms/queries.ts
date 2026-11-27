import { prisma } from '@/lib/prisma';
import { InventoryLotStatus, MaterialType } from '@prisma/client';

/** 가공 투입용 — 수량 있는 단조 반제품(SEMI_RAW) LOT */
export async function getSemiRawLots() {
  return prisma.inventoryLot.findMany({
    where: {
      quantity: { gt: 0 },
      status: { notIn: [InventoryLotStatus.SHIPPED, InventoryLotStatus.DEFECT] },
      item: { isActive: true, materialType: MaterialType.SEMI_RAW },
    },
    include: {
      item: { select: { itemCode: true, itemName: true, materialType: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

/** 가공 산출 대상 — 활성 완제품(SCS304/SCS316) 품목 */
export async function getFinishedProductItems() {
  return prisma.item.findMany({
    where: {
      isActive: true,
      materialType: { in: [MaterialType.SCS304, MaterialType.SCS316] },
    },
    orderBy: { itemCode: 'asc' },
  });
}

/** 안전재고 미달 품목 (LOT 수량 합 < safetyStock) */
export async function getBelowSafetyItems() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: { lots: { select: { quantity: true } } },
  });
  return items
    .map((i) => ({
      id: i.id,
      itemCode: i.itemCode,
      itemName: i.itemName,
      materialType: i.materialType,
      safetyStock: i.safetyStock,
      totalQty: i.lots.reduce((s, l) => s + l.quantity, 0),
    }))
    .filter((i) => i.totalQty < i.safetyStock)
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode));
}
