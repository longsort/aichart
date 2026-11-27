import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { StockOutForm } from '@/components/wms/forms/stock-out-form';

/** 출고 — LOT 선택 후 수량 차감 */
export default async function StockOutPage() {
  const lots = await prisma.inventoryLot.findMany({
    where: { quantity: { gt: 0 } },
    include: { item: { select: { itemCode: true, itemName: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  return (
    <>
      <WmsPageHeader title="출고 관리" subtitle="LOT·수량·거래처 · 부족 시 오류" />
      <WmsCard>
        <StockOutForm lots={lots} />
      </WmsCard>
    </>
  );
}
