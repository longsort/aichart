import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { StockOutForm } from '@/components/wms/forms/stock-out-form';
import { InventoryLotStatus } from '@prisma/client';

/** LOT 단위 출고(상세) — 간단 출고는 /dashboard 행 버튼 */
export default async function StockOutPage() {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      quantity: { gt: 0 },
      status: { notIn: [InventoryLotStatus.SHIPPED, InventoryLotStatus.DEFECT] },
      item: { isActive: true },
    },
    include: { item: { select: { itemCode: true, itemName: true } } },
    orderBy: [{ item: { itemCode: 'asc' } }, { lotNo: 'asc' }],
  });

  return (
    <>
      <WmsPageHeader title="출고 관리" subtitle="LOT 선택 · 거래처 · StockMove(OUT) 기록" />
      <WmsCard>
        <StockOutForm lots={lots} />
      </WmsCard>
    </>
  );
}
