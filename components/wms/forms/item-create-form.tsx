'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createItemAction } from '@/lib/wms/actions/items';
import { PRODUCT_TYPES, PRESSURE_CLASSES } from '@/lib/wms/codes';
import { wmsControl, wmsLabel, wmsFormGrid, wmsFieldSpan2 } from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-slate-600 px-4 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
    >
      {pending ? '저장 중…' : '품목 등록'}
    </button>
  );
}

export function ItemCreateForm({
  locations,
}: {
  locations: { id: string; name: string; zone: string }[];
}) {
  const [state, action] = useFormState(createItemAction, initial);

  return (
    <form action={action} className={wmsFormGrid}>
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>품목코드 *</span>
        <input name="itemCode" required className={wmsControl} />
      </label>
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>품목명 *</span>
        <input name="itemName" required className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>재질 *</span>
        <select name="materialType" required className={wmsControl}>
          <option value="SCS304">SCS304</option>
          <option value="SCS316">SCS316</option>
          <option value="SEMI_RAW">毛皮 반제품(SEMI_RAW)</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>제품타입</span>
        <select name="productType" className={wmsControl}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>규격</span>
        <input name="standard" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>구경/사이즈</span>
        <input name="size" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>압력등급</span>
        <select name="pressureClass" className={wmsControl}>
          {PRESSURE_CLASSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>단위</span>
        <input name="unit" defaultValue="EA" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>안전재고</span>
        <input name="safetyStock" type="number" min={0} defaultValue={0} className={wmsControl} />
      </label>
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>기본 창고</span>
        <select name="locationId" className={wmsControl}>
          <option value="">없음</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.zone ? `${l.zone} / ` : ''}
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>메모</span>
        <input name="memo" className={wmsControl} />
      </label>
      {state.error ? <p className="text-sm text-red-400 md:col-span-2">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400 md:col-span-2">등록되었습니다.</p> : null}
      <div className="md:col-span-2">
        <Submit />
      </div>
    </form>
  );
}
