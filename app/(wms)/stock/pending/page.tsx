import Link from 'next/link';
import { WmsPageHeader } from '@/components/wms/wms-shell';
import { StockPendingBoard } from '@/components/wms/stock-pending-board';
import { listSkuBoard } from '@/lib/wms/sku-board';
import { requireInventoryAuth } from '@/lib/wms/requireInventoryAuth';

type Search = {
  err?: string;
  ok?: string;
};

/**
 * 입고대기 — 보유 0(미입고) SKU 목록.
 * 헤더에 압력별 전체 통계(클릭=필터) · 「입고완료」= StockMove(IN).
 */
export default async function StockPendingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';
  const auth = requireInventoryAuth();

  const board = await listSkuBoard({ band: 'empty' });

  const rows = board.rows.map((r) => ({
    id: r.id,
    itemCode: r.itemCode,
    itemName: r.itemName,
    pressureClass: r.pressureClass,
    size: r.size,
  }));

  return (
    <>
      <WmsPageHeader
        title="입고대기"
        subtitle="헤더 압력 통계 클릭=필터 · 검색 · 「입고완료」= StockMove(입고)"
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
        <Link href="/dashboard?band=empty" className="text-teal-300 underline-offset-2 hover:underline">
          압력등급별 구성(대시보드)
        </Link>
      </section>

      <StockPendingBoard rows={rows} userName={auth.user} />
    </>
  );
}
