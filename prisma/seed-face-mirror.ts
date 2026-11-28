/**
 * FACE(SOFF/SORF/BLFF/BLRF) × 압력 × 사이즈 가산 시드.
 * 기존 304/316/모피(FACE 없는 행) 유지. 보유 0.
 * VPS: DATABASE_URL=file:./data/wms.db npx tsx prisma/seed-face-mirror.ts
 */
import { PrismaClient, MaterialType } from '@prisma/client';
import {
  buildCatalogFacePressureSizeGrid,
  catalogFaceGridSeedCounts,
  mirrorCatalogSkuAs316,
  mirrorCatalogSkuAsMopi,
} from '../lib/wms/yuil-catalog-size-grid';
import { FLANGE_FACE_TYPES } from '../lib/wms/flange-face';

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
  return { alreadyPresent: have.size, created, planned: rows.length };
}

async function main() {
  const base = buildCatalogFacePressureSizeGrid();
  const grid316 = base.map(mirrorCatalogSkuAs316);
  const gridMopi = base.map(mirrorCatalogSkuAsMopi);
  const counts = catalogFaceGridSeedCounts();

  const locA = await ensureLoc('A', 'A동-1열', '304 구역');
  const locB = await ensureLoc('B', 'B동-2열', '316 구역');
  const locS = await ensureLoc('S', '가공대기', '모피·소재 반제품');

  const r304 = await createMissing(
    base.map((g) => ({
      itemCode: g.itemCode,
      itemName: g.itemName,
      materialType: MaterialType.SCS304,
      productType: g.productType,
      standard: g.standard,
      size: g.size,
      pressureClass: g.pressureClass,
      unit: g.unit,
      safetyStock: 0,
      locationId: locA.id,
      memo: g.memo,
    })),
  );

  const r316 = await createMissing(
    grid316.map((g) => ({
      itemCode: g.itemCode,
      itemName: g.itemName,
      materialType: MaterialType.SCS316,
      productType: g.productType,
      standard: g.standard,
      size: g.size,
      pressureClass: g.pressureClass,
      unit: g.unit,
      safetyStock: 0,
      locationId: locB.id,
      memo: g.memo,
    })),
  );

  const rMopi = await createMissing(
    gridMopi.map((g) => ({
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

  const byFace: Record<string, { scs304: number; scs316: number; mopi: number }> = {};
  for (const face of FLANGE_FACE_TYPES) {
    const scs304 = await prisma.item.count({
      where: { isActive: true, materialType: MaterialType.SCS304, itemCode: { contains: `-${face}-` } },
    });
    const scs316 = await prisma.item.count({
      where: { isActive: true, materialType: MaterialType.SCS316, itemCode: { contains: `-${face}-` } },
    });
    const mopi = await prisma.item.count({
      where: {
        isActive: true,
        materialType: MaterialType.SEMI_RAW,
        itemCode: { startsWith: 'M-', contains: `-${face}-` },
      },
    });
    byFace[face] = { scs304, scs316, mopi };
  }

  console.log(
    JSON.stringify(
      {
        faceGrid: counts,
        created304: r304.created,
        created316: r316.created,
        createdMopi: rMopi.created,
        already304: r304.alreadyPresent,
        already316: r316.alreadyPresent,
        alreadyMopi: rMopi.alreadyPresent,
        byFace,
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
