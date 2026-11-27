'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { receiveStockAction } from '@/lib/wms/actions/stock-in';
import { wmsControl, wmsLabel, wmsFormCol, wmsRow2 } from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
    >
      {pending ? '처리 중…' : children}
    </button>
  );
}

export function StockInForm({
  items,
  locations,
}: {
  items: { id: string; itemCode: string; itemName: string }[];
  locations: { id: string; name: string; zone: string }[];
}) {
  const [state, action] = useFormState(receiveStockAction, initial);

  return (
    <form action={action} className={wmsFormCol}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>품목</span>
        <select name="itemId" required className={wmsControl}>
          <option value="">선택</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.itemCode} — {i.itemName}
            </option>
          ))}
        </select>
      </label>
      <div className={wmsRow2}>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>LOT No</span>
          <input name="lotNo" required className={wmsControl} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>Heat No</span>
          <input name="heatNo" className={wmsControl} placeholder="없으면 공란" />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>수량</span>
        <input name="quantity" type="number" min={1} required className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>창고 위치</span>
        <select name="locationId" required className={wmsControl}>
          <option value="">선택</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.zone ? `${l.zone} / ` : ''}
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>매입처</span>
        <input name="vendorName" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>문서번호</span>
        <input name="documentNo" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>비고</span>
        <input name="memo" className={wmsControl} />
      </label>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">입고가 등록되었습니다.</p> : null}
      <Submit>입고 등록</Submit>
    </form>
  );
}
