import Link from 'next/link';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { listItems } from '@/lib/wms/actions/items';
import { prisma } from '@/lib/prisma';
import { ItemCreateForm } from '@/components/wms/forms/item-create-form';
import { MaterialBadge } from '@/components/wms/material-badge';
import { ItemDeactivateButton } from '@/components/wms/forms/item-deactivate-button';
import { PRODUCT_TYPES } from '@/lib/wms/codes';
import { wmsControl, wmsLabel, wmsControlCompact } from '@/components/wms/wms-form-styles';

type Search = { material?: string; productType?: string; q?: string; err?: string };

/** 품목 마스터 — 필터·등록·안전재고 배지 */
export default async function ItemsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const material = sp.material || 'ALL';
  const productType = sp.productType || 'ALL';
  const q = sp.q || '';
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const [items, locations] = await Promise.all([
    listItems({ material, productType, q }),
    prisma.location.findMany({ orderBy: { zone: 'asc' } }),
  ]);

  return (
    <>
      <WmsPageHeader title="품목 마스터" subtitle="등록·수정·비활성 · 재질·제품타입 필터" />
      {err ? <p className="mb-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1 text-xs text-red-300">{err}</p> : null}
      <WmsCard title="필터" className="mb-3">
        <form className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end" method="get">
          <label className="flex min-w-0 flex-col gap-1.5 sm:w-40">
            <span className={wmsLabel}>재질</span>
            <select name="material" defaultValue={material} className={wmsControlCompact}>
              <option value="ALL">전체</option>
              <option value="SCS304">SCS304</option>
              <option value="SCS316">SCS316</option>
              <option value="SEMI_RAW">毛皮 반제품</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 sm:min-w-[11rem]">
            <span className={wmsLabel}>제품타입</span>
            <select name="productType" defaultValue={productType} className={wmsControlCompact}>
              <option value="ALL">전체</option>
              {PRODUCT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 w-full flex-col gap-1.5 sm:min-w-[14rem] sm:flex-1">
            <span className={wmsLabel}>규격·구경·코드 검색</span>
            <input name="q" defaultValue={q} placeholder="검색" className={wmsControlCompact} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="inline-flex min-h-[2.4rem] items-center rounded-md bg-teal-800 px-4 text-sm font-medium text-white hover:bg-teal-700">
              적용
            </button>
            <Link
              href="/items"
              className="inline-flex min-h-[2.4rem] items-center rounded-md border border-slate-500 px-4 text-sm text-slate-200 hover:bg-slate-800"
            >
              초기화
            </Link>
          </div>
        </form>
      </WmsCard>

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/80 text-xs font-medium uppercase tracking-wide text-slate-300">
              <th className="p-2">코드</th>
              <th className="p-2">명칭</th>
              <th className="p-2">재질</th>
              <th className="p-2">타입</th>
              <th className="p-2">규격/사이즈</th>
              <th className="p-2 text-right">총재고</th>
              <th className="p-2 text-right">안전</th>
              <th className="p-2">상태</th>
              <th className="p-2 w-24">작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-slate-800/80">
                <td className="p-2 font-mono text-teal-200/90">{it.itemCode}</td>
                <td className="p-2 text-slate-200">{it.itemName}</td>
                <td className="p-2">
                  <MaterialBadge type={it.materialType} />
                </td>
                <td className="p-2 text-slate-400">{it.productType}</td>
                <td className="p-2 text-slate-500">
                  {it.standard} / {it.size}
                </td>
                <td className="p-2 text-right">
                  <span className={it.belowSafety ? 'font-semibold text-red-400' : 'text-slate-200'}>{it.totalQty}</span>
                  {it.belowSafety ? (
                    <span className="ml-1 rounded bg-red-950 px-1 text-[9px] text-red-200">부족</span>
                  ) : (
                    <span className="ml-1 text-[9px] text-emerald-400">정상</span>
                  )}
                </td>
                <td className="p-2 text-right text-slate-400">{it.safetyStock}</td>
                <td className="p-2">{it.isActive ? <span className="text-emerald-500">사용</span> : <span className="text-slate-600">중지</span>}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <Link href={`/items/${it.id}`} className="inline-flex min-h-[2rem] items-center rounded-md bg-slate-800 px-2.5 text-xs font-medium text-teal-300 hover:bg-slate-700">
                      수정
                    </Link>
                    {it.isActive ? <ItemDeactivateButton itemId={it.id} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WmsCard title="신규 품목 등록" className="mt-4">
        <ItemCreateForm locations={locations} />
      </WmsCard>
    </>
  );
}
