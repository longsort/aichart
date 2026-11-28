/**
 * 기존 DB에 304를 유지한 채 316 미러 SKU만 추가 (보유 0).
 * VPS: DATABASE_URL=file:./data/wms.db npx tsx prisma/seed-316-mirror.ts
 */
import { PrismaClient, MaterialType } from '@prisma/client';
import {
  buildAllCatalogSeedSkus,
  mirrorCatalogSkuAs316,
} from '../lib/wms/yuil-catalog-size-grid';

if (typeof process.env.DATABASE_URL !== 'string' || !process.env.DATABASE_URL.trim()) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const prisma = new PrismaClient();

async function main() {
  const base = buildAllCatalogSeedSkus();
  const mirrors = base.map(mirrorCatalogSkuAs316);

  let locB = await prisma.location.findFirst({ where: { zone: 'B' } });
  if (!locB) {
    locB = await prisma.location.create({
      data: { name: 'B동-2열', zone: 'B', description: '316 구역' },
    });
  }

  const existing = await prisma.item.findMany({
    where: { itemCode: { in: mirrors.map((m) => m.itemCode) } },
    select: { itemCode: true },
  });
  const have = new Set(existing.map((e) => e.itemCode));
  const missing = mirrors.filter((m) => !have.has(m.itemCode));

  const BATCH = 100;
  let created = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const res = await prisma.item.createMany({
      data: slice.map((g) => ({
        itemCode: g.itemCode,
        itemName: g.itemName,
        materialType: MaterialType.SCS316,
        productType: g.productType,
        standard: g.standard,
        size: g.size,
        pressureClass: g.pressureClass,
        unit: g.unit,
        safetyStock: 0,
        locationId: locB!.id,
        memo: g.memo,
      })),
    });
    created += res.count;
  }

  const n304 = await prisma.item.count({ where: { materialType: MaterialType.SCS304, isActive: true } });
  const n316 = await prisma.item.count({ where: { materialType: MaterialType.SCS316, isActive: true } });
  console.log(
    JSON.stringify(
      {
        mirroredFrom304: base.length,
        alreadyPresent: have.size,
        created,
        activeSCS304: n304,
        activeSCS316: n316,
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
