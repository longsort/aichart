import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { StockInForm } from '@/components/wms/forms/stock-in-form';
import { StockMoveType } from '@prisma/client';
import {
  clearStockMovesAction,
  deleteStockMoveAction,
} from '@/lib/wms/actions/admin-records';
import { ConfirmSubmitButton } from '@/components/wms/confirm-submit-button';
import { MaterialBadge } from '@/components/wms/material-badge';

type Search = { ok?: string; err?: string };

/** 입고 등록 + 최근 입고 기록 관리 */
export default async function StockInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [items, locations, recentIn] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { itemCode: 'asc' },
      select: { id: true, itemCode: true, itemName: true },
    }),
    prisma.location.findMany({ orderBy: { name: 'asc' } }),
    prisma.stockMove.findMany({
      where: { moveType: StockMoveType.IN },
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { item: true, lot: true },
    }),
  ]);

  return (
    <>
      <WmsPageHeader title="입고 관리" subtitle="품목·LOT·Heat·창고 · 동일 LOT는 수량 가산 · 아래 입고 기록 관리" />
      {sp.err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {sp.err}
        </p>
      ) : null}
      {sp.ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {sp.ok}
        </p>
      ) : null}
      <WmsCard className="mb-4">
        <StockInForm items={items} locations={locations} />
      </WmsCard>

      <WmsCard
        title="최근 입고 기록"
        className="mb-2"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">최근 50건 · 기록삭제 시 LOT 수량은 유지됩니다.</p>
          <form action={clearStockMovesAction}>
            <input type="hidden" name="returnTo" value="/stock/in" />
            <input type="hidden" name="moveType" value="IN" />
            <ConfirmSubmitButton
              confirmMessage="입고(IN) 원장을 전부 삭제할까요? LOT 수량은 유지됩니다."
              className="inline-flex min-h-8 items-center rounded-md border border-red-800/80 bg-red-950/40 px-3 text-xs font-semibold text-red-100 hover:border-red-600"
            >
              입고 기록 전체삭제
            </ConfirmSubmitButton>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <th className="p-2">품목</th>
                <th className="p-2">LOT</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2">전→후</th>
                <th className="p-2">매입처/문서</th>
                <th className="p-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {recentIn.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
                  <td className="p-2 text-slate-200">
                    <MaterialBadge type={m.item.materialType} className="mr-1" />
                    {m.item.itemCode}
                  </td>
                  <td className="p-2 font-mono text-slate-400">{m.lot?.lotNo || '—'}</td>
                  <td className="p-2 text-right text-slate-200">{m.quantity}</td>
                  <td className="p-2 text-slate-400">
                    {m.beforeQty ?? '—'} → {m.afterQty ?? '—'}
                  </td>
                  <td className="p-2 text-slate-400">{m.vendorName || m.documentNo || m.reason || '—'}</td>
                  <td className="p-2">
                    <form action={deleteStockMoveAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="returnTo" value="/stock/in" />
                      <ConfirmSubmitButton
                        confirmMessage="이 입고 기록을 삭제할까요?"
                        className="text-xs text-red-300 hover:text-red-200"
                      >
                        기록삭제
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recentIn.length === 0 ? <p className="mt-2 text-xs text-slate-500">입고 기록 없음</p> : null}
      </WmsCard>
    </>
  );
}
