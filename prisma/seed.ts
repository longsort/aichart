import {
  PrismaClient,
  MaterialType,
  InventoryLotStatus,
  StockMoveType,
  ProcessOrderStatus,
  ProcessStep,
  QualityCheckType,
  QualityResult,
  AttachmentFileType,
} from '@prisma/client';
import {
  buildCatalogPressureSizeGrid,
  catalogGridSeedCounts,
} from '../lib/wms/yuil-catalog-size-grid';

if (typeof process.env.DATABASE_URL !== 'string' || !process.env.DATABASE_URL.trim()) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const prisma = new PrismaClient();

/** 시드: 카탈로그 압력×사이즈 그리드 + 데모 LOT·입출고·검사 */
async function main() {
  await prisma.attachment.deleteMany();
  await prisma.qualityCheck.deleteMany();
  await prisma.stockMove.deleteMany();
  await prisma.processOrder.deleteMany();
  await prisma.inventoryLot.deleteMany();
  await prisma.item.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();

  const u1 = await prisma.user.create({
    data: { name: '김재고', email: 'kim@example.com', role: 'ADMIN' },
  });
  await prisma.user.create({
    data: { name: '이검사', email: 'lee@example.com', role: 'INSPECTOR' },
  });

  const locA = await prisma.location.create({
    data: { name: 'A동-1열', zone: 'A', description: '304 구역' },
  });
  const locB = await prisma.location.create({
    data: { name: 'B동-2열', zone: 'B', description: '316 구역' },
  });
  const locS = await prisma.location.create({
    data: { name: '가공대기', zone: 'S', description: '소재 반제품' },
  });

  const grid = buildCatalogPressureSizeGrid();
  const counts = catalogGridSeedCounts();

  // 압력등급 × 사이즈 전체 자동 등록 (보유 0 — 입고 원장으로만 수량 증가)
  const BATCH = 100;
  for (let i = 0; i < grid.length; i += BATCH) {
    const slice = grid.slice(i, i + BATCH);
    await prisma.item.createMany({
      data: slice.map((g) => ({
        itemCode: g.itemCode,
        itemName: g.itemName,
        materialType: MaterialType.SCS304,
        productType: g.productType,
        standard: g.standard,
        size: g.size,
        pressureClass: g.pressureClass,
        unit: g.unit,
        safetyStock: g.safetyStock,
        locationId: locA.id,
        memo: g.memo,
      })),
    });
  }

  // 그리드 밖 제품군 데모 (카탈로그 제품 칩 필터용) — itemCode 충돌 없음
  const extras = await Promise.all(
    [
      {
        itemCode: 'F-316-ANSI150-2B',
        itemName: 'ANSI Flange 150# 2B SCS316',
        materialType: MaterialType.SCS316,
        productType: 'ANSI Flange',
        standard: 'ANSI B16.5',
        size: '2B',
        pressureClass: 'ANSI150',
        unit: 'EA',
        safetyStock: 12,
        locationId: locB.id,
        memo: 'inch demo',
      },
      {
        itemCode: 'SEMI-RAW-001',
        itemName: '소재 반제품 (대강)',
        materialType: MaterialType.SEMI_RAW,
        productType: '기타',
        standard: '사내',
        size: 'Φ100',
        pressureClass: '기타',
        unit: 'KG',
        safetyStock: 500,
        locationId: locS.id,
        memo: 'process demo',
      },
      {
        itemCode: 'F-WN-5K-32A',
        itemName: 'Welding Neck 5K 32A SCS304',
        materialType: MaterialType.SCS304,
        productType: 'Welding Neck',
        standard: 'JIS',
        size: '32A',
        pressureClass: '5K',
        unit: 'EA',
        safetyStock: 20,
        locationId: locA.id,
        memo: 'WN demo (grid keeps F-304-5K-32A)',
      },
      {
        itemCode: 'F-3578-10KG-100A',
        itemName: '수도용 도복장 강관 이형관용(KS D 3578-1997)플랜지 10kg 100A',
        materialType: MaterialType.SCS304,
        productType: '수도용 도복장',
        standard: 'KS D 3578-1997',
        size: '100A',
        pressureClass: '10kg/cm²',
        unit: 'EA',
        safetyStock: 10,
        locationId: locA.id,
        memo: 'catalog p.55',
      },
      {
        itemCode: 'F-3578-16KG-150A',
        itemName: '수도용 도복장 강관 이형관용(KS D 3578-1997)플랜지 16kg 150A',
        materialType: MaterialType.SCS304,
        productType: '수도용 도복장',
        standard: 'KS D 3578-1997',
        size: '150A',
        pressureClass: '16kg/cm²',
        unit: 'EA',
        safetyStock: 8,
        locationId: locA.id,
        memo: 'catalog p.55',
      },
      {
        itemCode: 'F-DIN2545-40BAR-50A',
        itemName: '40BAR DIN 2545 SLIP-ON 50A',
        materialType: MaterialType.SCS304,
        productType: 'DIN Flange',
        standard: 'DIN 2545',
        size: '50A',
        pressureClass: '40BAR',
        unit: 'EA',
        safetyStock: 12,
        locationId: locA.id,
        memo: 'catalog p.51',
      },
      {
        itemCode: 'F-DIN2635-40BAR-50A',
        itemName: '40BAR DIN 2635 WELDING NECK 50A',
        materialType: MaterialType.SCS316,
        productType: 'DIN Flange',
        standard: 'DIN 2635',
        size: '50A',
        pressureClass: '40BAR',
        unit: 'EA',
        safetyStock: 10,
        locationId: locB.id,
        memo: 'catalog p.51',
      },
      {
        itemCode: 'F-DIN2527-40BAR-50A',
        itemName: '40BAR DIN 2527 BLIND 50A',
        materialType: MaterialType.SCS304,
        productType: 'DIN Flange',
        standard: 'DIN 2527',
        size: '50A',
        pressureClass: '40BAR',
        unit: 'EA',
        safetyStock: 10,
        locationId: locA.id,
        memo: 'catalog p.51',
      },
      {
        itemCode: 'F-OIL-210-25A',
        itemName: '210kgf/cm² Oil Pressure SHA 25A',
        materialType: MaterialType.SCS304,
        productType: 'Oil Pressure',
        standard: 'JIS B2291-1907',
        size: '25A',
        pressureClass: '210kgf/cm²',
        unit: 'EA',
        safetyStock: 6,
        locationId: locA.id,
        memo: 'catalog p.35',
      },
      {
        itemCode: 'F-AWWA-C207-B-100A',
        itemName: 'AWWA C207 Class B Slip-on 100A',
        materialType: MaterialType.SCS304,
        productType: 'AWWA Flange',
        standard: 'AWWA C207',
        size: '100A',
        pressureClass: 'AWWA-B',
        unit: 'EA',
        safetyStock: 5,
        locationId: locA.id,
        memo: 'catalog p.44',
      },
      {
        itemCode: 'F-JESU-4308-200A',
        itemName: '제수변 KSD 4308 200A',
        materialType: MaterialType.SCS304,
        productType: '제수변 Flange',
        standard: 'KSD 4308',
        size: '200A',
        pressureClass: 'JESU-KSD4308',
        unit: 'EA',
        safetyStock: 4,
        locationId: locA.id,
        memo: 'catalog p.52',
      },
      {
        itemCode: 'F-SAFE-6216-10K-50A',
        itemName: '스프링 안전밸브 설치 플랜지 KS B 6216 10K 50A',
        materialType: MaterialType.SCS304,
        productType: '안전변 Flange',
        standard: 'KS B 6216-1998',
        size: '50A',
        pressureClass: '10K',
        unit: 'EA',
        safetyStock: 8,
        locationId: locA.id,
        memo: 'catalog p.56',
      },
      {
        itemCode: 'F-SSC13-ACF-80A',
        itemName: 'SSC13 ACF 원심주조플랜지 80A',
        materialType: MaterialType.SCS304,
        productType: 'SSC13 ACF',
        standard: 'SSC13 ACF',
        size: '80A',
        pressureClass: 'SSC13-ACF',
        unit: 'EA',
        safetyStock: 5,
        locationId: locA.id,
        memo: 'catalog p.6',
      },
    ].map((data) => prisma.item.create({ data })),
  );

  const byCode = async (code: string) => {
    const it = await prisma.item.findUnique({ where: { itemCode: code } });
    if (!it) throw new Error(`seed missing item ${code}`);
    return it;
  };

  const i304 = await byCode('F-304-10K-50A');
  const i10k15 = await byCode('F-304-10K-15A');
  const i20k15 = await byCode('F-304-20K-15A');
  const i20k50 = await byCode('F-304-20K-50A');
  const i316 = extras.find((e) => e.itemCode === 'F-316-ANSI150-2B')!;
  const iSemi = extras.find((e) => e.itemCode === 'SEMI-RAW-001')!;
  const iWn = extras.find((e) => e.itemCode === 'F-WN-5K-32A')!;
  const iD3578 = extras.find((e) => e.itemCode === 'F-3578-10KG-100A')!;
  const iD3578b = extras.find((e) => e.itemCode === 'F-3578-16KG-150A')!;
  const iDin40 = extras.find((e) => e.itemCode === 'F-DIN2545-40BAR-50A')!;
  const iDin40wn = extras.find((e) => e.itemCode === 'F-DIN2635-40BAR-50A')!;
  const iDinBlind = extras.find((e) => e.itemCode === 'F-DIN2527-40BAR-50A')!;
  const iOil = extras.find((e) => e.itemCode === 'F-OIL-210-25A')!;
  const iAwwa = extras.find((e) => e.itemCode === 'F-AWWA-C207-B-100A')!;
  const iJesu = extras.find((e) => e.itemCode === 'F-JESU-4308-200A')!;
  const iSafety = extras.find((e) => e.itemCode === 'F-SAFE-6216-10K-50A')!;
  const iSsc13 = extras.find((e) => e.itemCode === 'F-SSC13-ACF-80A')!;

  // 데모 재고가 있는 SKU만 safetyStock 보정
  await prisma.item.update({
    where: { id: i304.id },
    data: { safetyStock: 30, memo: '양산 demo stock' },
  });
  await prisma.item.update({
    where: { id: i10k15.id },
    data: { safetyStock: 20, memo: 'filter demo 10K x 15A' },
  });
  await prisma.item.update({
    where: { id: i20k15.id },
    data: { safetyStock: 20, memo: 'filter demo 20K x 15A' },
  });
  await prisma.item.update({
    where: { id: i20k50.id },
    data: { safetyStock: 15 },
  });

  const lot1 = await prisma.inventoryLot.create({
    data: {
      itemId: i304.id,
      lotNo: 'L-2401',
      heatNo: 'H88321',
      quantity: 45,
      status: InventoryLotStatus.NORMAL,
      receivedDate: new Date('2024-12-01'),
      locationId: locA.id,
    },
  });
  const lot10k15 = await prisma.inventoryLot.create({
    data: {
      itemId: i10k15.id,
      lotNo: 'OPEN',
      heatNo: '',
      quantity: 120,
      status: InventoryLotStatus.NORMAL,
      receivedDate: new Date('2025-03-01'),
      locationId: locA.id,
    },
  });
  const lot20k15 = await prisma.inventoryLot.create({
    data: {
      itemId: i20k15.id,
      lotNo: 'OPEN',
      heatNo: '',
      quantity: 80,
      status: InventoryLotStatus.NORMAL,
      receivedDate: new Date('2025-03-01'),
      locationId: locA.id,
    },
  });
  const lot20k50 = await prisma.inventoryLot.create({
    data: {
      itemId: i20k50.id,
      lotNo: 'OPEN',
      heatNo: '',
      quantity: 40,
      status: InventoryLotStatus.NORMAL,
      receivedDate: new Date('2025-03-01'),
      locationId: locA.id,
    },
  });
  const lot2 = await prisma.inventoryLot.create({
    data: {
      itemId: i316.id,
      lotNo: 'L-2402',
      heatNo: 'H99210',
      quantity: 8,
      status: InventoryLotStatus.WAIT_INSPECTION,
      receivedDate: new Date('2025-01-10'),
      locationId: locB.id,
    },
  });
  const lotSemi = await prisma.inventoryLot.create({
    data: {
      itemId: iSemi.id,
      lotNo: 'S-8899',
      heatNo: 'H-SEMI-01',
      quantity: 1200,
      status: InventoryLotStatus.NORMAL,
      receivedDate: new Date('2025-02-01'),
      locationId: locS.id,
    },
  });
  const lotProc = await prisma.inventoryLot.create({
    data: {
      itemId: iWn.id,
      lotNo: 'L-LOW',
      heatNo: 'H00001',
      quantity: 5,
      status: InventoryLotStatus.PROCESSING,
      receivedDate: new Date('2025-03-01'),
      locationId: locA.id,
    },
  });

  const catalogLots = await Promise.all(
    [
      { item: iD3578, qty: 35, loc: locA },
      { item: iD3578b, qty: 22, loc: locA },
      { item: iDin40, qty: 18, loc: locA },
      { item: iDin40wn, qty: 14, loc: locB },
      { item: iDinBlind, qty: 11, loc: locA },
      { item: iOil, qty: 9, loc: locA },
      { item: iAwwa, qty: 7, loc: locA },
      { item: iJesu, qty: 6, loc: locA },
      { item: iSafety, qty: 15, loc: locA },
      { item: iSsc13, qty: 4, loc: locA },
    ].map(({ item, qty, loc }, idx) =>
      prisma.inventoryLot.create({
        data: {
          itemId: item.id,
          lotNo: `CAT-${idx + 1}`,
          heatNo: '',
          quantity: qty,
          status: InventoryLotStatus.NORMAL,
          receivedDate: new Date('2025-06-01'),
          locationId: loc.id,
        },
      }),
    ),
  );

  await prisma.stockMove.createMany({
    data: [
      {
        itemId: i304.id,
        lotId: lot1.id,
        moveType: StockMoveType.IN,
        quantity: 45,
        beforeQty: 0,
        afterQty: 45,
        toLocationId: locA.id,
        vendorName: '대한금속',
        documentNo: 'PO-2024-001',
        reason: '입고',
        createdBy: u1.id,
      },
      {
        itemId: i10k15.id,
        lotId: lot10k15.id,
        moveType: StockMoveType.IN,
        quantity: 120,
        beforeQty: 0,
        afterQty: 120,
        toLocationId: locA.id,
        reason: 'IN',
        createdBy: u1.id,
      },
      {
        itemId: i20k15.id,
        lotId: lot20k15.id,
        moveType: StockMoveType.IN,
        quantity: 80,
        beforeQty: 0,
        afterQty: 80,
        toLocationId: locA.id,
        reason: 'IN',
        createdBy: u1.id,
      },
      {
        itemId: i20k50.id,
        lotId: lot20k50.id,
        moveType: StockMoveType.IN,
        quantity: 40,
        beforeQty: 0,
        afterQty: 40,
        toLocationId: locA.id,
        reason: 'IN',
        createdBy: u1.id,
      },
      {
        itemId: i316.id,
        lotId: lot2.id,
        moveType: StockMoveType.IN,
        quantity: 8,
        beforeQty: 0,
        afterQty: 8,
        toLocationId: locB.id,
        vendorName: '삼영스텐',
        reason: '입고',
        createdBy: u1.id,
      },
      {
        itemId: iWn.id,
        lotId: lotProc.id,
        moveType: StockMoveType.IN,
        quantity: 5,
        beforeQty: 0,
        afterQty: 5,
        toLocationId: locA.id,
        reason: 'IN',
        createdBy: u1.id,
      },
      ...[
        { item: iD3578, lot: catalogLots[0], qty: 35, loc: locA },
        { item: iD3578b, lot: catalogLots[1], qty: 22, loc: locA },
        { item: iDin40, lot: catalogLots[2], qty: 18, loc: locA },
        { item: iDin40wn, lot: catalogLots[3], qty: 14, loc: locB },
        { item: iDinBlind, lot: catalogLots[4], qty: 11, loc: locA },
        { item: iOil, lot: catalogLots[5], qty: 9, loc: locA },
        { item: iAwwa, lot: catalogLots[6], qty: 7, loc: locA },
        { item: iJesu, lot: catalogLots[7], qty: 6, loc: locA },
        { item: iSafety, lot: catalogLots[8], qty: 15, loc: locA },
        { item: iSsc13, lot: catalogLots[9], qty: 4, loc: locA },
      ].map(({ item, lot, qty, loc }) => ({
        itemId: item.id,
        lotId: lot.id,
        moveType: StockMoveType.IN,
        quantity: qty,
        beforeQty: 0,
        afterQty: qty,
        toLocationId: loc.id,
        reason: 'CATALOG_SEED',
        createdBy: u1.id,
      })),
    ],
  });

  await prisma.qualityCheck.create({
    data: {
      lotId: lot2.id,
      checkType: QualityCheckType.DIMENSION,
      result: QualityResult.HOLD,
      inspector: '이검사',
      memo: '치수 재확인',
    },
  });

  await prisma.processOrder.create({
    data: {
      orderNo: 'PO-20250514-DEMO',
      sourceLotId: lotSemi.id,
      targetItemId: i304.id,
      inputQty: 100,
      status: ProcessOrderStatus.READY,
      processStep: ProcessStep.RAW,
      memo: '데모 가공지시',
    },
  });

  await prisma.attachment.create({
    data: {
      lotId: lot1.id,
      fileName: 'MTC-L2401.pdf',
      fileUrl: 'https://mock-storage.local/mtc/MTC-L2401.pdf',
      fileType: AttachmentFileType.MTC,
    },
  });

  const totalItems = await prisma.item.count();
  const tenK = await prisma.item.count({ where: { pressureClass: '10K' } });
  console.log(
    `Seed 완료: grid ${counts.pressures} pressures × ${counts.sizes} sizes = ${counts.skus} SKUs; extras ${extras.length}; total items ${totalItems}; 10K rows ${tenK}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
