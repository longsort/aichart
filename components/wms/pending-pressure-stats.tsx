'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import {
  aggregatePendingPressureStats,
  clearPendingInboundQueue,
  readPendingInboundQueue,
  type PendingInboundQueueItem,
  type PendingPressureStat,
} from '@/lib/wms/pending-inbound-queue';

/**
 * 입고대기 압력 통계 팝업 — 사용자가 담은 대기열만 (전체 미입고 SKU 아님).
 */
export function PendingPressureStats() {
  const [items, setItems] = useState<PendingInboundQueueItem[]>([]);
  const [stats, setStats] = useState<PendingPressureStat[]>([]);

  const refresh = useCallback(() => {
    const q = readPendingInboundQueue();
    setItems(q);
    setStats(aggregatePendingPressureStats(q));
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === 'wms-pending-inbound-queue-v1') refresh();
    };
    const onLocal = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('wms-pending-inbound-queue', onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('wms-pending-inbound-queue', onLocal);
    };
  }, [refresh]);

  const skuTotal = items.length;
  const qtyTotal = items.reduce((s, x) => s + (x.qty && x.qty > 0 ? x.qty : 0), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-1">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">입고대기 · 압력 통계</h1>
          <p className="mt-1 text-xs text-slate-500">
            대기열에 담은 SKU만 · 전체 미입고(빈 카탈로그) 450과 무관
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/stock/pending"
            className="inline-flex min-h-9 items-center rounded-md border border-slate-600 bg-slate-900 px-3 text-xs text-slate-200 hover:border-teal-600"
          >
            입고대기로
          </Link>
          {skuTotal > 0 ? (
            <button
              type="button"
              className="inline-flex min-h-9 items-center rounded-md border border-slate-700 px-3 text-xs text-slate-400 hover:border-red-800 hover:text-red-200"
              onClick={() => {
                if (!window.confirm('대기열을 비울까요?')) return;
                clearPendingInboundQueue();
                refresh();
              }}
            >
              대기열 비우기
            </button>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-xs text-slate-500">대기열 SKU</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-teal-300">{skuTotal.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-xs text-slate-500">압력 종류</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-sky-300">{stats.length.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500">예정 수량 합</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-100">
            {qtyTotal > 0 ? qtyTotal.toLocaleString() : '—'}
          </div>
        </div>
      </section>

      {skuTotal === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
          대기열이 비어 있습니다.
          <br />
          <span className="text-slate-400">입고대기</span>에서 SKU를 「대기열」에 담은 뒤 이 창을 여세요.
        </p>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[360px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/90 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">압력등급</th>
                <th className="px-3 py-2 text-right">SKU 수</th>
                <th className="px-3 py-2 text-right">예정수량</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.pressureClass} className="border-b border-slate-800/80">
                  <td className="px-3 py-2 font-medium text-teal-200">
                    {catalogPressureChipLabel(row.pressureClass) || row.pressureClass}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                    {row.skuCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {row.qtyTotal > 0 ? row.qtyTotal.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {skuTotal > 0 ? (
        <details className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
            대기열 SKU 목록 ({skuTotal})
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {items.map((it) => (
              <li key={it.id} className="flex flex-wrap gap-x-2 text-slate-400">
                <span className="text-teal-300/90">
                  {catalogPressureChipLabel(it.pressureClass) || it.pressureClass}
                </span>
                <span>{it.size || '—'}</span>
                <span className="text-slate-300">{it.itemCode}</span>
                {it.qty && it.qty > 0 ? <span className="tabular-nums">×{it.qty}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
