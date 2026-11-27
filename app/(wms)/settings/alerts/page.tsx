import { WmsCard, WmsPageHeader } from '@/components/wms/wms-shell';
import {
  GlobalThresholdForm,
  PressureOverrideForm,
  SizeOverrideForm,
} from '@/components/wms/forms/stock-alert-settings-form';
import { loadThresholdBundle } from '@/lib/wms/stock-alerts';
import { getSkuFilterOptions } from '@/lib/wms/sku-board';
import { NOMINAL_SIZES, PRESSURE_CLASSES } from '@/lib/wms/codes';

/** 재고 경보 설정 — 긴급/주의/정상 기준 (전역·압력·사이즈) */
export default async function StockAlertSettingsPage() {
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
