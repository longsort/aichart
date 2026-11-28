import Link from 'next/link';
import { WmsPageHeader } from '@/components/wms/wms-shell';
import { StockPendingBoard } from '@/components/wms/stock-pending-board';
import { parseMaterialFilter } from '@/lib/wms/material';
import { parseFaceFilter } from '@/lib/wms/flange-face';
import { parseSkuSortMode } from '@/lib/wms/sku-list-sort';
import { mapPendingQtyByItemId, mapUndoableReceiveQtyByItemId } from '@/lib/wms/pending-inbound';
import { listSkuBoard } from '@/lib/wms/sku-board';
import { requireInventoryAuth } from '@/lib/wms/requireInventoryAuth';

type Search = {
  err?: string;
  ok?: string;
  material?: string;
  face?: string;
  sort?: string;
};

/**
 * 입고대기 — 보유 0(미입고) SKU 목록.
 * 칩=같은 페이지 필터 · 「대기 저장」=PendingInbound(DB) · 「입고완료」=대기→StockMove(IN).
 */
export default async function StockPendingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';
  const material = parseMaterialFilter(sp.material);
  const face = parseFaceFilter(sp.face);
  const sort = parseSkuSortMode(sp.sort);
  const auth = requireInventoryAuth();

  const [board, pendingMap, undoMap] = await Promise.all([
    // unpaged 전체 — 미입고·대기·최근 입고(되돌리기) 행을 필터
    listSkuBoard({ unpaged: true, material, face }),
    mapPendingQtyByItemId(),
    mapUndoableReceiveQtyByItemId(),
  ]);

  const rows = board.rows
    .map((r) => ({
      id: r.id,
      itemCode: r.itemCode,
      itemName: r.itemName,
      pressureClass: r.pressureClass,
      size: r.size,
      materialType: r.materialType,
      locationName: r.locationName,
      onHand: r.onHand,
      pendingQty: pendingMap.get(r.id) ?? 0,
      undoableQty: undoMap.get(r.id) ?? 0,
    }))
    .filter((r) => r.onHand === 0 || r.pendingQty > 0 || r.undoableQty > 0);

  return (
    <>
      <WmsPageHeader
        title="입고대기"
        subtitle="수량→대기 저장(DB) · 304/316 재질 분리 · 공장 도착 후 입고완료 · 칩=같은 페이지 필터"
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
        <Link
          href={
            material === 'ALL'
              ? '/dashboard?band=empty'
              : `/dashboard?band=empty&material=${material}`
          }
          className="text-teal-300 underline-offset-2 hover:underline"
        >
          미입고 전체(대시보드 밴드)
        </Link>
        <span className="text-slate-600">·</span>
        <span className="text-slate-500">
          대기 수량은 DB(PendingInbound) — 보유와 분리 · 압력 통계=대기 수량 기준
        </span>
      </section>

      <StockPendingBoard
        rows={rows}
        userName={auth.user}
        material={material}
        face={face}
        sort={sort}
      />
    </>
  );
}
