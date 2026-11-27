'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { shipStockAction } from '@/lib/wms/actions/stock-out';
import { wmsControl, wmsLabel, wmsFormCol } from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-rose-800 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
    >
      {pending ? '처리 중…' : '출고 실행'}
    </button>
  );
}

export function StockOutForm({
  lots,
}: {
  lots: { id: string; lotNo: string; heatNo: string; quantity: number; item: { itemCode: string; itemName: string } }[];
}) {
  const [state, action] = useFormState(shipStockAction, initial);

  return (
    <form action={action} className={wmsFormCol}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>LOT 선택</span>
        <select name="lotId" required className={wmsControl}>
          <option value="">선택</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.item.itemCode} / {l.lotNo} / H:{l.heatNo || '-'} — 재고 {l.quantity}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>출고 수량</span>
        <input name="quantity" type="number" min={1} required className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>거래처</span>
        <input name="customerName" required className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>문서번호</span>
        <input name="documentNo" className={wmsControl} />
      </label>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">출고가 반영되었습니다.</p> : null}
      <Submit />
    </form>
  );
}
