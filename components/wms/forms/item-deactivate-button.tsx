'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { deactivateItemFormAction } from '@/lib/wms/actions/items';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.25rem] items-center rounded-md border border-red-900/60 px-3 text-sm text-red-200 hover:bg-red-950/40 disabled:opacity-50"
    >
      {pending ? '…' : '비활성'}
    </button>
  );
}

/** 품목 마스터 비활성(삭제 대신) */
export function ItemDeactivateButton({ itemId }: { itemId: string }) {
  const [state, action] = useFormState(deactivateItemFormAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={itemId} />
      <Submit />
      {state.error ? <span className="basis-full text-xs leading-snug text-red-400">{state.error}</span> : null}
    </form>
  );
}
