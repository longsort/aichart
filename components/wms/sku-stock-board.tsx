import Link from 'next/link';
import {
  quickCreateSkuAction,
  quickSetOnHandAction,
  quickStockInAction,
  quickStockOutAction,
  quickUpdateSkuAlertAction,
} from '@/lib/wms/actions/sku-quick';
import { quickSaveDashboardGlobalThresholdsAction } from '@/lib/wms/actions/stock-alerts';
import { PRODUCT_TYPES, PRESSURE_CLASSES, NOMINAL_SIZES } from '@/lib/wms/codes';
import {
  YUIL_CATALOG_PRESSURE_CHIPS,
  catalogPressureChipLabel,
  catalogPressureChipTitle,
  getCatalogPressureChip,
} from '@/lib/wms/yuil-catalog-filters';
import type {
  BandCounts,
  BandPressureBreakdown,
  SizeOnHandTotal,
  SkuBoardRow,
} from '@/lib/wms/sku-board';
import { bandLabelKo, bandTextClass, type StockAlertBand } from '@/lib/wms/stock-alerts';
import { wmsControlCompact, wmsLabel } from '@/components/wms/wms-form-styles';
import { PressureOpenChip } from '@/components/wms/pressure-open-chip';
import { BandSummaryOpenCard } from '@/components/wms/band-summary-open-card';
import { MaterialFilterChips } from '@/components/wms/material-filter-chips';
import { FaceFilterChips } from '@/components/wms/face-filter-chips';
import { SkuIdentityCells, SkuIdentityHeaders } from '@/components/wms/sku-identity-cells';
import type { MaterialFilter } from '@/lib/wms/material';
import type { FaceFilter } from '@/lib/wms/flange-face';

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-9 max-w-full items-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white'
    : 'inline-flex min-h-9 max-w-full items-center rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

function buildHref(
  pressure: string,
  size: string,
  extra?: Record<string, string | undefined>,
) {
  const sp = new URLSearchParams();
  if (pressure && pressure !== 'ALL') sp.set('pressure', pressure);
  if (size && size !== 'ALL') sp.set('size', size);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
    }
  }
  const q = sp.toString();
  return q ? `/dashboard?${q}` : '/dashboard';
}

/** 밴드 요약 표 상한 — 전체 SKU 표와 별도 (동결 방지) */
const BAND_PANEL_ROW_CAP = 60;

