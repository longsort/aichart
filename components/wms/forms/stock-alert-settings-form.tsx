'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  saveGlobalThresholdAction,
  savePressureOverrideAction,
  saveSizeOverrideAction,
  deletePressureOverrideAction,
  deleteSizeOverrideAction,
} from '@/lib/wms/actions/stock-alerts';
import { wmsControl, wmsControlCompact, wmsLabel, wmsFormCol } from '@/components/wms/wms-form-styles';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';

type State = { success: boolean; error: string };
const initial: State = { success: false, error: '' };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.5rem] items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
    >
      {pending ? '저장 중…' : label}
    </button>
  );
}

function Feedback({ state }: { state: State }) {
  if (state.success) {
    return <p className="text-sm text-emerald-300">저장했습니다.</p>;
  }
  if (state.error) {
    return <p className="text-sm text-red-300">{state.error}</p>;
  }
  return null;
}

export function GlobalThresholdForm({
  criticalBelowSku,
  warnBelowSku,
  criticalBelowSize,
  warnBelowSize,
  criticalBelowPressure,
  warnBelowPressure,
}: {
  criticalBelowSku: number;
  warnBelowSku: number;
  criticalBelowSize: number;
  warnBelowSize: number;
  criticalBelowPressure: number;
  warnBelowPressure: number;
}) {
  const [state, action] = useFormState(saveGlobalThresholdAction, initial);

  return (
    <form action={action} className={`${wmsFormCol} max-w-2xl`}>
      <p className="text-xs text-slate-400">
        보유수량 &lt; 긴급 → 빨강 · 긴급 ≤ 보유 &lt; 주의 → 노랑 · 그 외 초록. 기본 긴급 20 / 주의 500.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>긴급 (SKU) — 미만이면 빨강</span>
          <input
            name="criticalBelowSku"
            type="number"
            min={0}
            defaultValue={criticalBelowSku}
            required
            className={wmsControl}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>주의 (SKU) — 미만이면 노랑</span>
          <input
            name="warnBelowSku"
            type="number"
            min={0}
            defaultValue={warnBelowSku}
            required
            className={wmsControl}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>긴급 (사이즈 합계 참고)</span>
          <input
            name="criticalBelowSize"
            type="number"
            min={0}
            defaultValue={criticalBelowSize}
            required
            className={wmsControl}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>주의 (사이즈 합계 참고)</span>
          <input
            name="warnBelowSize"
            type="number"
            min={0}
            defaultValue={warnBelowSize}
            required
            className={wmsControl}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>긴급 (압력 합계 참고)</span>
          <input
            name="criticalBelowPressure"
            type="number"
            min={0}
            defaultValue={criticalBelowPressure}
            required
            className={wmsControl}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>주의 (압력 합계 참고)</span>
          <input
            name="warnBelowPressure"
            type="number"
            min={0}
            defaultValue={warnBelowPressure}
            required
            className={wmsControl}
          />
        </label>
      </div>
      <Submit label="전역 기준 저장" />
      <Feedback state={state} />
    </form>
  );
}

export function SizeOverrideForm({
  sizes,
  existing,
}: {
  sizes: string[];
  existing: Array<{ nominalSize: string; criticalBelow: number | null; warnBelow: number | null }>;
}) {
  const [state, action] = useFormState(saveSizeOverrideAction, initial);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>사이즈</span>
          <select name="nominalSize" required className={wmsControlCompact} defaultValue="">
            <option value="" disabled>
              선택
            </option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>긴급 (빈칸=전역)</span>
          <input name="criticalBelow" type="number" min={0} className={wmsControlCompact} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>주의 (빈칸=전역)</span>
          <input name="warnBelow" type="number" min={0} className={wmsControlCompact} />
        </label>
        <Submit label="사이즈 저장" />
      </form>
      <Feedback state={state} />
      {existing.length ? (
        <ul className="space-y-2 text-sm text-slate-300">
          {existing.map((row) => (
            <li
              key={row.nominalSize}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900/50 px-3 py-2"
            >
              <span>
                <strong className="text-sky-300">{row.nominalSize}</strong>
                <span className="ml-2 text-slate-400">
                  긴급 {row.criticalBelow ?? '전역'} · 주의 {row.warnBelow ?? '전역'}
                </span>
              </span>
              <form action={deleteSizeOverrideAction}>
                <input type="hidden" name="nominalSize" value={row.nominalSize} />
                <button type="submit" className="text-xs text-red-300 hover:text-red-200">
                  삭제
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">사이즈별 덮어쓰기 없음 — 전역 기준 사용.</p>
      )}
    </div>
  );
}

export function PressureOverrideForm({
  pressures,
  existing,
}: {
  pressures: string[];
  existing: Array<{ pressureClass: string; criticalBelow: number | null; warnBelow: number | null }>;
}) {
  const [state, action] = useFormState(savePressureOverrideAction, initial);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>압력</span>
          <select name="pressureClass" required className={wmsControlCompact} defaultValue="">
            <option value="" disabled>
              선택
            </option>
            {pressures.map((p) => (
              <option key={p} value={p}>
                {catalogPressureChipLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>긴급 (빈칸=전역)</span>
          <input name="criticalBelow" type="number" min={0} className={wmsControlCompact} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={wmsLabel}>주의 (빈칸=전역)</span>
          <input name="warnBelow" type="number" min={0} className={wmsControlCompact} />
        </label>
        <Submit label="압력 저장" />
      </form>
      <Feedback state={state} />
      {existing.length ? (
        <ul className="space-y-2 text-sm text-slate-300">
          {existing.map((row) => (
            <li
              key={row.pressureClass}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900/50 px-3 py-2"
            >
              <span>
                <strong className="text-teal-300">{catalogPressureChipLabel(row.pressureClass)}</strong>
                <span className="ml-2 text-slate-400">
                  긴급 {row.criticalBelow ?? '전역'} · 주의 {row.warnBelow ?? '전역'}
                </span>
              </span>
              <form action={deletePressureOverrideAction}>
                <input type="hidden" name="pressureClass" value={row.pressureClass} />
                <button type="submit" className="text-xs text-red-300 hover:text-red-200">
                  삭제
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">압력별 덮어쓰기 없음 — 전역 기준 사용.</p>
      )}
    </div>
  );
}
