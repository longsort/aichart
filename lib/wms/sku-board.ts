import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { PRESSURE_CLASSES, NOMINAL_SIZES } from '@/lib/wms/codes';

export type SkuBoardFilters = {
  pressureClass?: string;
  size?: string;
  q?: string;
};

export type SkuBoardRow = {
  id: string;
  itemCode: string;
  itemName: string;
  materialType: string;
  productType: string;
  pressureClass: string;
  size: string;
  unit: string;
  safetyStock: number;
  onHand: number;
  locationName: string;
};

/** 압력·사이즈 칩 + 검색으로 SKU 목록 + 보유수량 */
export async function listSkuBoard(filters: SkuBoardFilters = {}) {
  const where: Prisma.ItemWhereInput = { isActive: true };
  const pressure = (filters.pressureClass || '').trim();
  const size = (filters.size || '').trim();
  const q = (filters.q || '').trim();

  if (pressure && pressure !== 'ALL') where.pressureClass = pressure;
  if (size && size !== 'ALL') where.size = size;
  if (q) {
    where.OR = [
      { itemCode: { contains: q } },
      { itemName: { contains: q } },
      { standard: { contains: q } },
    ];
  }

  const items = await prisma.item.findMany({
    where,
    include: {
      location: { select: { name: true, zone: true } },
      lots: { select: { quantity: true } },
    },
    orderBy: [{ pressureClass: 'asc' }, { size: 'asc' }, { itemCode: 'asc' }],
  });

  const rows: SkuBoardRow[] = items.map((it) => ({
    id: it.id,
    itemCode: it.itemCode,
    itemName: it.itemName,
    materialType: it.materialType,
    productType: it.productType,
    pressureClass: it.pressureClass,
    size: it.size,
    unit: it.unit,
    safetyStock: it.safetyStock,
    onHand: it.lots.reduce((s, l) => s + l.quantity, 0),
    locationName: it.location
      ? `${it.location.zone ? `${it.location.zone}/` : ''}${it.location.name}`
      : '—',
  }));

  const filteredTotal = rows.reduce((s, r) => s + r.onHand, 0);

  // 전체 총재고(필터 무시) — 상단 「전체 재고」용
  const allLots = await prisma.inventoryLot.findMany({
    where: { item: { isActive: true } },
    select: { quantity: true },
  });
  const overallTotal = allLots.reduce((s, l) => s + l.quantity, 0);

  return {
    rows,
    filteredTotal,
    overallTotal,
    skuCount: rows.length,
  };
}

/** 칩에 쓸 압력·사이즈 옵션 (기초코드 + DB에만 있는 값) */
export async function getSkuFilterOptions() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    select: { pressureClass: true, size: true },
  });
  const pressures = new Set<string>(PRESSURE_CLASSES);
  const sizes = new Set<string>(NOMINAL_SIZES);
  for (const it of items) {
    if (it.pressureClass) pressures.add(it.pressureClass);
    if (it.size) sizes.add(it.size);
  }
  return {
    pressures: [...pressures].sort((a, b) => a.localeCompare(b, 'ko')),
    sizes: [...sizes].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b, 'ko');
    }),
  };
}
