import { PendingPressureStats } from '@/components/wms/pending-pressure-stats';

/**
 * 입고대기 압력 통계 — 새 창/팝업용.
 * 사용자가 담은 대기열만 집계 (전체 미입고 SKU 아님).
 */
export default function StockPendingPressureStatsPage() {
  return (
    <div className="pending-stats-popup">
      <PendingPressureStats />
    </div>
  );
}
