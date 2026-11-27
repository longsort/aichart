import { WmsPageHeader } from '@/components/wms/wms-shell';
import { SkuStockBoard } from '@/components/wms/sku-stock-board';
import { getSkuFilterOptions, listSkuBoard } from '@/lib/wms/sku-board';

type Search = {
  pressure?: string;
  size?: string;
  q?: string;
  shortage?: string;
  err?: string;
  ok?: string;
};

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
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const ok = sp.ok ? decodeURIComponent(sp.ok) : '';

  const [board, opts] = await Promise.all([
    listSkuBoard({
      pressureClass: pressure === 'ALL' ? undefined : pressure,
      size: size === 'ALL' ? undefined : size,
      q: q || undefined,
      shortageOnly,
    }),
    getSkuFilterOptions(),
  ]);

  return (
    <>
      <WmsPageHeader
        title="재고현황"
        subtitle="압력·사이즈 필터 · 보유 색(긴급/주의/정상) · 신규/입고/출고는 원장(StockMove)"
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
        pressureTotals={board.pressureTotals}
        shortageOnly={shortageOnly}
        pressureLabels={opts.pressureLabels}
        err={err || undefined}
        ok={ok || undefined}
      />
    </>
  );
}
