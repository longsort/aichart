import Link from 'next/link';
import { getBelowSafetyItems } from '@/lib/wms/queries';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { MaterialBadge } from '@/components/wms/material-badge';
import { updateSafetyStockAction } from '@/lib/wms/actions/admin-records';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';

type Search = { ok?: string; err?: string };

/** 안전재고 부족 경고 + 안전재고 수치 수정 */
export default async function SafetyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const low = await getBelowSafetyItems();

  return (
    <>
      <WmsPageHeader title="안전재고 부족" subtitle="품목별 LOT 수량 합 &lt; 안전재고 · 행에서 안전재고 수정" />
      {sp.err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {sp.err}
        </p>
      ) : null}
      {sp.ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {sp.ok}
        </p>
      ) : null}
      <WmsCard>
        {low.length === 0 ? (
          <p className="text-sm text-emerald-400">미달 품목이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                  <th className="p-2">품목</th>
                  <th className="p-2">재질</th>
                  <th className="p-2 text-right">현재</th>
                  <th className="p-2">안전재고 수정</th>
                  <th className="p-2">링크</th>
                </tr>
              </thead>
              <tbody>
                {low.map((it) => (
                  <tr key={it.id} className="border-b border-slate-800/80">
                    <td className="p-2">
                      <span className="mr-1 rounded bg-red-950 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">
                        부족
                      </span>
                      <span className="font-mono text-slate-200">{it.itemCode}</span>
                      <div className="text-xs text-slate-400">{it.itemName}</div>
                    </td>
                    <td className="p-2">
                      <MaterialBadge type={it.materialType} />
                    </td>
                    <td className="p-2 text-right tabular-nums text-amber-200">{it.totalQty}</td>
                    <td className="p-2">
                      <form action={updateSafetyStockAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={it.id} />
                        <input type="hidden" name="returnTo" value="/safety" />
                        <input
                          name="safetyStock"
                          type="number"
                          min={0}
                          defaultValue={it.safetyStock}
                          className={`${wmsControlCompact} w-24`}
                          aria-label={`${it.itemCode} 안전재고`}
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-8 items-center rounded-md bg-teal-800 px-2 text-[11px] font-semibold text-white hover:bg-teal-700"
                        >
                          수정
                        </button>
                      </form>
                    </td>
                    <td className="p-2">
                      <Link href={`/items/${it.id}`} className="text-xs text-teal-400 underline">
                        품목
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WmsCard>
    </>
  );
}
