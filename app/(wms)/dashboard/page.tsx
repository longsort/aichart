import Link from 'next/link';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { sumQtyByMaterial, getLowStockItems, countLotsByStatus, getRecentMoves, moveTypeLabel } from '@/lib/wms/inventory-stats';
import { MaterialBadge } from '@/components/wms/material-badge';
import { InventoryLotStatus } from '@prisma/client';

/** 대시보드: 재질별 수량·경고·최근 이동 */
export default async function DashboardPage() {
  const [byMat, low, waitInsp, processing, recent] = await Promise.all([
    sumQtyByMaterial(),
    getLowStockItems(),
    countLotsByStatus(InventoryLotStatus.WAIT_INSPECTION),
    countLotsByStatus(InventoryLotStatus.PROCESSING),
    getRecentMoves(10),
  ]);

  return (
    <>
      <WmsPageHeader title="대시보드" subtitle="수량 기준 요약 · 안전재고·검사·가공 현황" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WmsCard title="총 재고(수량 합계)">
          <p className="text-2xl font-bold text-teal-300">{byMat.total.toLocaleString()}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">금액 미연동 — EA·KG 등 단위 혼재 시 참고용</p>
        </WmsCard>
        <WmsCard title="SCS304">
          <p className="text-xl font-semibold text-sky-300">{byMat.scs304.toLocaleString()}</p>
        </WmsCard>
        <WmsCard title="SCS316">
          <p className="text-xl font-semibold text-violet-300">{byMat.scs316.toLocaleString()}</p>
        </WmsCard>
        <WmsCard title="毛皮 반제품">
          <p className="text-xl font-semibold text-amber-300">{byMat.semiRaw.toLocaleString()}</p>
        </WmsCard>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <WmsCard title="안전재고 미달">
          {low.length === 0 ? (
            <p className="text-xs text-emerald-400">해당 없음</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {low.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-slate-800 py-1">
                  <MaterialBadge type={r.materialType} />
                  <Link href={`/items/${r.id}`} className="text-red-300 underline">
                    {r.itemCode}
                  </Link>
                  <span className="text-slate-400">
                    재고 {r.totalQty} &lt; 안전 {r.safetyStock}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WmsCard>
        <WmsCard title="LOT 상태">
          <div className="flex flex-wrap gap-3 text-xs">
            <span>
              검사대기: <strong className="text-amber-300">{waitInsp}</strong>
            </span>
            <span>
              가공중: <strong className="text-sky-300">{processing}</strong>
            </span>
            <Link href="/inventory" className="text-teal-400 underline">
              재고 화면
            </Link>
          </div>
        </WmsCard>
      </div>

      <WmsCard title="최근 입출고·이동 10건" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
                <th className="py-1 pr-2">일시</th>
                <th className="py-1 pr-2">유형</th>
                <th className="py-1 pr-2">품목</th>
                <th className="py-1 pr-2">LOT</th>
                <th className="py-1 text-right">수량</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
                  <td className="py-1 pr-2 text-slate-400">{new Date(m.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="py-1 pr-2 text-slate-200">{moveTypeLabel(m.moveType)}</td>
                  <td className="py-1 pr-2 text-slate-200">
                    <MaterialBadge type={m.item.materialType} className="mr-1 align-middle" />
                    {m.item.itemCode}
                  </td>
                  <td className="py-1 pr-2 text-slate-400">{m.lot ? `${m.lot.lotNo} / ${m.lot.heatNo || '-'}` : '—'}</td>
                  <td className="py-1 text-right font-medium text-slate-200">{m.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WmsCard>
    </>
  );
}
