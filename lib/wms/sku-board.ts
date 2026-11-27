import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  CATALOG_PRESSURE_CHIP_KEYS,
  NOMINAL_SIZES,
  compareNominalSize,
} from '@/lib/wms/codes';
import {
  catalogPressureChipLabel,
  itemMatchesCatalogPressure,
} from '@/lib/wms/yuil-catalog-filters';

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

  // 사이즈·검색만 Prisma where — 압력/카탈로그 칩은 별칭·제품명 OR 매칭
  if (size && size !== 'ALL') where.size = size;
  if (q) {
    where.OR = [
      { itemCode: { contains: q } },
      { itemName: { contains: q } },
      { standard: { contains: q } },
      { productType: { contains: q } },
      { pressureClass: { contains: q } },
    ];
  }

  // DB string orderBy size는 1000A < 15A 가 됨 → 메모리에서 숫자 호칭 정렬
  const items = await prisma.item.findMany({
    where,
    include: {
      location: { select: { name: true, zone: true } },
      lots: { select: { quantity: true } },
    },
    orderBy: [{ pressureClass: 'asc' }, { itemCode: 'asc' }],
  });

  const matched = items.filter((it) =>
    itemMatchesCatalogPressure(
      {
        pressureClass: it.pressureClass,
        productType: it.productType,
        standard: it.standard,
        itemName: it.itemName,
        itemCode: it.itemCode,
      },
      pressure,
    ),
  );

  const rows: SkuBoardRow[] = matched
    .map((it) => ({
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
    }))
    .sort((a, b) => {
      const bySize = compareNominalSize(a.size, b.size);
      if (bySize !== 0) return bySize;
      const byPc = a.pressureClass.localeCompare(b.pressureClass, 'ko');
      if (byPc !== 0) return byPc;
      return a.itemCode.localeCompare(b.itemCode, 'ko');
    });

  const filteredTotal = rows.reduce((s, r) => s + r.onHand, 0);

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

/** 칩에 쓸 압력·사이즈 옵션 (카탈로그 전체 + DB에만 있는 값) */
export async function getSkuFilterOptions() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    select: { pressureClass: true, size: true },
  });

  // 카탈로그 칩 키를 항상 앞에 유지 (정렬로 뒤섞지 않음)
  const pressureSeen = new Set<string>(CATALOG_PRESSURE_CHIP_KEYS);
  const pressures: string[] = [...CATALOG_PRESSURE_CHIP_KEYS];
  for (const it of items) {
    const pc = (it.pressureClass || '').trim();
    if (pc && !pressureSeen.has(pc)) {
      pressureSeen.add(pc);
      pressures.push(pc);
    }
  }

  const sizes = new Set<string>(NOMINAL_SIZES);
  for (const it of items) {
    if (it.size) sizes.add(it.size);
  }

  return {
    pressures,
    pressureLabels: Object.fromEntries(pressures.map((k) => [k, catalogPressureChipLabel(k)])),
    sizes: [...sizes].sort(compareNominalSize),
  };
}
