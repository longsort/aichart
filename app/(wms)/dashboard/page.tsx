import { WmsPageHeader } from '@/components/wms/wms-shell';
import { SkuStockBoard } from '@/components/wms/sku-stock-board';
import { getSkuFilterOptions, listSkuBoard } from '@/lib/wms/sku-board';
import type { StockAlertBand } from '@/lib/wms/stock-alerts';

type Search = {
  pressure?: string;
  size?: string;
  q?: string;
  shortage?: string;
  band?: string;
  err?: string;
  ok?: string;
};

function parseBand(raw?: string): StockAlertBand | undefined {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'empty' || v === 'critical' || v === 'warn' || v === 'ok') return v;
  return undefined;
}

/**
 * 재고 홈 — 압력·사이즈 필터 + SKU 보유(경보색) + 신규/입고/출고(원장).
 * 차트·분석 엔진 UI가 아님.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const pressure = (sp.pressure || 'ALL').trim() || 'ALL';
  const size = (sp.size || 'ALL').trim() || 'ALL';
  const q = (sp.q || '').trim();
  const shortageOnly = sp.shortage === '1' || sp.shortage === 'true';
  const band = parseBand(sp.band);
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : '';

  const [board, opts] = await Promise.all([
    listSkuBoard({
      pressureClass: pressure === 'ALL' ? undefined : pressure,
      size: size === 'ALL' ? undefined : size,
      q: q || undefined,
      shortageOnly: band ? false : shortageOnly,
      band,
    }),
    getSkuFilterOptions(),
  ]);

  return (
    <>
      <WmsPageHeader
        title="재고현황"
        subtitle="보유 수량 직접 저장(ADJUST) · 긴급/주의 기준 편집 · 칩/밴드/합계 동기 · 입고/출고 원장"
      />
      <SkuStockBoard
        rows={board.rows}
        pressures={opts.pressures}
        sizes={opts.sizes}
        pressure={pressure}
        size={size}
        overallTotal={board.overallTotal}
        filteredTotal={board.filteredTotal}
        skuCount={board.skuCount}
        bandCounts={board.bandCounts}
        bandPressureBreakdown={board.bandPressureBreakdown}
        activeBand={band}
        pressureTotals={board.pressureTotals}
        shortageOnly={shortageOnly}
        pressureLabels={opts.pressureLabels}
        globalCriticalBelow={board.thresholds.criticalBelowSku}
        globalWarnBelow={board.thresholds.warnBelowSku}
        err={err || undefined}
        ok={okMsg || undefined}
      />
    </>
  );
}
