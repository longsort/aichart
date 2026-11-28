import { PendingPressureStats } from '@/components/wms/pending-pressure-stats';

type Search = {
  err?: string;
  ok?: string;
};

/**
 * 입고대기 압력 통계 — 새 창/팝업용.
 * DB PendingInbound(대기>0)만 집계 (전체 미입고 SKU 아님).
 * 전체입고완료 · 품번별 입고완료 · 한 단계 되돌리기.
 */
export default async function StockPendingPressureStatsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';

  return (
    <div className="pending-stats-popup">
      <PendingPressureStats err={err || undefined} ok={ok || undefined} />
    </div>
  );
}
