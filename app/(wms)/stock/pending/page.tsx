import Link from 'next/link';
import { WmsPageHeader } from '@/components/wms/wms-shell';
import { quickStockInAction } from '@/lib/wms/actions/sku-quick';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import { listSkuBoard } from '@/lib/wms/sku-board';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';

type Search = {
  err?: string;
  ok?: string;
  pressure?: string;
  q?: string;
};

/**
 * 입고대기 — 보유 0(미입고) SKU 목록.
 * 「입고완료」= StockMove(IN)으로 해당 SKU 보유 증가.
 */
export default async function StockPendingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const pressure = (sp.pressure || '').trim();
  const q = (sp.q || '').trim();
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';

  const board = await listSkuBoard({
    pressureClass: pressure || undefined,
    q: q || undefined,
    band: 'empty',
  });

  return (
    <>
      <WmsPageHeader
        title="입고대기"
        subtitle="보유 0 = 미입고 · 「입고완료」클릭 시 StockMove(입고)로 보유 증가"
      />
      {err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{err}</p>
      ) : null}
      {ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {ok}
        </p>
      ) : null}

      <section className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>
          미입고 SKU <strong className="text-slate-100">{board.skuCount.toLocaleString()}</strong>
        </span>
        <Link href="/dashboard?band=empty" className="text-teal-300 underline-offset-2 hover:underline">
          압력등급별 구성(새 창용 URL)
        </Link>
        <Link href="/dashboard" className="text-slate-400 underline-offset-2 hover:underline">
          재고현황
        </Link>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">압력</th>
              <th className="px-3 py-2">사이즈</th>
              <th className="px-3 py-2">품번 / 명칭</th>
              <th className="px-3 py-2 text-right">보유</th>
              <th className="px-3 py-2">입고완료</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80 align-top">
                <td className="px-3 py-2 font-medium text-teal-200">
                  {catalogPressureChipLabel(r.pressureClass) || r.pressureClass || '—'}
                </td>
                <td className="px-3 py-2 text-slate-200">{r.size || '—'}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-100">{r.itemCode}</div>
                  <div className="text-xs text-slate-400">{r.itemName}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">0</td>
                <td className="px-3 py-2">
                  <form action={quickStockInAction} className="flex min-w-[10rem] flex-wrap items-center gap-2">
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="returnTo" value="/stock/pending" />
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      defaultValue={1}
                      className={wmsControlCompact}
                      aria-label={`${r.itemCode} 입고수량`}
                      required
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-teal-700 bg-teal-900/50 px-3 text-xs font-semibold text-teal-100 hover:border-teal-500"
                    >
                      입고완료
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {board.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">미입고(보유 0) SKU가 없습니다.</p>
        ) : null}
      </section>
    </>
  );
}
