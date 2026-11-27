import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { moveTypeLabel } from '@/lib/wms/inventory-stats';
import { MaterialBadge } from '@/components/wms/material-badge';

/** 전체 재고 이동 이력 */
export default async function MovesPage() {
  const moves = await prisma.stockMove.findMany({
    take: 200,
    orderBy: { createdAt: 'desc' },
    include: {
      item: true,
      lot: true,
      fromLocation: true,
      toLocation: true,
    },
  });

  return (
    <>
      <WmsPageHeader title="재고 이동 이력" subtitle="입고·출고·가공·조정 (최근 200건)" />
      <WmsCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
                <th className="p-2">일시</th>
                <th className="p-2">유형</th>
                <th className="p-2">품목</th>
                <th className="p-2">LOT</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2">전→후</th>
                <th className="p-2">거래처/비고</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
                  <td className="p-2 whitespace-nowrap text-slate-400">{new Date(m.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="p-2 text-slate-200">{moveTypeLabel(m.moveType)}</td>
                  <td className="p-2 text-slate-200">
                    <MaterialBadge type={m.item.materialType} className="mr-1" />
                    {m.item.itemCode}
                  </td>
                  <td className="p-2 font-mono text-slate-400">{m.lot ? `${m.lot.lotNo}` : '—'}</td>
                  <td className="p-2 text-right font-medium text-slate-200">{m.quantity}</td>
                  <td className="p-2 text-slate-400">
                    {m.beforeQty ?? '—'} → {m.afterQty ?? '—'}
                  </td>
                  <td className="p-2 text-slate-400">{m.customerName || m.vendorName || m.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WmsCard>
    </>
  );
}
