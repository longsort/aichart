import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { getLotDetail } from '@/lib/wms/actions/stock';
import { MaterialBadge } from '@/components/wms/material-badge';
import { LotStatusBadge } from '@/components/wms/lot-status-badge';
import { moveTypeLabel } from '@/lib/wms/inventory-stats';
import { prisma } from '@/lib/prisma';
import {
  deleteLotAdminAction,
  deleteQualityCheckAction,
  deleteStockMoveAction,
  updateLotAdminAction,
} from '@/lib/wms/actions/admin-records';
import { ConfirmSubmitButton } from '@/components/wms/confirm-submit-button';
import { wmsControlCompact, wmsLabel } from '@/components/wms/wms-form-styles';

type Search = { ok?: string; err?: string };

/** LOT 상세: 수정·삭제 · 입출고/검사 기록삭제 */
export default async function LotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [lot, locations] = await Promise.all([
    getLotDetail(id),
    prisma.location.findMany({ orderBy: { name: 'asc' } }),
  ]);
  if (!lot) notFound();

  return (
    <>
      <WmsPageHeader title={`LOT ${lot.lotNo}`} subtitle={`${lot.item.itemName} · Heat ${lot.heatNo || '-'}`} />
      <Link href="/inventory" className="mb-3 inline-block text-xs text-teal-400 underline">
        ← 재고 목록
      </Link>
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

      <WmsCard title="LOT 수정" className="mb-4">
        <form action={updateLotAdminAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="id" value={lot.id} />
          <input type="hidden" name="returnTo" value={`/inventory/${lot.id}`} />
          <label className="flex flex-col gap-1">
            <span className={wmsLabel}>LOT No</span>
            <input name="lotNo" required defaultValue={lot.lotNo} className={wmsControlCompact} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={wmsLabel}>Heat No</span>
            <input name="heatNo" defaultValue={lot.heatNo || ''} className={wmsControlCompact} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={wmsLabel}>수량</span>
            <input
              name="quantity"
              type="number"
              min={0}
              required
              defaultValue={lot.quantity}
              className={wmsControlCompact}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={wmsLabel}>상태</span>
            <select name="status" defaultValue={lot.status} className={wmsControlCompact}>
              <option value="NORMAL">정상</option>
              <option value="WAIT_INSPECTION">검사대기</option>
              <option value="PROCESSING">가공중</option>
              <option value="DEFECT">불량</option>
              <option value="SHIPPED">출고완료</option>
              <option value="HOLD">보류</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={wmsLabel}>창고</span>
            <select name="locationId" defaultValue={lot.locationId || ''} className={wmsControlCompact}>
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.zone ? `${l.zone}/` : ''}
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
            <span className={wmsLabel}>메모</span>
            <input name="memo" defaultValue={lot.memo || ''} className={wmsControlCompact} />
          </label>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="inline-flex min-h-9 items-center rounded-md bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-700"
            >
              수정 저장
            </button>
          </div>
        </form>
        <form action={deleteLotAdminAction} className="mt-3 border-t border-slate-800 pt-3">
          <input type="hidden" name="id" value={lot.id} />
          <input type="hidden" name="returnTo" value="/inventory" />
          <ConfirmSubmitButton
            confirmMessage={`LOT ${lot.lotNo}를 삭제할까요? 관련 검사도 함께 삭제됩니다.`}
            className="inline-flex min-h-9 items-center rounded-md border border-red-800/80 bg-red-950/40 px-3 text-xs font-semibold text-red-100 hover:border-red-600"
          >
            LOT 삭제
          </ConfirmSubmitButton>
        </form>
      </WmsCard>

      <WmsCard title="입출고·이동 이력" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
                <th className="py-1 pr-2">유형</th>
                <th className="py-1 pr-2">수량</th>
                <th className="py-1 pr-2">전→후</th>
                <th className="py-1 pr-2">비고</th>
                <th className="py-1 pr-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {lot.stockMoves.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80">
                  <td className="py-1 pr-2 text-slate-200">{moveTypeLabel(m.moveType)}</td>
                  <td className="py-1 pr-2 font-medium text-slate-200">{m.quantity}</td>
                  <td className="py-1 pr-2 text-slate-400">
                    {m.beforeQty ?? '—'} → {m.afterQty ?? '—'}
                  </td>
                  <td className="py-1 pr-2 text-slate-400">{m.reason || m.documentNo || '—'}</td>
                  <td className="py-1 pr-2">
                    <form action={deleteStockMoveAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="returnTo" value={`/inventory/${lot.id}`} />
                      <ConfirmSubmitButton
                        confirmMessage="이 원장 기록을 삭제할까요?"
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
        {lot.stockMoves.length === 0 ? <p className="text-xs text-slate-500">이력 없음</p> : null}
      </WmsCard>

      <WmsCard title="검사·첨부">
        {lot.qualityChecks.length === 0 ? (
          <p className="text-xs text-slate-500">검사 이력 없음</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {lot.qualityChecks.map((qc) => (
              <li key={qc.id} className="rounded border border-slate-700 p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-200">
                      {qc.checkType} /{' '}
                      <span
                        className={
                          qc.result === 'PASS'
                            ? 'text-emerald-400'
                            : qc.result === 'FAIL'
                              ? 'text-red-400'
                              : 'text-amber-400'
                        }
                      >
                        {qc.result}
                      </span>
                    </div>
                    <div className="text-slate-400">검사자: {qc.inspector || '—'}</div>
                    {qc.attachments.map((a) => (
                      <div key={a.id} className="mt-1 font-mono text-xs text-sky-300/90">
                        {a.fileType}: {a.fileName} — {a.fileUrl}
                      </div>
                    ))}
                  </div>
                  <form action={deleteQualityCheckAction}>
                    <input type="hidden" name="id" value={qc.id} />
                    <input type="hidden" name="lotId" value={lot.id} />
                    <input type="hidden" name="returnTo" value={`/inventory/${lot.id}`} />
                    <ConfirmSubmitButton
                      confirmMessage="이 검사 기록을 삭제할까요?"
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      기록삭제
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WmsCard>
    </>
  );
}
