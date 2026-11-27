'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateItemAction } from '@/lib/wms/actions/items';
import { PRODUCT_TYPES, PRESSURE_CLASSES } from '@/lib/wms/codes';
import type { Item } from '@prisma/client';
import { wmsControl, wmsLabel, wmsFormGrid, wmsFieldSpan2 } from '@/components/wms/wms-form-styles';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-slate-600 px-4 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50 md:col-span-2"
    >
      {pending ? '저장 중…' : '수정 저장'}
    </button>
  );
}

/** 품목 마스터 수정 폼 */
export function ItemEditForm({
  item,
  locations,
}: {
  item: Item;
  locations: { id: string; name: string; zone: string }[];
}) {
  const [state, action] = useFormState(updateItemAction, initial);

  return (
    <form action={action} className={wmsFormGrid}>
      <input type="hidden" name="id" value={item.id} />
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>품목코드 (읽기전용)</span>
        <input readOnly value={item.itemCode} className={`${wmsControl} cursor-not-allowed bg-slate-900 text-slate-400`} />
      </label>
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>품목명 *</span>
        <input name="itemName" required defaultValue={item.itemName} className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>재질 *</span>
        <select name="materialType" required defaultValue={item.materialType} className={wmsControl}>
          <option value="SCS304">SCS304</option>
          <option value="SCS316">SCS316</option>
          <option value="SEMI_RAW">毛皮 반제품(SEMI_RAW)</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>제품타입</span>
        <select name="productType" defaultValue={item.productType} className={wmsControl}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>규격</span>
        <input name="standard" defaultValue={item.standard} className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>구경/사이즈</span>
        <input name="size" defaultValue={item.size} className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>압력등급</span>
        <select name="pressureClass" defaultValue={item.pressureClass} className={wmsControl}>
          {PRESSURE_CLASSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>단위</span>
        <input name="unit" defaultValue={item.unit} className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>안전재고</span>
        <input name="safetyStock" type="number" min={0} defaultValue={item.safetyStock} className={wmsControl} />
      </label>
      <label className={wmsFieldSpan2}>
        <span className={wmsLabel}>기본 창고</span>
        <select name="locationId" defaultValue={item.locationId ?? ''} className={wmsControl}>
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
        <input name="memo" defaultValue={item.memo} className={wmsControl} />
      </label>
      <label className="flex cursor-pointer items-center gap-3 md:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={item.isActive} className="h-4 w-4 rounded border-slate-500 text-teal-600" />
        <span className={wmsLabel}>사용 중</span>
      </label>
      {state.error ? <p className="text-sm text-red-400 md:col-span-2">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400 md:col-span-2">저장되었습니다.</p> : null}
      <div className="md:col-span-2">
        <Submit />
      </div>
    </form>
  );
}
