import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { getLotDetail } from '@/lib/wms/actions/stock';
import { MaterialBadge } from '@/components/wms/material-badge';
import { LotStatusBadge } from '@/components/wms/lot-status-badge';
import { moveTypeLabel } from '@/lib/wms/inventory-stats';

/** LOT 상세: 입출고·검사·첨부 이력 */
export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLotDetail(id);
  if (!lot) notFound();

  return (
    <>
      <WmsPageHeader title={`LOT ${lot.lotNo}`} subtitle={`${lot.item.itemName} · Heat ${lot.heatNo || '-'}`} />
      <Link href="/inventory" className="mb-3 inline-block text-xs text-teal-400 underline">
        ← 재고 목록
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <MaterialBadge type={lot.item.materialType} />
        <LotStatusBadge status={lot.status} />
        <span className="text-slate-400">수량: {lot.quantity}</span>
        {lot.location ? (
          <span className="text-slate-500">
            창고: {lot.location.zone} {lot.location.name}
          </span>
        ) : null}
      </div>

      <WmsCard title="입출고·이동 이력" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
                <th className="py-1 pr-2">일시</th>
                <th className="py-1 pr-2">유형</th>
                <th className="py-1 pr-2">수량</th>
                <th className="py-1 pr-2">전→후</th>
                <th className="py-1 pr-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {lot.stockMoves.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
                  <td className="py-1 pr-2 text-slate-400">{new Date(m.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="py-1 pr-2 text-slate-200">{moveTypeLabel(m.moveType)}</td>
                  <td className="py-1 pr-2 font-medium text-slate-200">{m.quantity}</td>
                  <td className="py-1 pr-2 text-slate-400">
                    {m.beforeQty ?? '—'} → {m.afterQty ?? '—'}
                  </td>
                  <td className="py-1 pr-2 text-slate-400">{m.reason || m.documentNo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lot.stockMoves.length === 0 ? <p className="text-xs text-slate-500">이력 없음</p> : null}
      </WmsCard>

      <WmsCard title="검사·첨부">
        {lot.qualityChecks.length === 0 ? (
          <p className="text-xs text-slate-500">검사 이력 없음</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {lot.qualityChecks.map((qc) => (
              <li key={qc.id} className="rounded border border-slate-700 p-2">
                <div className="font-medium text-slate-200">
                  {qc.checkType} / <span className={qc.result === 'PASS' ? 'text-emerald-400' : qc.result === 'FAIL' ? 'text-red-400' : 'text-amber-400'}>{qc.result}</span> /{' '}
                  {new Date(qc.checkedAt).toLocaleString('ko-KR')}
                </div>
                <div className="text-slate-400">검사자: {qc.inspector || '—'}</div>
                {qc.attachments.map((a) => (
                  <div key={a.id} className="mt-1 font-mono text-xs text-sky-300/90">
                    {a.fileType}: {a.fileName} — {a.fileUrl}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </WmsCard>
    </>
  );
}
