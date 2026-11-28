import { WmsPageHeader } from '@/components/wms/wms-shell';
import { MopiMachiningBoard } from '@/components/wms/mopi-machining-board';
import { listMopiMachiningWaitRows } from '@/lib/wms/mopi-queries';
import { requireInventoryAuth } from '@/lib/wms/requireInventoryAuth';

type Search = { err?: string; ok?: string };

/** 가공대기 — 입고된 모피 · 가공완료 → 홀가공대기 */
export default async function MopiMachiningPage({ searchParams }: { searchParams: Promise<Search> }) {
  requireInventoryAuth();
  const sp = await searchParams;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';
  const rows = await listMopiMachiningWaitRows();

  return (
    <>
      <WmsPageHeader
        title="가공대기"
        subtitle="모피 재고 → 가공완료 시 홀가공대기로 이동 (완성품은 홀가공완료 때 합류)"
      />
      {err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{err}</p>
      ) : null}
      {ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {ok}
        </p>
      ) : null}
      <MopiMachiningBoard rows={rows} />
    </>
  );
}
