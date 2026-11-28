import Link from 'next/link';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { prisma } from '@/lib/prisma';
import { moveTypeLabel } from '@/lib/wms/inventory-stats';
import { MaterialBadge } from '@/components/wms/material-badge';
import {
  clearStockMovesAction,
  deleteStockMoveAction,
} from '@/lib/wms/actions/admin-records';
import { ConfirmSubmitButton } from '@/components/wms/confirm-submit-button';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';
import type { StockMoveType } from '@prisma/client';

type Search = { moveType?: string; q?: string; ok?: string; err?: string };

/** 입출고 원장 — 조회 + 기록삭제/전체삭제 */
export default async function MovesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const moveType = (sp.moveType || 'ALL').trim();
  const q = (sp.q || '').trim();

  const where: import('@prisma/client').Prisma.StockMoveWhereInput = {};
  if (moveType !== 'ALL') where.moveType = moveType as StockMoveType;
  if (q) {
    where.OR = [
      { documentNo: { contains: q } },
      { customerName: { contains: q } },
      { vendorName: { contains: q } },
      { reason: { contains: q } },
      { item: { itemCode: { contains: q } } },
    ];
  }

  const moves = await prisma.stockMove.findMany({
    where,
    take: 300,
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
      <WmsPageHeader
        title="입출고 원장"
        subtitle="입고·출고·가공·조정 기록 · 단건/전체 기록삭제 (LOT 수량은 유지)"
      />
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

      <WmsCard title="필터 · 관리" className="mb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              유형
              <select name="moveType" defaultValue={moveType} className={wmsControlCompact}>
                <option value="ALL">전체</option>
                <option value="IN">입고</option>
                <option value="OUT">출고</option>
                <option value="ADJUST">조정</option>
                <option value="PROCESS_IN">가공투입</option>
                <option value="PROCESS_OUT">가공산출</option>
                <option value="TRANSFER">이동</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              검색
              <input
                name="q"
                defaultValue={q}
                placeholder="품번·문서·거래처"
                className={`${wmsControlCompact} min-w-[10rem]`}
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-9 items-center rounded-md bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-700"
            >
              적용
            </button>
            <Link
              href="/moves"
              className="inline-flex min-h-9 items-center rounded-md border border-slate-600 px-3 text-xs text-slate-300"
            >
              초기화
            </Link>
          </form>
          <form action={clearStockMovesAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="returnTo" value="/moves" />
            <input type="hidden" name="moveType" value={moveType} />
            <ConfirmSubmitButton
              confirmMessage={
                moveType === 'ALL'
                  ? '원장 전체 기록을 삭제할까요? LOT 수량은 바뀌지 않습니다.'
                  : `${moveType} 기록만 전체삭제할까요?`
              }
              className="inline-flex min-h-9 items-center rounded-md border border-red-800/80 bg-red-950/40 px-3 text-xs font-semibold text-red-100 hover:border-red-600"
            >
              {moveType === 'ALL' ? '전체 기록삭제' : `${moveTypeLabel(moveType as StockMoveType)} 기록 전체삭제`}
            </ConfirmSubmitButton>
          </form>
        </div>
      </WmsCard>

      <WmsCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
                <th className="p-2">유형</th>
                <th className="p-2">품목</th>
                <th className="p-2">LOT</th>
                <th className="p-2 text-right">수량</th>
                <th className="p-2">전→후</th>
                <th className="p-2">거래처/비고</th>
                <th className="p-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
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
                  <td className="p-2">
                    <form action={deleteStockMoveAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="returnTo" value="/moves" />
                      <ConfirmSubmitButton
                        confirmMessage="이 원장 기록을 삭제할까요? (재고 수량은 유지)"
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
        {moves.length === 0 ? <p className="mt-2 text-xs text-slate-500">기록이 없습니다.</p> : null}
      </WmsCard>
    </>
  );
}