export function SkuStockBoard({
  rows,
  previewRows,
  pressures,
  sizes,
  pressure,
  size,
  q = '',
  material = 'ALL',
  face = 'ALL',
  overallTotal,
  filteredTotal,
  skuCount,
  page = 1,
  pageSize = 80,
  totalPages = 1,
  bandCounts,
  bandPressureBreakdown,
  activeBand,
  activePanel,
  pressureTotals,
  sizeTotals,
  shortageOnly,
  pressureLabels,
  globalCriticalBelow,
  globalWarnBelow,
  err,
  ok,
}: {
  rows: SkuBoardRow[];
  /** 밴드 요약 미리보기 (페이지와 무관, 상한) */
  previewRows?: SkuBoardRow[];
  pressures: string[];
  sizes: string[];
  pressure: string;
  size: string;
  /** 빠른찾기 (압력·사이즈·품번) — URL ?q= */
  q?: string;
  /** 재질 필터 — URL ?material= */
  material?: MaterialFilter;
  /** 면·형식 필터 — URL ?face= */
  face?: FaceFilter;
  overallTotal: number;
  filteredTotal: number;
  skuCount: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  bandCounts: BandCounts;
  bandPressureBreakdown: BandPressureBreakdown;
  activeBand?: StockAlertBand;
  /** sizes = 전체 재고 사이즈별 수량 */
  activePanel?: 'sizes';
  pressureTotals: Record<string, number>;
  sizeTotals: SizeOnHandTotal[];
  shortageOnly: boolean;
  pressureLabels?: Record<string, string>;
  /** 전역 긴급/주의 (카드에서 편집) */
  globalCriticalBelow: number;
  globalWarnBelow: number;
  err?: string;
  ok?: string;
}) {
  const catalogKeys = YUIL_CATALOG_PRESSURE_CHIPS.map((c) => c.key);
  const catalogSet = new Set(catalogKeys);
  const pressureOpts = pressures.length ? pressures : [...PRESSURE_CLASSES];
  const allPressureKeys = [
    ...catalogKeys,
    ...pressureOpts.filter((p) => !catalogSet.has(p)),
  ];
  const ratingKeys = allPressureKeys.filter((k) => getCatalogPressureChip(k)?.group !== 'product');
  const productKeys = allPressureKeys.filter((k) => getCatalogPressureChip(k)?.group === 'product');
  const sizeOpts = sizes.length ? sizes : [...NOMINAL_SIZES];
  const searchQ = (q || '').trim();
  const materialExtra =
    material && material !== 'ALL' ? { material } : ({} as Record<string, string | undefined>);
  const faceExtra = face && face !== 'ALL' ? { face } : ({} as Record<string, string | undefined>);

  const shortageExtra = shortageOnly ? { shortage: '1' } : undefined;
  const chipExtra = { ...materialExtra, ...faceExtra, ...shortageExtra };
  const activeBreakdown = activeBand ? bandPressureBreakdown[activeBand] : [];
  const activeBandTotal = activeBand ? bandCounts[activeBand] : 0;
  const bandSource = previewRows && previewRows.length ? previewRows : rows;
  const bandListRows = activeBand ? bandSource.slice(0, BAND_PANEL_ROW_CAP) : [];
  const bandListOmitted = activeBand ? Math.max(0, activeBandTotal - bandListRows.length) : 0;
  const sizesPanelOnly = activePanel === 'sizes';
  // 페이지 이동만 검색어 유지 — 압력/사이즈 칩 클릭은 q 미포함(초기화); 재질은 유지
  const pageHref = (p: number) =>
    buildHref(pressure, size, {
      ...chipExtra,
      ...(activeBand ? { band: activeBand } : {}),
      ...(searchQ ? { q: searchQ } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    });
  const materialHref = (m: MaterialFilter) =>
    buildHref(pressure, size, {
      ...(m !== 'ALL' ? { material: m } : {}),
      ...faceExtra,
      ...shortageExtra,
      ...(activeBand ? { band: activeBand } : {}),
      ...(activePanel === 'sizes' ? { panel: 'sizes' } : {}),
    });
  const faceHref = (f: FaceFilter) =>
    buildHref(pressure, size, {
      ...materialExtra,
      ...(f !== 'ALL' ? { face: f } : {}),
      ...shortageExtra,
      ...(activeBand ? { band: activeBand } : {}),
      ...(activePanel === 'sizes' ? { panel: 'sizes' } : {}),
    });
  const bandCardClass = (band: StockAlertBand, base: string) =>
    `${base} block transition hover:ring-2 hover:ring-teal-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 ${
      activeBand === band ? 'ring-2 ring-teal-500/70' : ''
    }`;

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{err}</p>
      ) : null}
      {ok ? (
        <p className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{ok}</p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <BandSummaryOpenCard
          href={buildHref('ALL', 'ALL', { ...materialExtra, panel: 'sizes' })}
          className={`rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 transition hover:ring-2 hover:ring-teal-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 ${
            activePanel === 'sizes' ? 'ring-2 ring-teal-500/70' : ''
          }`}
          title="사이즈별 보유 수량 — 새 창"
        >
          <div className="text-xs text-slate-400">전체 재고 합계 · 클릭=사이즈별</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-teal-300">{overallTotal.toLocaleString()}</div>
        </BandSummaryOpenCard>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3">
          <div className="text-xs text-slate-400">필터 재고 합계</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-sky-300">{filteredTotal.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3">
          <div className="text-xs text-slate-400">표시 SKU</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{skuCount.toLocaleString()}</div>
        </div>
        <BandSummaryOpenCard
          href={buildHref(pressure, size, { ...materialExtra, band: 'empty' })}
          className={bandCardClass('empty', 'rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3')}
          title="미입고(0) SKU — 품명/사이즈/보유 새 창"
        >
          <div className="text-xs text-slate-400">미입고 · 클릭=새 창</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-200">
            {(bandCounts.empty ?? 0).toLocaleString()}
          </div>
        </BandSummaryOpenCard>
        <div
          className={bandCardClass(
            'critical',
            'rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3',
          )}
        >
          <BandSummaryOpenCard
            href={buildHref(pressure, size, { ...materialExtra, band: 'critical' })}
            className="block"
            title="긴급 SKU — 품명/사이즈/보유 새 창"
          >
            <div className="text-xs text-red-300/80">긴급 · 클릭=새 창</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-red-400">
              {bandCounts.critical.toLocaleString()}
            </div>
          </BandSummaryOpenCard>
          <form
            action={quickSaveDashboardGlobalThresholdsAction}
            className="mt-2 flex flex-wrap items-end gap-1.5 border-t border-red-900/40 pt-2"
          >
            <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
            <input type="hidden" name="size" value={size === 'ALL' ? '' : size} />
            {shortageOnly ? <input type="hidden" name="shortage" value="1" /> : null}
            {activeBand ? <input type="hidden" name="band" value={activeBand} /> : null}
            <input type="hidden" name="warnBelowSku" value={globalWarnBelow} />
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] text-red-300/70">긴급 &lt;</span>
              <input
                name="criticalBelowSku"
                type="number"
                min={0}
                defaultValue={globalCriticalBelow}
                required
                className={`${wmsControlCompact} w-20 border-red-900/50 bg-red-950/40 text-red-100`}
                aria-label="전역 긴급 기준"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-8 items-center rounded-md bg-red-900/80 px-2 text-[11px] font-semibold text-red-50 hover:bg-red-800"
            >
              적용
            </button>
          </form>
        </div>
        <div
          className={bandCardClass('warn', 'rounded-lg border border-amber-900/60 bg-amber-950/25 px-4 py-3')}
        >
          <BandSummaryOpenCard
            href={buildHref(pressure, size, { ...materialExtra, band: 'warn' })}
            className="block"
            title="주의 SKU — 품명/사이즈/보유 새 창"
          >
            <div className="text-xs text-amber-200/80">주의 · 클릭=새 창</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-amber-300">
              {bandCounts.warn.toLocaleString()}
            </div>
          </BandSummaryOpenCard>
          <form
            action={quickSaveDashboardGlobalThresholdsAction}
            className="mt-2 flex flex-wrap items-end gap-1.5 border-t border-amber-900/40 pt-2"
          >
            <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
            <input type="hidden" name="size" value={size === 'ALL' ? '' : size} />
            {shortageOnly ? <input type="hidden" name="shortage" value="1" /> : null}
            {activeBand ? <input type="hidden" name="band" value={activeBand} /> : null}
            <input type="hidden" name="criticalBelowSku" value={globalCriticalBelow} />
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] text-amber-200/70">주의 &lt;</span>
              <input
                name="warnBelowSku"
                type="number"
                min={0}
                defaultValue={globalWarnBelow}
                required
                className={`${wmsControlCompact} w-20 border-amber-900/50 bg-amber-950/40 text-amber-100`}
                aria-label="전역 주의 기준"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-8 items-center rounded-md bg-amber-900/80 px-2 text-[11px] font-semibold text-amber-50 hover:bg-amber-800"
            >
              적용
            </button>
          </form>
        </div>
        <BandSummaryOpenCard
          href={buildHref(pressure, size, { ...materialExtra, band: 'ok' })}
          className={bandCardClass('ok', 'rounded-lg border border-emerald-900/60 bg-emerald-950/25 px-4 py-3')}
          title="정상 SKU — 품명/사이즈/보유 새 창"
        >
          <div className="text-xs text-emerald-200/80">정상 · 클릭=새 창</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">
            {bandCounts.ok.toLocaleString()}
          </div>
        </BandSummaryOpenCard>
      </section>

      {activePanel === 'sizes' ? (
        <section className="rounded-lg border border-teal-800/50 bg-teal-950/20 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              전체 재고 · 사이즈별 수량 ({sizeTotals.length.toLocaleString()}종) · 합계{' '}
              {overallTotal.toLocaleString()}
            </h2>
            <Link
              href="/dashboard"
              className="text-xs text-slate-400 underline-offset-2 hover:text-teal-200 hover:underline"
            >
              닫기
            </Link>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            존재하는 사이즈와 보유 합계 · 사이즈 클릭 시 해당 필터
          </p>
          {sizeTotals.length === 0 ? (
            <p className="text-sm text-slate-400">등록된 사이즈 없음</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1.5">사이즈</th>
                    <th className="px-2 py-1.5 text-right">SKU 수</th>
                    <th className="px-2 py-1.5 text-right">보유(qty)</th>
                    <th className="px-2 py-1.5">필터</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeTotals.map((row) => (
                    <tr key={row.size} className="border-b border-slate-800/70">
                      <td className="px-2 py-1.5 font-semibold text-sky-200">{row.size}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                        {row.skuCount.toLocaleString()}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          row.onHandTotal > 0 ? 'text-teal-300' : 'text-slate-400'
                        }`}
                      >
                        {row.onHandTotal.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.size !== '—' ? (
                          <Link
                            href={buildHref('ALL', row.size, materialExtra)}
                            className="text-xs text-teal-300/90 underline-offset-2 hover:underline"
                          >
                            이 사이즈만
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeBand ? (
        <section
          className={`rounded-lg border px-4 py-3 ${
            activeBand === 'empty'
              ? 'border-slate-600 bg-slate-900/50'
              : activeBand === 'critical'
                ? 'border-red-900/60 bg-red-950/25'
                : activeBand === 'warn'
                  ? 'border-amber-900/60 bg-amber-950/20'
                  : 'border-emerald-900/60 bg-emerald-950/20'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              {bandLabelKo(activeBand)} {activeBandTotal.toLocaleString()} SKU · 품명/사이즈/보유
            </h2>
            <Link href="/dashboard" className="text-xs text-slate-400 underline-offset-2 hover:text-teal-200 hover:underline">
              전체 재고로
            </Link>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            밴드 해당 SKU 목록 (압력·사이즈·품명·보유) · 아래 표에서 보유 저장/입고/출고
          </p>
          {activeBandTotal === 0 ? (
            <p className="text-sm text-slate-400">해당 밴드 SKU 없음</p>
          ) : bandListRows.length === 0 ? (
            <p className="text-sm text-slate-400">
              {activeBandTotal.toLocaleString()} SKU — 아래 표에서 확인/편집 (페이지네이션)
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1.5">압력</th>
                    <th className="px-2 py-1.5">사이즈</th>
                    <th className="px-2 py-1.5">품명</th>
                    <th className="px-2 py-1.5 text-right">보유</th>
                  </tr>
                </thead>
                <tbody>
                  {bandListRows.map((r) => (
                    <tr key={`band-${r.id}`} className="border-b border-slate-800/70">
                      <td className="px-2 py-1.5 font-medium text-teal-200">
                        {catalogPressureChipLabel(r.pressureClass) || r.pressureClass || '—'}
                      </td>
                      <td className="px-2 py-1.5 font-semibold text-sky-200">{r.size || '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="text-slate-100">{r.itemName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{r.itemCode}</div>
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${bandTextClass(r.band)}`}>
                        {r.onHand.toLocaleString()}
                        <span className="ml-1 text-[10px] font-normal text-slate-500">{r.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bandListOmitted > 0 ? (
                <p className="mt-2 text-xs text-slate-400">
                  +{bandListOmitted.toLocaleString()}건 더 — 아래 SKU 표에서 페이지로 확인
                </p>
              ) : null}
            </div>
          )}
          {activeBreakdown.length > 0 ? (
            <details className="mt-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                압력등급별 합계 ({activeBreakdown.length})
              </summary>
              <table className="mt-2 w-full min-w-[360px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1.5">압력등급</th>
                    <th className="px-2 py-1.5 text-right">SKU 수</th>
                    <th className="px-2 py-1.5 text-right">보유합</th>
                    <th className="px-2 py-1.5">필터</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBreakdown.map((row) => (
                    <tr key={row.pressureClass} className="border-b border-slate-800/60">
                      <td className="px-2 py-1.5 text-teal-200/90">
                        {pressureLabels?.[row.pressureClass] ||
                          catalogPressureChipLabel(row.pressureClass) ||
                          row.pressureClass}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                        {row.skuCount.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                        {row.onHandTotal.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5">
                        <PressureOpenChip
                          href={buildHref(row.pressureClass, size, {
                            ...materialExtra,
                            ...(activeBand ? { band: activeBand } : {}),
                          })}
                          className="text-xs text-sky-300 underline-offset-2 hover:underline"
                          title={`${row.pressureClass} · ${bandLabelKo(activeBand)}만`}
                        >
                          필터
                        </PressureOpenChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
        <Link
          href={buildHref(pressure, size, {
            ...materialExtra,
            ...(shortageOnly ? undefined : { shortage: '1' }),
          })}
          className={
            shortageOnly
              ? 'inline-flex min-h-9 items-center rounded-md border border-amber-600 bg-amber-900/50 px-3 text-sm font-semibold text-amber-100'
              : 'inline-flex min-h-9 items-center rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-200 hover:border-amber-600'
          }
        >
          {shortageOnly ? '부족만 켜짐' : '부족만'}
        </Link>
        <Link
          href="/settings/alerts"
          className="inline-flex min-h-9 items-center rounded-md border border-slate-600 px-3 text-sm text-slate-300 hover:border-teal-600 hover:text-teal-200"
        >
          재고 경보 설정
        </Link>
        <p className="text-xs text-slate-500">
          표 「보유」입력→저장=ADJUST 원장 · 칩/밴드/합계 갱신 · 긴급/주의 기준도 행에서 편집.
        </p>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <div className="mb-3">
          <MaterialFilterChips material={material} hrefFor={materialHref} />
          <FaceFilterChips face={face} hrefFor={faceHref} />
          <p className="mt-1.5 text-[11px] text-slate-500">
            316 행은 빨강 · 칩/합계는 선택한 재질만 집계
          </p>
        </div>
        <div className="mb-2 text-sm font-semibold text-slate-100">빠른찾기 (압력·사이즈·품번)</div>
        <form method="get" action="/dashboard" className="mb-4 flex flex-wrap items-center gap-2">
          {pressure !== 'ALL' ? <input type="hidden" name="pressure" value={pressure} /> : null}
          {size !== 'ALL' ? <input type="hidden" name="size" value={size} /> : null}
          {material !== 'ALL' ? <input type="hidden" name="material" value={material} /> : null}
          {activeBand ? <input type="hidden" name="band" value={activeBand} /> : null}
          {shortageOnly && !activeBand ? <input type="hidden" name="shortage" value="1" /> : null}
          <label className="block min-w-0 flex-1 basis-[16rem]">
            <span className="sr-only">압력·사이즈·품번 검색</span>
            <input
              type="search"
              name="q"
              defaultValue={searchQ}
              placeholder="예: 50a · 10K · 품번…"
              className="w-full min-h-10 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-md border border-teal-700 bg-teal-900/50 px-3 text-xs font-semibold text-teal-100 hover:border-teal-500"
          >
            찾기
          </button>
          {searchQ ? (
            <Link
              href={buildHref(pressure, size, {
                ...chipExtra,
                ...(activeBand ? { band: activeBand } : {}),
              })}
              className="inline-flex min-h-10 items-center rounded-md border border-slate-600 px-3 text-xs text-slate-300 hover:border-teal-600 hover:text-teal-200"
              title="검색어 지우기"
            >
              지우기
            </Link>
          ) : null}
          {searchQ ? (
            <span className="text-xs text-slate-500">
              검색 <strong className="text-slate-300">{searchQ}</strong> · SKU{' '}
              <strong className="text-teal-300">{skuCount.toLocaleString()}</strong>
            </span>
          ) : null}
        </form>
        <p className="mb-3 text-xs text-slate-500">
          검색은 압력·사이즈·품번/명칭을 찾습니다. 압력·사이즈 칩을 누르면 검색어는 초기화되고 칩만
          적용됩니다.
        </p>

        <div className="mb-2 text-sm font-semibold text-slate-100">압력등급</div>
        <div className="mb-1 text-[11px] text-slate-500">
          압력 · kg/cm² · BAR · ANSI/AWWA · 칩=페이지 내 필터 · 보유합계
        </div>
        <div className="flex w-full flex-wrap items-center gap-2">
          <PressureOpenChip href={buildHref('ALL', size, chipExtra)} className={chipClass(pressure === 'ALL')}>
            전체
          </PressureOpenChip>
          {ratingKeys.map((p) => {
            const label = pressureLabels?.[p] || catalogPressureChipLabel(p);
            const total = pressureTotals[p] ?? 0;
            return (
              <PressureOpenChip
                key={p}
                href={buildHref(p, size, chipExtra)}
                className={chipClass(pressure === p)}
                title={catalogPressureChipTitle(p)}
              >
                <span>{label}</span>
                <span className="ml-1.5 tabular-nums opacity-80">{total.toLocaleString()}</span>
              </PressureOpenChip>
            );
          })}
        </div>
        {productKeys.length ? (
          <div className="mt-3">
            <div className="mb-1 text-[11px] text-slate-500">
              유일 카탈로그 제품·규격명 (페이지 내 필터 · 보유합계)
            </div>
            <div className="flex w-full flex-wrap items-center gap-2">
              {productKeys.map((p) => {
                const label = pressureLabels?.[p] || catalogPressureChipLabel(p);
                const total = pressureTotals[p] ?? 0;
                return (
                  <PressureOpenChip
                    key={p}
                    href={buildHref(p, size, chipExtra)}
                    className={chipClass(pressure === p)}
                    title={catalogPressureChipTitle(p)}
                  >
                    <span>{label}</span>
                    <span className="ml-1.5 tabular-nums opacity-80">{total.toLocaleString()}</span>
                  </PressureOpenChip>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="mb-2 mt-4 text-sm font-semibold text-slate-100">사이즈</div>
        <div className="flex w-full flex-wrap items-center gap-2">
          <Link href={buildHref(pressure, 'ALL', chipExtra)} className={chipClass(size === 'ALL')}>
            전체
          </Link>
          {sizeOpts.map((s) => (
            <Link key={s} href={buildHref(pressure, s, chipExtra)} className={chipClass(size === s)}>
              {s}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          압력·사이즈 칩은 이 페이지에서 교집합 필터 (예:{' '}
          <strong className="text-slate-300">/dashboard?pressure=10K</strong>).
        </p>
      </section>

      {sizesPanelOnly ? (
        <section className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-4 text-sm text-slate-300">
          사이즈별 수량 패널 보기 중 — 상세 SKU 표(폼)는 생략해 브라우저 멈춤을 막습니다.{' '}
          <Link href="/dashboard" className="text-teal-300 underline-offset-2 hover:underline">
            전체 재고로 돌아가기
          </Link>
          에서 보유 저장·입고·출고를 하세요.
        </section>
      ) : (
      <section className="overflow-x-auto rounded-lg border border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
          <span>
            SKU {skuCount.toLocaleString()}건 · {page}/{totalPages}페이지 · {pageSize}건씩
          </span>
          {totalPages > 1 ? (
            <span className="flex flex-wrap items-center gap-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-teal-300 hover:underline">
                  ← 이전
                </Link>
              ) : (
                <span className="text-slate-600">← 이전</span>
              )}
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className="text-teal-300 hover:underline">
                  다음 →
                </Link>
              ) : (
                <span className="text-slate-600">다음 →</span>
              )}
            </span>
          ) : null}
        </div>
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <SkuIdentityHeaders />
              <th className="px-3 py-2 text-right">보유</th>
              <th className="px-3 py-2">긴급/주의</th>
              <th className="px-3 py-2">입고</th>
              <th className="px-3 py-2">출고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80 align-top">
                <SkuIdentityCells
                  row={r}
                  metaExtra={
                    <span className="ml-1 text-slate-600">
                      · 적용 &lt;{r.criticalBelow}/{r.warnBelow}
                    </span>
                  }
                />
                <td className="px-3 py-2">
                  <form action={quickSetOnHandAction} className="flex min-w-[7.5rem] flex-col items-end gap-1">
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
                    <input type="hidden" name="size" value={size === 'ALL' ? '' : size} />
                    {shortageOnly ? <input type="hidden" name="shortage" value="1" /> : null}
                    {activeBand ? <input type="hidden" name="band" value={activeBand} /> : null}
                    <div className="flex items-center gap-1">
                      <label className="sr-only" htmlFor={`onhand-${r.id}`}>
                        보유
                      </label>
                      <input
                        id={`onhand-${r.id}`}
                        name="onHand"
                        type="number"
                        min={0}
                        defaultValue={r.onHand}
                        required
                        className={`${wmsControlCompact} w-20 text-right tabular-nums ${bandTextClass(r.band)}`}
                        aria-label={`${r.itemCode} 보유 수량`}
                      />
                      <span className="text-[10px] text-slate-400">{r.unit}</span>
                    </div>
                    <button
                      type="submit"
                      className="inline-flex min-h-7 items-center justify-center rounded-md border border-teal-700/70 bg-teal-950/50 px-2 text-[11px] font-semibold text-teal-100 hover:border-teal-500 hover:text-teal-50"
                    >
                      보유 저장
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={quickUpdateSkuAlertAction} className="flex min-w-[10.5rem] flex-col gap-1">
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
                    <input type="hidden" name="size" value={size === 'ALL' ? '' : size} />
                    {shortageOnly ? <input type="hidden" name="shortage" value="1" /> : null}
                    {activeBand ? <input type="hidden" name="band" value={activeBand} /> : null}
                    <div className="flex items-center gap-1">
                      <label className="sr-only" htmlFor={`crit-${r.id}`}>
                        긴급
                      </label>
                      <span className="w-7 shrink-0 text-[10px] text-red-400">긴급</span>
                      <input
                        id={`crit-${r.id}`}
                        name="alertCriticalBelow"
                        type="number"
                        min={0}
                        placeholder={String(r.criticalBelow)}
                        defaultValue={
                          r.alertCriticalBelow != null ? String(r.alertCriticalBelow) : ''
                        }
                        className={`${wmsControlCompact} w-16 border-red-900/40`}
                        aria-label={`${r.itemCode} 긴급 기준`}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="sr-only" htmlFor={`warn-${r.id}`}>
                        주의
                      </label>
                      <span className="w-7 shrink-0 text-[10px] text-amber-400">주의</span>
                      <input
                        id={`warn-${r.id}`}
                        name="alertWarnBelow"
                        type="number"
                        min={0}
                        placeholder={String(r.warnBelow)}
                        defaultValue={r.alertWarnBelow != null ? String(r.alertWarnBelow) : ''}
                        className={`${wmsControlCompact} w-16 border-amber-900/40`}
                        aria-label={`${r.itemCode} 주의 기준`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex min-h-7 items-center justify-center rounded-md border border-slate-600 bg-slate-900 px-2 text-[11px] font-semibold text-slate-200 hover:border-teal-600 hover:text-teal-200"
                    >
                      기준 저장
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={quickStockInAction} className="flex min-w-[9rem] flex-col gap-1">
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
                    <input type="hidden" name="size" value={size === 'ALL' ? '' : size} />
                    {shortageOnly ? <input type="hidden" name="shortage" value="1" /> : null}
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      defaultValue={1}
                      required
                      className={wmsControlCompact}
                      aria-label={`${r.itemCode} 입고 수량`}
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-8 items-center justify-center rounded-md bg-emerald-800 px-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      입고
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={quickStockOutAction} className="flex min-w-[9rem] flex-col gap-1">
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
                    <input type="hidden" name="size" value={size === 'ALL' ? '' : size} />
                    {shortageOnly ? <input type="hidden" name="shortage" value="1" /> : null}
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      defaultValue={1}
                      required
                      className={wmsControlCompact}
                      aria-label={`${r.itemCode} 출고 수량`}
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-8 items-center justify-center rounded-md bg-rose-900 px-2 text-xs font-semibold text-white hover:bg-rose-800"
                    >
                      출고
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">
            {shortageOnly
              ? '부족(긴급·주의) 품목이 없습니다. 필터를 바꾸거나 「부족만」을 끄세요.'
              : '조건에 맞는 품목이 없습니다. 아래에서 신규 등록하거나 필터를 바꾸세요.'}
          </p>
        ) : null}
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
            <span>
              {page}/{totalPages}페이지
            </span>
            <span className="flex gap-3">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-teal-300 hover:underline">
                  ← 이전
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className="text-teal-300 hover:underline">
                  다음 →
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>
      )}

      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">신규 품목</h2>
        <form action={quickCreateSkuAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="pressure" value={pressure === 'ALL' ? '' : pressure} />
          <input type="hidden" name="sizeFilter" value={size === 'ALL' ? '' : size} />
          <label className="flex min-w-0 flex-col gap-1">
            <span className={wmsLabel}>품목코드 *</span>
            <input name="itemCode" required placeholder="예: F-304-10K-15A" className={wmsControlCompact} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-2">
            <span className={wmsLabel}>품목명 *</span>
            <input name="itemName" required placeholder="예: KS Flange 10K 15A" className={wmsControlCompact} />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={wmsLabel}>압력 *</span>
            <select
              name="pressureClass"
              required
              defaultValue={pressure !== 'ALL' ? pressure : '10K'}
              className={wmsControlCompact}
            >
              {PRESSURE_CLASSES.map((p) => (
                <option key={p} value={p}>
                  {catalogPressureChipLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={wmsLabel}>사이즈 *</span>
            <select name="size" required defaultValue={size !== 'ALL' ? size : '15A'} className={wmsControlCompact}>
              {NOMINAL_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={wmsLabel}>재질</span>
            <select name="materialType" defaultValue="SCS304" className={wmsControlCompact}>
              <option value="SCS304">SCS304</option>
              <option value="SCS316">SCS316</option>
              <option value="SEMI_RAW">단조 반제품</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={wmsLabel}>제품타입</span>
            <select name="productType" defaultValue="KS Flange" className={wmsControlCompact}>
              {PRODUCT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={wmsLabel}>초기입고(선택)</span>
            <input name="initialQty" type="number" min={0} defaultValue={0} className={wmsControlCompact} />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-600"
            >
              신규 등록
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">초기입고가 있으면 StockMove(입고)로 원장에 남깁니다. 숫자만 고치지 않습니다.</p>
      </section>
    </div>
  );
}
