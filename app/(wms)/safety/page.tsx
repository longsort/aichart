import Link from 'next/link';
import { getBelowSafetyItems } from '@/lib/wms/queries';
import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import { MaterialBadge } from '@/components/wms/material-badge';

/** 안전재고 부족 경고 전용 화면 */
export default async function SafetyPage() {
  const low = await getBelowSafetyItems();

  return (
    <>
      <WmsPageHeader title="안전재고 부족" subtitle="품목별 LOT 수량 합 &lt; 안전재고" />
      <WmsCard>
        {low.length === 0 ? (
          <p className="text-sm text-emerald-400">미달 품목이 없습니다.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {low.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-2 border-b border-slate-800 py-2 last:border-0">
                <span className="rounded bg-red-950 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">부족</span>
                <MaterialBadge type={it.materialType} />
                <Link href={`/items/${it.id}`} className="font-mono font-semibold text-teal-300 underline">
                  {it.itemCode}
                </Link>
                <span className="text-slate-300">{it.itemName}</span>
                <span className="text-slate-500">
                  현재 {it.totalQty} / 안전 {it.safetyStock}
                </span>
              </li>
            ))}
          </ul>
        )}
      </WmsCard>
    </>
  );
}
