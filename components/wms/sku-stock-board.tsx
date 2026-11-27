import Link from 'next/link';
import {
  quickCreateSkuAction,
  quickStockInAction,
  quickStockOutAction,
} from '@/lib/wms/actions/sku-quick';
import { PRODUCT_TYPES, PRESSURE_CLASSES, NOMINAL_SIZES } from '@/lib/wms/codes';
import {
  YUIL_CATALOG_PRESSURE_CHIPS,
  catalogPressureChipLabel,
  catalogPressureChipTitle,
  getCatalogPressureChip,
} from '@/lib/wms/yuil-catalog-filters';
import type { BandCounts, BandPressureBreakdown, SkuBoardRow } from '@/lib/wms/sku-board';
import { bandLabelKo, bandTextClass, type StockAlertBand } from '@/lib/wms/stock-alerts';
import { wmsControlCompact, wmsLabel } from '@/components/wms/wms-form-styles';
import { PressureOpenChip } from '@/components/wms/pressure-open-chip';
import { BandSummaryOpenCard } from '@/components/wms/band-summary-open-card';

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

export function SkuStockBoard({
  rows,
  pressures,
  sizes,
  pressure,
  size,
  overallTotal,
  filteredTotal,
  skuCount,
  bandCounts,
  bandPressureBreakdown,
  activeBand,
  pressureTotals,
  shortageOnly,
  pressureLabels,
  err,
  ok,
}: {
  rows: SkuBoardRow[];
  pressures: string[];
  sizes: string[];
  pressure: string;
  size: string;
  overallTotal: number;
  filteredTotal: number;
  skuCount: number;
  bandCounts: BandCounts;
  bandPressureBreakdown: BandPressureBreakdown;
  activeBand?: StockAlertBand;
  pressureTotals: Record<string, number>;
  shortageOnly: boolean;
  pressureLabels?: Record<string, string>;
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

  const shortageExtra = shortageOnly ? { shortage: '1' } : undefined;
  const activeBreakdown = activeBand ? bandPressureBreakdown[activeBand] : [];
  const activeBandTotal = activeBand ? bandCounts[activeBand] : 0;
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3">
          <div className="text-xs text-slate-400">전체 재고 합계</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-teal-300">{overallTotal.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3">
          <div className="text-xs text-slate-400">필터 재고 합계</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-sky-300">{filteredTotal.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3">
          <div className="text-xs text-slate-400">표시 SKU</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{skuCount.toLocaleString()}</div>
        </div>
        <BandSummaryOpenCard
          href="/dashboard?band=critical"
          className={bandCardClass('critical', 'rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3')}
          title="긴급 SKU — 압력등급별 구성 새 창"
        >
          <div className="text-xs text-red-300/80">긴급 · 클릭=새 창</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-red-400">
            {bandCounts.critical.toLocaleString()}
          </div>
        </BandSummaryOpenCard>
        <BandSummaryOpenCard
          href="/dashboard?band=warn"
          className={bandCardClass('warn', 'rounded-lg border border-amber-900/60 bg-amber-950/25 px-4 py-3')}
          title="주의 SKU — 압력등급별 구성 새 창"
        >
          <div className="text-xs text-amber-200/80">주의 · 클릭=새 창</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-300">
            {bandCounts.warn.toLocaleString()}
          </div>
        </BandSummaryOpenCard>
        <BandSummaryOpenCard
          href="/dashboard?band=ok"
          className={bandCardClass('ok', 'rounded-lg border border-emerald-900/60 bg-emerald-950/25 px-4 py-3')}
          title="정상 SKU — 압력등급별 구성 새 창"
        >
          <div className="text-xs text-emerald-200/80">정상 · 클릭=새 창</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">
            {bandCounts.ok.toLocaleString()}
          </div>
        </BandSummaryOpenCard>
      </section>

      {activeBand ? (
        <section
          className={`rounded-lg border px-4 py-3 ${
            activeBand === 'critical'
              ? 'border-red-900/60 bg-red-950/25'
              : activeBand === 'warn'
                ? 'border-amber-900/60 bg-amber-950/20'
                : 'border-emerald-900/60 bg-emerald-950/20'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              {bandLabelKo(activeBand)} {activeBandTotal.toLocaleString()} SKU · 압력등급별 구성
            </h2>
            <Link href="/dashboard" className="text-xs text-slate-400 underline-offset-2 hover:text-teal-200 hover:underline">
              전체 재고로
            </Link>
          </div>
          <p className="mb-3 text-xs text-slate-500">어떤 압력등급을 먼저 보충할지 보기 · SKU 수 내림차순</p>
          {activeBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400">해당 밴드 SKU 없음</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1.5">압력등급</th>
                    <th className="px-2 py-1.5 text-right">SKU 수</th>
                    <th className="px-2 py-1.5 text-right">보유합</th>
                    <th className="px-2 py-1.5">필터</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBreakdown.map((row) => (
                    <tr key={row.pressureClass} className="border-b border-slate-800/70">
                      <td className="px-2 py-1.5 font-medium text-teal-200">
                        {pressureLabels?.[row.pressureClass] ||
                          catalogPressureChipLabel(row.pressureClass) ||
                          row.pressureClass}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">
                        {row.skuCount.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                        {row.onHandTotal.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5">
                        <PressureOpenChip
                          href={`/dashboard?pressure=${encodeURIComponent(row.pressureClass)}&band=${activeBand}`}
                          className="text-xs text-sky-300 underline-offset-2 hover:underline"
                          title={`${row.pressureClass} · ${bandLabelKo(activeBand)}만`}
                        >
                          새 창
                        </PressureOpenChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
        <Link
          href={buildHref(pressure, size, shortageOnly ? undefined : { shortage: '1' })}
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
          긴급/주의/정상 카드 클릭 → 새 창에서 압력등급별 SKU 수. 보유 색 = 긴급(빨강)/주의(노랑)/정상(초록).
        </p>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-100">압력등급</div>
        <div className="mb-1 text-[11px] text-slate-500">
          압력 · kg/cm² · BAR · ANSI/AWWA · 칩 클릭=새 창 필터 · 보유합계
        </div>
        <div className="flex flex-wrap gap-2">
          <PressureOpenChip href={buildHref('ALL', size, shortageExtra)} className={chipClass(pressure === 'ALL')}>
            전체
          </PressureOpenChip>
          {ratingKeys.map((p) => {
            const label = pressureLabels?.[p] || catalogPressureChipLabel(p);
            const total = pressureTotals[p] ?? 0;
            return (
              <PressureOpenChip
                key={p}
                href={buildHref(p, size, shortageExtra)}
                className={chipClass(pressure === p)}
                title={catalogPressureChipTitle(p)}
              >
                <span className="truncate">{label}</span>
                <span className="ml-1.5 tabular-nums opacity-80">{total.toLocaleString()}</span>
              </PressureOpenChip>
            );
          })}
        </div>
        {productKeys.length ? (
          <div className="mt-3">
            <div className="mb-1 text-[11px] text-slate-500">
              유일 카탈로그 제품·규격명 (클릭=새 창 · 같은 압력칩 필터 · 보유합계)
            </div>
            <div className="flex flex-wrap gap-2">
              {productKeys.map((p) => {
                const label = pressureLabels?.[p] || catalogPressureChipLabel(p);
                const total = pressureTotals[p] ?? 0;
                return (
                  <PressureOpenChip
                    key={p}
                    href={buildHref(p, size, shortageExtra)}
                    className={chipClass(pressure === p)}
                    title={catalogPressureChipTitle(p)}
                  >
                    <span className="truncate">{label}</span>
                    <span className="ml-1.5 tabular-nums opacity-80">{total.toLocaleString()}</span>
                  </PressureOpenChip>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="mb-2 mt-4 text-sm font-semibold text-slate-100">사이즈</div>
        <div className="flex flex-wrap gap-2">
          <Link href={buildHref(pressure, 'ALL', shortageExtra)} className={chipClass(size === 'ALL')}>
            전체
          </Link>
          {sizeOpts.map((s) => (
            <Link key={s} href={buildHref(pressure, s, shortageExtra)} className={chipClass(size === s)}>
              {s}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          압력·카탈로그 칩은 새 창으로 연다 (예:{' '}
          <strong className="text-slate-300">/dashboard?pressure=10K</strong>). 사이즈는 이 페이지에서 교집합.
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">압력</th>
              <th className="px-3 py-2">사이즈</th>
              <th className="px-3 py-2">품번 / 명칭</th>
              <th className="px-3 py-2 text-right">보유</th>
              <th className="px-3 py-2">입고</th>
              <th className="px-3 py-2">출고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80 align-top">
                <td className="px-3 py-2 font-medium text-teal-200">
                  {catalogPressureChipLabel(r.pressureClass) || r.pressureClass || '—'}
                </td>
                <td className="px-3 py-2 font-medium text-sky-200">{r.size || '—'}</td>
                <td className="px-3 py-2">
                  <div className="font-mono text-slate-100">{r.itemCode}</div>
                  <div className="text-xs text-slate-400">{r.itemName}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.materialType} · {r.locationName}
                    {r.band !== 'ok' ? (
                      <span className="ml-1 text-slate-600">
                        · 기준 &lt;{r.criticalBelow}/{r.warnBelow}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${bandTextClass(r.band)}`}>
                  {r.onHand.toLocaleString()}
                  <span className="ml-1 text-[10px] font-normal text-slate-500">{r.unit}</span>
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
      </section>

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
