import { prisma } from '@/lib/prisma';
import type { MaterialType, InventoryLotStatus, StockMoveType } from '@prisma/client';

/** 재질별 LOT 수량 합계 */
export async function sumQtyByMaterial() {
  const lots = await prisma.inventoryLot.findMany({
    where: { item: { isActive: true } },
    select: { quantity: true, item: { select: { materialType: true } } },
  });
  let scs304 = 0;
  let scs316 = 0;
  let semiRaw = 0;
  for (const l of lots) {
    const q = l.quantity;
    if (l.item.materialType === 'SCS304') scs304 += q;
    else if (l.item.materialType === 'SCS316') scs316 += q;
    else semiRaw += q;
  }
  return { scs304, scs316, semiRaw, total: scs304 + scs316 + semiRaw };
}

/** 품목별 총재고 < 안전재고 */
export async function getLowStockItems() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: {
      lots: { select: { quantity: true } },
    },
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

export async function countLotsByStatus(status: InventoryLotStatus) {
  return prisma.inventoryLot.count({ where: { status } });
}

export async function getRecentMoves(limit = 10) {
  return prisma.stockMove.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      item: { select: { itemCode: true, itemName: true, materialType: true } },
      lot: { select: { lotNo: true, heatNo: true } },
    },
  });
}

export function moveTypeLabel(t: StockMoveType): string {
  const map: Record<StockMoveType, string> = {
    IN: '입고',
    OUT: '출고',
    ADJUST: '조정',
    PROCESS_IN: '가공투입',
    PROCESS_OUT: '가공산출',
    TRANSFER: '이동',
  };
  return map[t] ?? t;
}
