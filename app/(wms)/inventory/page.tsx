import Link from 'next/link';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { wmsControlCompact, wmsLabel } from '@/components/wms/wms-form-styles';
import { prisma } from '@/lib/prisma';
import { MaterialBadge } from '@/components/wms/material-badge';
import { LotStatusBadge } from '@/components/wms/lot-status-badge';
import type { InventoryLotStatus, MaterialType } from '@prisma/client';

type Search = { material?: string; locationId?: string; status?: string };

/** LOT·Heat 재고 현황 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const material = (sp.material || 'ALL') as MaterialType | 'ALL';
  const locationId = sp.locationId || 'ALL';
  const status = (sp.status || 'ALL') as InventoryLotStatus | 'ALL';

  const where: import('@prisma/client').Prisma.InventoryLotWhereInput = {};
  if (material !== 'ALL') where.item = { materialType: material };
  if (locationId !== 'ALL') where.locationId = locationId;
  if (status !== 'ALL') where.status = status;

  const [lots, locations] = await Promise.all([
    prisma.inventoryLot.findMany({
      where,
      include: { item: true, location: true },
      orderBy: [{ item: { itemCode: 'asc' } }, { lotNo: 'asc' }],
    }),
    prisma.location.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <WmsPageHeader title="LOT·Heat 재고" subtitle="재질·창고·상태 필터 · 상세에서 이력 확인" />
      <WmsCard title="필터" className="mb-3">
        <form className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end" method="get">
          <label className="flex min-w-0 flex-col gap-1.5 sm:w-40">
            <span className={wmsLabel}>재질</span>
            <select name="material" defaultValue={material} className={wmsControlCompact}>
              <option value="ALL">전체</option>
              <option value="SCS304">SCS304</option>
              <option value="SCS316">SCS316</option>
              <option value="SEMI_RAW">毛皮 반제품</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 sm:min-w-[12rem]">
            <span className={wmsLabel}>창고</span>
            <select name="locationId" defaultValue={locationId} className={wmsControlCompact}>
              <option value="ALL">전체</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.zone ? `${l.zone}/` : ''}
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 sm:min-w-[10rem]">
            <span className={wmsLabel}>상태</span>
            <select name="status" defaultValue={status} className={wmsControlCompact}>
              <option value="ALL">전체</option>
              <option value="NORMAL">정상</option>
              <option value="WAIT_INSPECTION">검사대기</option>
              <option value="PROCESSING">가공중</option>
              <option value="DEFECT">불량</option>
              <option value="SHIPPED">출고완료</option>
              <option value="HOLD">보류</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="inline-flex min-h-[2.4rem] items-center rounded-md bg-teal-800 px-4 text-sm font-medium text-white hover:bg-teal-700">
              적용
            </button>
            <Link
              href="/inventory"
              className="inline-flex min-h-[2.4rem] items-center rounded-md border border-slate-500 px-4 text-sm text-slate-200 hover:bg-slate-800"
            >
              초기화
            </Link>
          </div>
        </form>
      </WmsCard>

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
              <th className="p-2">품목</th>
              <th className="p-2">재질</th>
              <th className="p-2">LOT</th>
              <th className="p-2">Heat</th>
              <th className="p-2 text-right">수량</th>
              <th className="p-2">상태</th>
              <th className="p-2">창고</th>
              <th className="p-2">상세</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="border-b border-slate-800/80">
                <td className="p-2">
                  <span className="font-mono text-slate-200">{l.item.itemCode}</span>
                  <div className="text-xs text-slate-400">{l.item.itemName}</div>
                </td>
                <td className="p-2">
                  <MaterialBadge type={l.item.materialType} />
                </td>
                <td className="p-2 font-mono text-slate-200">{l.lotNo}</td>
                <td className="p-2 font-mono text-slate-400">{l.heatNo || '—'}</td>
                <td className="p-2 text-right font-medium text-slate-200">{l.quantity}</td>
                <td className="p-2">
                  <LotStatusBadge status={l.status} />
                </td>
                <td className="p-2 text-slate-400">{l.location ? `${l.location.zone} ${l.location.name}` : '—'}</td>
                <td className="p-2">
                  <Link href={`/inventory/${l.id}`} className="text-teal-400 underline">
                    이력
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lots.length === 0 ? <p className="mt-3 text-xs text-slate-500">조건에 맞는 LOT가 없습니다.</p> : null}
    </>
  );
}
