'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { startProcessOrderAction, cancelProcessOrderAction } from '@/lib/wms/actions/process';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function PendingBtn({ children, className }: { children: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? '…' : children}
    </button>
  );
}

/** 가공 시작 (READY → PROCESSING) */
export function ProcessStartForm({ orderId }: { orderId: string }) {
  const [state, action] = useFormState(startProcessOrderAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={orderId} />
      <PendingBtn className="inline-flex min-h-[2.25rem] items-center rounded-md bg-teal-800 px-3 text-sm font-medium text-white hover:bg-teal-700">
        가공시작
      </PendingBtn>
      {state.error ? <span className="basis-full text-xs leading-snug text-red-400">{state.error}</span> : null}
    </form>
  );
}

/** 가공 취소 */
export function ProcessCancelForm({ orderId }: { orderId: string }) {
  const [state, action] = useFormState(cancelProcessOrderAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={orderId} />
      <PendingBtn className="inline-flex min-h-[2.25rem] items-center rounded-md border border-slate-500 px-3 text-sm text-slate-200 hover:bg-slate-800">
        취소
      </PendingBtn>
      {state.error ? <span className="basis-full text-xs leading-snug text-red-400">{state.error}</span> : null}
    </form>
  );
}
