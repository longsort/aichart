import Link from 'next/link';
import { WmsPageHeader } from '@/components/wms/wms-shell';
import { StockPendingBoard } from '@/components/wms/stock-pending-board';
import { listSkuBoard } from '@/lib/wms/sku-board';
import { mapPendingQtyByItemId } from '@/lib/wms/pending-inbound';
import { requireInventoryAuth } from '@/lib/wms/requireInventoryAuth';

type Search = { err?: string; ok?: string };

/** 모피 입고대기 — 미강품 대기 저장 · 입고완료 → 가공대기 */
export default async function MopiPendingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';
  const auth = requireInventoryAuth();

  const [board, pendingMap] = await Promise.all([
    // 모피 전 카탈로그(보유 0 포함) — 대기 수량 입력용
    listSkuBoard({ kind: 'mopi', unpaged: true }),
    mapPendingQtyByItemId(),
  ]);

  const rows = board.rows.map((r) => ({
    id: r.id,
    itemCode: r.itemCode,
    itemName: r.itemName,
    pressureClass: r.pressureClass,
    size: r.size,
    materialType: r.materialType,
    locationName: r.locationName,
    onHand: r.onHand,
    pendingQty: pendingMap.get(r.id) ?? 0,
  }));

  return (
    <>
      <WmsPageHeader
        title="모피 입고대기"
        subtitle="미강품 · 304 동일 압력×사이즈×규격 · 대기 저장 → 입고완료 → 가공대기"
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
        <span className="font-medium text-slate-300">모피 공정</span>
        <span className="text-teal-300">입고대기</span>
        <span className="text-slate-600">→</span>
        <Link href="/mopi/machining" className="text-slate-400 underline-offset-2 hover:text-teal-200 hover:underline">
          가공대기
        </Link>
        <span className="text-slate-600">→</span>
        <Link href="/mopi/hole" className="text-slate-400 underline-offset-2 hover:text-teal-200 hover:underline">
          홀가공대기
        </Link>
        <span className="text-slate-600">·</span>
        <Link href="/stock/pending" className="text-slate-500 underline-offset-2 hover:underline">
          완성품 입고대기
        </Link>
      </section>

      <StockPendingBoard
        rows={rows}
        userName={auth.user}
        basePath="/mopi/pending"
        showMaterialChips={false}
        showPressureStats={false}
        crumbLabel="모피 입고대기"
      />
    </>
  );
}
