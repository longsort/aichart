import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { StockInForm } from '@/components/wms/forms/stock-in-form';

/** 입고 등록 */
export default async function StockInPage() {
  const [items, locations] = await Promise.all([
    prisma.item.findMany({ where: { isActive: true }, orderBy: { itemCode: 'asc' }, select: { id: true, itemCode: true, itemName: true } }),
    prisma.location.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <WmsPageHeader title="입고 관리" subtitle="품목·LOT·Heat·창고 · 동일 LOT는 수량 가산" />
      <WmsCard>
        <StockInForm items={items} locations={locations} />
      </WmsCard>
    </>
  );
}
