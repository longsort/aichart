import { WmsPageHeader } from '@/components/wms/wms-shell';
import { SkuStockBoard } from '@/components/wms/sku-stock-board';
import { parseMaterialFilter } from '@/lib/wms/material';
import { getSkuFilterOptions, listSkuBoard } from '@/lib/wms/sku-board';
import type { StockAlertBand } from '@/lib/wms/stock-alerts';

type Search = {
  pressure?: string;
  size?: string;
  q?: string;
  material?: string;
  shortage?: string;
  band?: string;
  /** sizes = 전체 재고 사이즈별 수량 패널 */
  panel?: string;
  page?: string;
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
  const material = parseMaterialFilter(sp.material);
  const shortageOnly = sp.shortage === '1' || sp.shortage === 'true';
  const band = parseBand(sp.band);
  const panel = (sp.panel || '').trim().toLowerCase() === 'sizes' ? 'sizes' : undefined;
  const pageRaw = Number(sp.page || 1);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const err = sp.err ? decodeURIComponent(sp.err) : '';
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : '';

  const [board, opts] = await Promise.all([
    listSkuBoard({
      pressureClass: pressure === 'ALL' ? undefined : pressure,
      size: size === 'ALL' ? undefined : size,
      q: q || undefined,
      material,
      shortageOnly: band ? false : shortageOnly,
      band,
      // 사이즈별 패널은 25행만 필요 — 1313 SKU 표/폼 RSC·DOM 동결 방지
      omitDetailRows: panel === 'sizes',
      page: panel === 'sizes' ? 1 : page,
    }),
    getSkuFilterOptions(),
  ]);

  return (
    <>
      <WmsPageHeader
        title="재고현황"
        subtitle="보유 수량 직접 저장(ADJUST) · 304/316 재질 분리 · 칩/밴드/합계 동기 · 입고/출고 원장"
      />
      <SkuStockBoard
        rows={board.rows}
        previewRows={board.previewRows}
        pressures={opts.pressures}
        sizes={opts.sizes}
        pressure={pressure}
        size={size}
        q={q}
        material={material}
        overallTotal={board.overallTotal}
        filteredTotal={board.filteredTotal}
        skuCount={board.skuCount}
        page={board.page}
        pageSize={board.pageSize}
        totalPages={board.totalPages}
        bandCounts={board.bandCounts}
        bandPressureBreakdown={board.bandPressureBreakdown}
        activeBand={band}
        activePanel={panel}
        pressureTotals={board.pressureTotals}
        sizeTotals={board.sizeTotals}
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
