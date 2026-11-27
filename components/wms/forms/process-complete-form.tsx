'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { completeProcessOrderAction } from '@/lib/wms/actions/process';
import { wmsLabel, wmsRow2, wmsControlCompact } from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.4rem] items-center justify-center rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? '…' : '가공 완료'}
    </button>
  );
}

/** 가공중 지시 → 산출 LOT 반영 (PROCESSING만) */
export function ProcessCompleteInlineForm({
  orderId,
  locations,
}: {
  orderId: string;
  locations: { id: string; name: string; zone: string }[];
}) {
  const [state, action] = useFormState(completeProcessOrderAction, initial);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <div className={wmsRow2}>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>산출 LOT No</span>
          <input name="outputLotNo" required className={wmsControlCompact} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>Heat No</span>
          <input name="outputHeatNo" className={wmsControlCompact} placeholder="-" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>산출 수량</span>
          <input name="outputQty" type="number" min={1} required className={wmsControlCompact} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>불량</span>
          <input name="defectQty" type="number" min={0} defaultValue={0} className={wmsControlCompact} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>입고 창고</span>
          <select name="locationId" required className={wmsControlCompact}>
            <option value="">선택</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.zone ? `${l.zone}/` : ''}
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error ? <p className="text-xs text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-400">완료 처리됨</p> : null}
      <Submit />
    </form>
  );
}
