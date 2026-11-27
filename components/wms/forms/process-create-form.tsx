'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createProcessOrderAction } from '@/lib/wms/actions/process';
import { wmsControl, wmsLabel, wmsFormCol } from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-amber-800 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {pending ? '등록 중…' : '가공지시 등록'}
    </button>
  );
}

/** 毛皮 반제품 → 완제품 가공 지시 등록 */
export function ProcessCreateForm({
  semiLots,
  targetItems,
}: {
  semiLots: { id: string; lotNo: string; heatNo: string; quantity: number; item: { itemCode: string; itemName: string } }[];
  targetItems: { id: string; itemCode: string; itemName: string; materialType: string }[];
}) {
  const [state, action] = useFormState(createProcessOrderAction, initial);

  return (
    <form action={action} className={wmsFormCol}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>반제품 LOT</span>
        <select name="sourceLotId" required className={wmsControl}>
          <option value="">선택</option>
          {semiLots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.item.itemCode} / {l.lotNo} / H:{l.heatNo || '-'} — {l.quantity}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>산출 완제품 품목</span>
        <select name="targetItemId" required className={wmsControl}>
          <option value="">선택</option>
          {targetItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.itemCode} — {i.itemName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>투입 수량</span>
        <input name="inputQty" type="number" min={1} required className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>지시번호 (비우면 자동)</span>
        <input name="orderNo" placeholder="PO-2025-0001" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>비고</span>
        <input name="memo" className={wmsControl} />
      </label>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">등록되었습니다.</p> : null}
      <Submit />
    </form>
  );
}
