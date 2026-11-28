import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import {
  GlobalThresholdForm,
  PressureOverrideForm,
  SizeOverrideForm,
} from '@/components/wms/forms/stock-alert-settings-form';
import { loadThresholdBundle } from '@/lib/wms/stock-alerts';
import { getSkuFilterOptions } from '@/lib/wms/sku-board';
import { NOMINAL_SIZES, PRESSURE_CLASSES } from '@/lib/wms/codes';
import {
  clearAllThresholdOverridesAction,
  resetGlobalThresholdDefaultsAction,
} from '@/lib/wms/actions/admin-records';
import { ConfirmSubmitButton } from '@/components/wms/confirm-submit-button';

type Search = { ok?: string; err?: string };

/** 재고 경보 설정 — 긴급/주의/정상 기준 (전역·압력·사이즈) + 전체삭제/기본복원 */
export default async function StockAlertSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const [bundle, opts] = await Promise.all([loadThresholdBundle(), getSkuFilterOptions()]);

  const sizes = opts.sizes.length ? opts.sizes : [...NOMINAL_SIZES];
  const pressures = opts.pressures.length ? opts.pressures : [...PRESSURE_CLASSES];

  const sizeExisting = Object.entries(bundle.sizeOverrides).map(([nominalSize, v]) => ({
    nominalSize,
    criticalBelow: v.criticalBelow,
    warnBelow: v.warnBelow,
  }));
  const pressureExisting = Object.entries(bundle.pressureOverrides).map(([pressureClass, v]) => ({
    pressureClass,
    criticalBelow: v.criticalBelow,
    warnBelow: v.warnBelow,
  }));

  return (
    <>
      <WmsPageHeader
        title="재고 경보 설정"
        subtitle="긴급(빨강) / 주의(노랑) / 정상(초록) 기준 · 전역 기본값 + 압력·사이즈별 덮어쓰기"
      />
      {sp.err ? (
        <p className="mb-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {sp.err}
        </p>
      ) : null}
      {sp.ok ? (
        <p className="mb-3 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {sp.ok}
        </p>
      ) : null}

      <WmsCard title="관리 작업" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <form action={resetGlobalThresholdDefaultsAction}>
            <input type="hidden" name="returnTo" value="/settings/alerts" />
            <ConfirmSubmitButton
              confirmMessage="전역 경보를 기본값(긴급 20 / 주의 500)으로 복원할까요?"
              className="inline-flex min-h-9 items-center rounded-md border border-amber-700/70 bg-amber-950/30 px-3 text-xs font-semibold text-amber-100 hover:border-amber-500"
            >
              전역 기본값 복원
            </ConfirmSubmitButton>
          </form>
          <form action={clearAllThresholdOverridesAction}>
            <input type="hidden" name="returnTo" value="/settings/alerts" />
            <ConfirmSubmitButton
              confirmMessage={`압력·사이즈 덮어쓰기 전부 삭제할까요? (사이즈 ${sizeExisting.length} · 압력 ${pressureExisting.length})`}
              className="inline-flex min-h-9 items-center rounded-md border border-red-800/80 bg-red-950/40 px-3 text-xs font-semibold text-red-100 hover:border-red-600"
            >
              덮어쓰기 전체삭제
            </ConfirmSubmitButton>
          </form>
        </div>
      </WmsCard>

      <WmsCard title="전역 기준 (SKU)" className="mb-4">
        <GlobalThresholdForm
          criticalBelowSku={bundle.global.criticalBelowSku}
          warnBelowSku={bundle.global.warnBelowSku}
          criticalBelowSize={bundle.global.criticalBelowSize}
          warnBelowSize={bundle.global.warnBelowSize}
          criticalBelowPressure={bundle.global.criticalBelowPressure}
          warnBelowPressure={bundle.global.warnBelowPressure}
        />
      </WmsCard>
      <WmsCard title="압력별 덮어쓰기" className="mb-4">
        <PressureOverrideForm pressures={pressures} existing={pressureExisting} />
      </WmsCard>
      <WmsCard title="사이즈별 덮어쓰기">
        <SizeOverrideForm sizes={sizes} existing={sizeExisting} />
      </WmsCard>
      <p className="mt-4 text-xs text-slate-500">
        품목의 안전재고(safetyStock)가 0보다 크면 그 SKU의 주의 기준으로 우선 적용됩니다. 대시보드
        「보유」색·긴급/주의/정상 카드는 이 설정을 따릅니다.
      </p>
    </>
  );
}
