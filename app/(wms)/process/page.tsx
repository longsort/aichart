import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { wmsControlCompact, wmsLabel } from '@/components/wms/wms-form-styles';
import { prisma } from '@/lib/prisma';
import { getSemiRawLots, getFinishedProductItems } from '@/lib/wms/queries';
import { listProcessOrdersForUi } from '@/lib/wms/process-queries';
import { submitProcessStepForm } from '@/lib/wms/actions/process';
import { ProcessCreateForm } from '@/components/wms/forms/process-create-form';
import { ProcessCompleteInlineForm } from '@/components/wms/forms/process-complete-form';
import { ProcessStartForm, ProcessCancelForm } from '@/components/wms/forms/process-start-cancel-forms';
import { ProcessOrderStatus, ProcessStep } from '@prisma/client';
import { processStepLabel, processOrderStatusLabel } from '@/lib/wms/labels';
import { MaterialBadge } from '@/components/wms/material-badge';

/** 毛皮 반제품 가공 지시 */
export default async function ProcessPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const [semiLots, targets, orders, locations] = await Promise.all([
    getSemiRawLots(),
    getFinishedProductItems(),
    listProcessOrdersForUi(),
    prisma.location.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const steps = Object.values(ProcessStep);

  return (
    <>
      <WmsPageHeader title="毛皮 반제품 가공" subtitle="반제품 LOT 투입 → 완제품 산출 · 가공시작 후 완료" />
      {sp.err ? <p className="mb-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1 text-xs text-red-300">{decodeURIComponent(sp.err)}</p> : null}

      <WmsCard title="신규 가공 지시" className="mb-4">
        <ProcessCreateForm
          semiLots={semiLots.map((l) => ({
            id: l.id,
            lotNo: l.lotNo,
            heatNo: l.heatNo,
            quantity: l.quantity,
            item: { itemCode: l.item.itemCode, itemName: l.item.itemName },
          }))}
          targetItems={targets.map((i) => ({ id: i.id, itemCode: i.itemCode, itemName: i.itemName, materialType: i.materialType }))}
        />
      </WmsCard>

      <WmsCard title="가공 지시 목록">
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm leading-relaxed">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold text-teal-300">{o.orderNo}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">{processOrderStatusLabel(o.status)}</span>
                <MaterialBadge type={o.sourceLot.item.materialType} />
              </div>
              <p className="mt-1 text-slate-300">
                원천: {o.sourceLot.item.itemCode} / LOT {o.sourceLot.lotNo} (재고 {o.sourceLot.quantity}) · 투입 {o.inputQty}
              </p>
              <p className="text-slate-300">
                목표: {o.targetItem.itemCode} — {o.targetItem.itemName}
              </p>
              <p className="mt-1 text-slate-400">단계: {processStepLabel(o.processStep)}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {o.status === ProcessOrderStatus.READY ? <ProcessStartForm orderId={o.id} /> : null}
                {o.status === ProcessOrderStatus.READY || o.status === ProcessOrderStatus.PROCESSING ? <ProcessCancelForm orderId={o.id} /> : null}
              </div>

              {o.status === ProcessOrderStatus.PROCESSING ? (
                <div className="mt-2">
                  <form action={submitProcessStepForm} className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <input type="hidden" name="orderId" value={o.id} />
                    <label className="flex min-w-0 flex-col gap-1.5 sm:min-w-[12rem]">
                      <span className={wmsLabel}>가공 단계</span>
                      <select name="step" defaultValue={o.processStep} className={wmsControlCompact}>
                        {steps.map((s) => (
                          <option key={s} value={s}>
                            {processStepLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="inline-flex min-h-[2.4rem] items-center rounded-md bg-slate-700 px-4 text-sm font-medium text-white hover:bg-slate-600"
                    >
                      단계 저장
                    </button>
                  </form>
                  <ProcessCompleteInlineForm orderId={o.id} locations={locations} />
                </div>
              ) : null}

              {o.status === ProcessOrderStatus.DONE ? (
                <p className="mt-2 text-emerald-500">
                  완료 · 산출 {o.outputQty} · 불량 {o.defectQty}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {orders.length === 0 ? <p className="text-xs text-slate-500">지시 없음</p> : null}
      </WmsCard>
    </>
  );
}
