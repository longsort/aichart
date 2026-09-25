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
