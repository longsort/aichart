/**
 * 누락 카탈로그 SKU 가산 시드 (기존 행 유지).
 * Class150/Class300 + 전체 압력×사이즈×FACE×304/316/모피.
 *
 * VPS: DATABASE_URL=file:./data/wms.db npx tsx prisma/seed-class-catalog.ts
 */
import { PrismaClient, MaterialType } from '@prisma/client';
import {
  buildAllCatalogSeedSkus,
  buildCatalogFacePressureSizeGrid,
  catalogFaceGridSeedCounts,
  catalogGridSeedCounts,
  mirrorCatalogSkuAs316,
  mirrorCatalogSkuAsMopi,
  type CatalogGridSku,
} from '../lib/wms/yuil-catalog-size-grid';
import { matchesSkuQuickSearch } from '../lib/wms/sku-quick-search';

if (typeof process.env.DATABASE_URL !== 'string' || !process.env.DATABASE_URL.trim()) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const prisma = new PrismaClient();

async function ensureLoc(zone: string, name: string, description: string) {
  let loc = await prisma.location.findFirst({ where: { zone } });
  if (!loc) {
    loc = await prisma.location.create({ data: { name, zone, description } });
  }
  return loc;
}

async function createMissing(
  rows: Array<{
    itemCode: string;
    itemName: string;
    materialType: MaterialType;
    productType: string;
    standard: string;
    size: string;
    pressureClass: string;
    unit: string;
    safetyStock: number;
    locationId: string;
    memo: string;
  }>,
) {
  const existing = await prisma.item.findMany({
    where: { itemCode: { in: rows.map((r) => r.itemCode) } },
    select: { itemCode: true },
  });
  const have = new Set(existing.map((e) => e.itemCode));
  const missing = rows.filter((r) => !have.has(r.itemCode));
  const BATCH = 100;
  let created = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const res = await prisma.item.createMany({ data: slice });
    created += res.count;
  }
  return { planned: rows.length, alreadyPresent: have.size, created, missingPlanned: missing.length };
}

function toRows(
  skus: CatalogGridSku[],
  materialType: MaterialType,
  locationId: string,
) {
  return skus.map((g) => ({
    itemCode: g.itemCode,
    itemName: g.itemName,
    materialType,
    productType: g.productType,
    standard: g.standard,
    size: g.size,
    pressureClass: g.pressureClass,
    unit: g.unit,
    safetyStock: 0,
    locationId,
    memo: g.memo,
  }));
}

async function main() {
  const ratingProduct = buildAllCatalogSeedSkus();
  const face = buildCatalogFacePressureSizeGrid();
  // 합집합 (itemCode 기준) — rating/product + face
  const seen = new Set<string>();
  const base304: CatalogGridSku[] = [];
  for (const g of [...ratingProduct, ...face]) {
    if (seen.has(g.itemCode)) continue;
    seen.add(g.itemCode);
    base304.push(g);
  }
  const base316 = base304.map(mirrorCatalogSkuAs316);
  const baseMopi = base304.map(mirrorCatalogSkuAsMopi);

  const locA = await ensureLoc('A', 'A동-1열', '304 구역');
  const locB = await ensureLoc('B', 'B동-2열', '316 구역');
  const locS = await ensureLoc('S', '가공대기', '모피·소재 반제품');

  const r304 = await createMissing(toRows(base304, MaterialType.SCS304, locA.id));
  const r316 = await createMissing(toRows(base316, MaterialType.SCS316, locB.id));
  const rMopi = await createMissing(
    baseMopi.map((g) => ({
      itemCode: g.itemCode,
      itemName: g.itemName,
      materialType: MaterialType.SEMI_RAW,
      productType: g.productType,
      standard: g.standard,
      size: g.size,
      pressureClass: g.pressureClass,
      unit: g.unit,
      safetyStock: 0,
      locationId: locS.id,
      memo: g.memo,
    })),
  );

  const class150 = await prisma.item.count({
    where: { isActive: true, pressureClass: 'Class150' },
  });
  const class300 = await prisma.item.count({
    where: { isActive: true, pressureClass: 'Class300' },
  });
  const ansi150 = await prisma.item.count({
    where: { isActive: true, pressureClass: 'ANSI150' },
  });
  const n304 = await prisma.item.count({ where: { isActive: true, materialType: MaterialType.SCS304 } });
  const n316 = await prisma.item.count({ where: { isActive: true, materialType: MaterialType.SCS316 } });
  const nMopi = await prisma.item.count({
    where: { isActive: true, materialType: MaterialType.SEMI_RAW, itemCode: { startsWith: 'M-' } },
  });
  const total = await prisma.item.count({ where: { isActive: true } });

  // verify 100a150# finds Class rows (and not only ANSI)
  const sample = await prisma.item.findMany({
    where: { isActive: true, size: '100A', pressureClass: { in: ['Class150', 'ANSI150'] } },
    select: { itemCode: true, itemName: true, pressureClass: true, size: true, materialType: true },
    take: 200,
  });
  const hitClass = sample.filter((r) =>
    matchesSkuQuickSearch(
      {
        pressureClass: r.pressureClass,
        size: r.size,
        itemCode: r.itemCode,
        itemName: r.itemName,
      },
      '100a150#',
    ),
  );
  const classHits = hitClass.filter((r) => r.pressureClass === 'Class150').length;
  const ansiHits = hitClass.filter((r) => r.pressureClass === 'ANSI150').length;

  console.log(
    JSON.stringify(
      {
        grid: catalogGridSeedCounts(),
        faceGrid: catalogFaceGridSeedCounts(),
        planned304: base304.length,
        created304: r304.created,
        created316: r316.created,
        createdMopi: rMopi.created,
        already304: r304.alreadyPresent,
        already316: r316.alreadyPresent,
        alreadyMopi: rMopi.alreadyPresent,
        active: { total, scs304: n304, scs316: n316, mopi: nMopi, class150, class300, ansi150 },
        verify100a150hash: {
          classHits,
          ansiHits,
          sampleChecked: sample.length,
          ok: classHits > 0 && ansiHits === 0,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
