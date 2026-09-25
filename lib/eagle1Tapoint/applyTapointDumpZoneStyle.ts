/**
 * 타점 차트 — 폭락존(mtf-dump) 면·테두리 사용자 색 적용.
 */
import type { TapointChartSignals } from '@/lib/eagle1Tapoint/chartSignals';
import { readDumpZoneUserStyle } from '@/lib/mergedDeskDumpZoneStyle';

export function applyTapointDumpZoneStyle(
  signals: TapointChartSignals | null | undefined
): TapointChartSignals | null {
  if (!signals) return null;
  const st = readDumpZoneUserStyle();
  if (st.colorMode !== 'custom') return signals;
  const zones = (signals.zones || []).map((z) => {
    if (z.kind !== 'mtf-dump') return z;
    return {
      ...z,
      fill: st.fillRgba,
      stroke: st.borderHex,
    };
  });
  return { ...signals, zones };
}
