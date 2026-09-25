/**
 * Phase 20 — Heat underlay 정책.
 * 캔들 가림 금지. HUD 얇은 바코드만. 차트 존 heat 오버레이 금지.
 */
import { heatBarPaint, type HeatBar } from './pressureHeatmap';

export type HeatUnderlayPolicy = {
  /** 캔들 위 full-bleed heat 금지 */
  coverCandlesForbidden: true;
  /** HUD 전용 thin strip */
  hudStripOnly: true;
  maxOpacity: number;
  stripHeightPx: number;
  summaryKo: string;
};

export const EAGLE1_HEAT_UNDERLAY: HeatUnderlayPolicy = {
  coverCandlesForbidden: true,
  hudStripOnly: true,
  maxOpacity: 0.55,
  stripHeightPx: 10,
  summaryKo: '히트는 HUD 하단 바만 · 캔들 면 가림 금지',
};

/** paint 상한 클램프 — 캔들 가림 방지, strip에서는 보이도록 */
export function heatBarPaintSafe(score: number): { fill: string; opacity: number } {
  const p = heatBarPaint(score);
  return {
    fill: p.fill,
    opacity: Math.min(0.55, Math.max(0.18, p.opacity * 2.2)),
  };
}

export function assertHeatHudOnly(overlays: Array<{ id?: string }>): boolean {
  return !overlays.some((o) => String(o.id || '').startsWith('eagle1-heat-'));
}

export function heatUnderlayReport(heat: HeatBar[] | null | undefined): {
  policy: HeatUnderlayPolicy;
  bars: number;
  note: string;
} {
  return {
    policy: EAGLE1_HEAT_UNDERLAY,
    bars: heat?.length ?? 0,
    note: heat?.length ? EAGLE1_HEAT_UNDERLAY.summaryKo : '데이터 없음',
  };
}
