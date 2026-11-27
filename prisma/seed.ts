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

if (typeof process.env.DATABASE_URL !== 'string' || !process.env.DATABASE_URL.trim()) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const prisma = new PrismaClient();

/** 시드: 데모 품목·LOT·입출고·검사 데이터 */
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
    data: { name: '가공대기', zone: 'S', description: '毛皮 반제품' },
  });

  const i304 = await prisma.item.create({
    data: {
      itemCode: 'F-304-10K-50A',
      itemName: 'KS Flange 10K 50A SCS304',
      materialType: MaterialType.SCS304,
      productType: 'KS Flange',
      standard: 'KS B1503',
      size: '50A',
      pressureClass: '10K',
      unit: 'EA',
      safetyStock: 30,
      locationId: locA.id,
      memo: '양산',
    },
  });
  const i10k15 = await prisma.item.create({
    data: {
      itemCode: 'F-304-10K-15A',
      itemName: 'KS Flange 10K 15A SCS304',
      materialType: MaterialType.SCS304,
      productType: 'KS Flange',
      standard: 'KS B1503',
      size: '15A',
      pressureClass: '10K',
      unit: 'EA',
      safetyStock: 20,
      locationId: locA.id,
      memo: 'filter demo 10K x 15A',
    },
  });
  const i20k15 = await prisma.item.create({
    data: {
      itemCode: 'F-304-20K-15A',
      itemName: 'KS Flange 20K 15A SCS304',
      materialType: MaterialType.SCS304,
      productType: 'KS Flange',
      standard: 'KS B1503',
      size: '15A',
      pressureClass: '20K',
      unit: 'EA',
      safetyStock: 20,
      locationId: locA.id,
      memo: 'filter demo 20K x 15A',
    },
  });
  const i20k50 = await prisma.item.create({
    data: {
      itemCode: 'F-304-20K-50A',
      itemName: 'KS Flange 20K 50A SCS304',
      materialType: MaterialType.SCS304,
      productType: 'KS Flange',
      standard: 'KS B1503',
      size: '50A',
      pressureClass: '20K',
      unit: 'EA',
      safetyStock: 15,
      locationId: locA.id,
    },
  });
  const i316 = await prisma.item.create({
    data: {
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
    },
  });
  const iSemi = await prisma.item.create({
    data: {
      itemCode: 'SEMI-RAW-001',
      itemName: '毛皮 반제품 (대강)',
      materialType: MaterialType.SEMI_RAW,
      productType: '기타',
      standard: '사내',
      size: 'Φ100',
      pressureClass: '기타',
      unit: 'KG',
      safetyStock: 500,
      locationId: locS.id,
    },
  });
  const i304b = await prisma.item.create({
    data: {
      itemCode: 'F-304-5K-32A',
      itemName: 'Welding Neck 5K 32A SCS304',
      materialType: MaterialType.SCS304,
      productType: 'Welding Neck',
      standard: 'JIS',
      size: '32A',
      pressureClass: '5K',
      unit: 'EA',
      safetyStock: 20,
      locationId: locA.id,
    },
  });

  // 유일 카탈로그 칩 데모 (압력등급 행 제품·규격 필터 확인용)
  const iD3578 = await prisma.item.create({
    data: {
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
  });
  const iD3578b = await prisma.item.create({
    data: {
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
  });
  const iDin40 = await prisma.item.create({
    data: {
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
  });
  const iDin40wn = await prisma.item.create({
    data: {
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
  });
  const iDinBlind = await prisma.item.create({
    data: {
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
  });
  const iOil = await prisma.item.create({
    data: {
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
  });
  const iAwwa = await prisma.item.create({
    data: {
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
  });
  const iJesu = await prisma.item.create({
    data: {
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
  });
  const iSafety = await prisma.item.create({
    data: {
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
  });
  const iSsc13 = await prisma.item.create({
    data: {
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
      itemId: i304b.id,
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

  // 안전재고 미달 데모: i304b safety 20, qty 5
  // lotProc already 5

  console.log('Seed 완료: 사용자, 위치, 품목, LOT, 입고이력, 검사, 가공지시, MTC 첨부');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
