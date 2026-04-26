import type { OverlayItem } from '@/types';

/** `/api/analyze` 등에서 온 오버레이에서 Chart Prime 채널 상·하·중 가격(마지막 봉 쪽) 추출 */
export function extractChartPrimeBandEdges(
  overlays: OverlayItem[] | undefined
): { top: number; bottom: number; center: number } | null {
  if (!overlays?.length) return null;
  let top: number | undefined;
  let bottom: number | undefined;
  let center: number | undefined;
  for (const o of overlays) {
    if (o.category !== 'chartPrimeTrendChannels' || o.kind !== 'trendLine') continue;
    const id = String(o.id || '');
    const p2 = Number(o.price2);
    const p1 = Number(o.price1);
    const p = Number.isFinite(p2) ? p2 : Number.isFinite(p1) ? p1 : NaN;
    if (!Number.isFinite(p)) continue;
    if (/cptc-(down|up)-top$/.test(id)) top = p;
    else if (/cptc-(down|up)-bot$/.test(id)) bottom = p;
    else if (/cptc-(down|up)-center$/.test(id)) center = p;
  }
  if (!Number.isFinite(top!) || !Number.isFinite(bottom!) || !Number.isFinite(center!)) return null;
  return { top: top!, bottom: bottom!, center: center! };
}
