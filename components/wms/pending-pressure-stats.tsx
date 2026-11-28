import Link from 'next/link';
import {
  clearPendingInboundAction,
  receiveAllPendingInboundAction,
  receivePendingInboundAction,
  undoLastBulkReceiveAction,
  undoLastPendingReceiveAction,
  updatePendingStatsRowAction,
} from '@/lib/wms/actions/pending-inbound';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import {
  getLastUndoableBulkReceive,
  listPendingPressureStats,
  mapUndoableReceiveQtyByItemId,
} from '@/lib/wms/pending-inbound';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';

/**
 * 입고대기 압력 통계 — DB PendingInbound(대기>0)만 집계.
 * 행별 압력·사이즈·품번/명칭·대기수량 수정 · 입고완료 · 대기 취소 · 되돌리기.
 */
export async function PendingPressureStats({
  err,
  ok,
}: {
  err?: string;
  ok?: string;
}) {
  const [{ stats, skuTotal, qtyTotal, items, clientReady }, lastBulk, undoByItem] =
    await Promise.all([
      listPendingPressureStats(),
      getLastUndoableBulkReceive(),
      mapUndoableReceiveQtyByItemId(),
    ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-1">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">입고대기 · 압력 통계</h1>
          <p className="mt-1 text-xs text-slate-500">
            행 수정(압력·사이즈·품번/명칭·대기) · 입고완료 · 대기 취소 · 되돌리기
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

      {err ? (
        <p className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {ok}
        </p>
      ) : null}

      {!clientReady ? (
        <p className="rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          PendingInbound Prisma 클라이언트가 없습니다. 로컬에서{' '}
          <code className="text-amber-200">npx prisma generate && npx prisma db push</code> 후
          서버를 재시작하세요.
        </p>
      ) : null}

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

      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
        <form action={receiveAllPendingInboundAction}>
          <input type="hidden" name="returnTo" value="/stock/pending/stats" />
          <button
            type="submit"
            disabled={skuTotal === 0}
            className="inline-flex min-h-9 items-center rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            전체입고완료
          </button>
        </form>
        <form action={undoLastBulkReceiveAction}>
          <input type="hidden" name="returnTo" value="/stock/pending/stats" />
          <button
            type="submit"
            disabled={!lastBulk}
            className="inline-flex min-h-9 items-center rounded-md border border-amber-700/70 bg-amber-950/40 px-3 text-xs font-semibold text-amber-100 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              lastBulk
                ? `마지막 전체입고 ${lastBulk.itemCount}품번 · +${lastBulk.qtyTotal}`
                : '되돌릴 전체입고 없음'
            }
          >
            한 단계 되돌리기
          </button>
        </form>
        {lastBulk ? (
          <span className="text-[11px] text-slate-500">
            마지막 전체입고 {lastBulk.itemCount}품번 · +{lastBulk.qtyTotal.toLocaleString()}
          </span>
        ) : (
          <span className="text-[11px] text-slate-600">되돌릴 전체입고 없음</span>
        )}
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
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/90 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2">압력</th>
                  <th className="px-2 py-2">사이즈</th>
                  <th className="px-2 py-2">품번 / 명칭</th>
                  <th className="px-2 py-2 text-right">대기수량</th>
                  <th className="px-2 py-2">저장</th>
                  <th className="px-2 py-2">입고완료</th>
                  <th className="px-2 py-2">대기 취소</th>
                  <th className="px-2 py-2">되돌리기</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const undoQty = undoByItem.get(it.itemId) || 0;
                  const formId = `pending-edit-${it.itemId}`;
                  return (
                    <tr key={it.itemId} className="border-b border-slate-800/80 align-top">
                      <td className="px-2 py-2">
                        <form id={formId} action={updatePendingStatsRowAction} className="hidden">
                          <input type="hidden" name="itemId" value={it.itemId} />
                          <input type="hidden" name="returnTo" value="/stock/pending/stats" />
                        </form>
                        <input
                          form={formId}
                          name="pressureClass"
                          type="text"
                          defaultValue={it.pressureClass || ''}
                          className={`${wmsControlCompact} w-[7.5rem] text-teal-100`}
                          aria-label={`${it.itemCode} 압력`}
                          required
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          form={formId}
                          name="size"
                          type="text"
                          defaultValue={it.size || ''}
                          className={`${wmsControlCompact} w-20 text-sky-100`}
                          aria-label={`${it.itemCode} 사이즈`}
                          required
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex min-w-[14rem] flex-col gap-1">
                          <input
                            form={formId}
                            name="itemCode"
                            type="text"
                            defaultValue={it.itemCode}
                            className={`${wmsControlCompact} font-mono text-xs text-slate-100`}
                            aria-label={`${it.itemCode} 품번`}
                            required
                          />
                          <input
                            form={formId}
                            name="itemName"
                            type="text"
                            defaultValue={it.itemName || ''}
                            className={`${wmsControlCompact} text-xs text-slate-300`}
                            aria-label={`${it.itemCode} 명칭`}
                            required
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          form={formId}
                          name="quantity"
                          type="number"
                          min={0}
                          defaultValue={it.quantity}
                          className={`${wmsControlCompact} w-20 text-right tabular-nums text-amber-200`}
                          aria-label={`${it.itemCode} 대기수량`}
                          required
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          form={formId}
                          type="submit"
                          className="inline-flex min-h-8 items-center rounded-md border border-sky-700 bg-sky-950/40 px-2 text-[11px] font-semibold text-sky-100 hover:border-sky-500"
                          title="압력·사이즈·품번/명칭·대기수량 저장"
                        >
                          저장
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <form
                          action={receivePendingInboundAction}
                          className="flex min-w-[8.5rem] flex-wrap items-center gap-1"
                        >
                          <input type="hidden" name="itemId" value={it.itemId} />
                          <input type="hidden" name="returnTo" value="/stock/pending/stats" />
                          <input
                            name="quantity"
                            type="number"
                            min={1}
                            max={it.quantity}
                            defaultValue={it.quantity}
                            className={`${wmsControlCompact} w-16`}
                            aria-label={`${it.itemCode} 입고 수량`}
                          />
                          <button
                            type="submit"
                            className="inline-flex min-h-8 items-center rounded-md bg-emerald-800 px-2 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            입고완료
                          </button>
                        </form>
                      </td>
                      <td className="px-2 py-2">
                        <form action={clearPendingInboundAction} className="inline-flex">
                          <input type="hidden" name="itemId" value={it.itemId} />
                          <input type="hidden" name="returnTo" value="/stock/pending/stats" />
                          <button
                            type="submit"
                            className="inline-flex min-h-8 items-center rounded-md border border-slate-600 px-2 text-[11px] font-semibold text-slate-300 hover:border-red-700 hover:text-red-200"
                            title="대기 취소(재고 변동 없음) — 이 행 대기 수량 삭제"
                          >
                            대기 취소
                          </button>
                        </form>
                      </td>
                      <td className="px-2 py-2">
                        {undoQty > 0 ? (
                          <form action={undoLastPendingReceiveAction} className="inline-flex">
                            <input type="hidden" name="itemId" value={it.itemId} />
                            <input type="hidden" name="returnTo" value="/stock/pending/stats" />
                            <button
                              type="submit"
                              className="inline-flex min-h-8 items-center rounded-md border border-amber-700/70 bg-amber-950/30 px-2 text-[11px] font-semibold text-amber-100 hover:border-amber-500"
                              title={`최근 입고완료 ${undoQty} 되돌리기 → 대기로 복원`}
                            >
                              전 단계 되돌리기
                            </button>
                          </form>
                        ) : (
                          <span className="text-[11px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
