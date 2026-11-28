import { WmsPageHeader } from '@/components/wms/wms-shell';
import { MopiHoleBoard } from '@/components/wms/mopi-hole-board';
import { listMopiHoleWaitRows } from '@/lib/wms/mopi-queries';
import { itemMatchesFaceFilter, parseFaceFilter } from '@/lib/wms/flange-face';
import { requireInventoryAuth } from '@/lib/wms/requireInventoryAuth';

type Search = { err?: string; ok?: string; face?: string };

/** 홀가공대기 — 홀가공완료 → 완성품 SKU 재고 합류 */
export default async function MopiHolePage({ searchParams }: { searchParams: Promise<Search> }) {
  requireInventoryAuth();
  const sp = await searchParams;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';
  const face = parseFaceFilter(sp.face);
  const all = await listMopiHoleWaitRows();
  const rows = all.filter((r) => itemMatchesFaceFilter(r, face));

  return (
    <>
      <WmsPageHeader
        title="홀가공대기"
        subtitle="홀가공완료 시 대응 304 완성품 OPEN LOT에 합류"
      />
      {err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{err}</p>
      ) : null}
      {ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {ok}
        </p>
      ) : null}
      <MopiHoleBoard rows={rows} />
    </>
  );
}
