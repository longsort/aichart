import Link from 'next/link';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import { listPendingPressureStats } from '@/lib/wms/pending-inbound';

/**
 * 입고대기 압력 통계 — DB PendingInbound(대기>0)만 집계.
 * 메인 표: SKU별 압력 + 사이즈 + 대기수량 (압력만 합치면 50A 등이 가려짐).
 * localStorage 대기열과 무관.
 */
export async function PendingPressureStats() {
  const { stats, skuTotal, qtyTotal, items } = await listPendingPressureStats();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-1">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">입고대기 · 압력 통계</h1>
          <p className="mt-1 text-xs text-slate-500">
            DB 대기 수량만 · 압력+사이즈+대기수량 · 보유(LOT) 아님
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/stock/pending"
            className="inline-flex min-h-9 items-center rounded-md border border-slate-600 bg-slate-900 px-3 text-xs text-slate-200 hover:border-teal-600"
          >
            입고대기로
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-xs text-slate-500">대기 SKU</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-teal-300">
            {skuTotal.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          <div className="text-xs text-slate-500">압력 종류</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-sky-300">
            {stats.length.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500">대기 수량 합</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-amber-300">
            {qtyTotal > 0 ? qtyTotal.toLocaleString() : '—'}
          </div>
        </div>
      </section>

      {skuTotal === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
          저장된 대기 수량이 없습니다.
          <br />
          <span className="text-slate-400">입고대기</span>에서 수량을 넣고 「대기 저장」하세요.
        </p>
      ) : (
        <>
          <section className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/90 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">압력</th>
                  <th className="px-3 py-2">사이즈</th>
                  <th className="px-3 py-2">품번</th>
                  <th className="px-3 py-2 text-right">대기수량</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.itemId} className="border-b border-slate-800/80">
                    <td className="px-3 py-2 font-medium text-teal-200">
                      {catalogPressureChipLabel(it.pressureClass) || it.pressureClass || '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold text-sky-200">{it.size || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="text-slate-100">{it.itemCode}</div>
                      {it.itemName ? (
                        <div className="text-xs text-slate-500">{it.itemName}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-300">
                      {it.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <details className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
              압력별 합계 ({stats.length})
            </summary>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">압력등급</th>
                  <th className="px-2 py-1.5 text-right">SKU</th>
                  <th className="px-2 py-1.5 text-right">대기합</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.pressureClass} className="border-b border-slate-800/60">
                    <td className="px-2 py-1.5 text-teal-200/90">
                      {row.label || catalogPressureChipLabel(row.pressureClass) || row.pressureClass}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                      {row.skuCount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-amber-300/80">
                      {row.qtyTotal > 0 ? row.qtyTotal.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
