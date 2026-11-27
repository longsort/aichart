'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createLocationAction } from '@/lib/wms/actions/settings';
import { wmsControl, wmsLabel, wmsFormCol } from '@/components/wms/wms-form-styles';

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
      {pending ? '저장 중…' : '창고 추가'}
    </button>
  );
}

/** 창고·구역 등록 */
export function LocationForm() {
  const [state, action] = useFormState(createLocationAction, initial);

  return (
    <form action={action} className={`${wmsFormCol} max-w-md`}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>창고명 *</span>
        <input name="name" required className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>구역 코드</span>
        <input name="zone" placeholder="A, B, S…" className={wmsControl} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={wmsLabel}>설명</span>
        <input name="description" className={wmsControl} />
      </label>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">추가되었습니다.</p> : null}
      <Submit />
    </form>
  );
}
