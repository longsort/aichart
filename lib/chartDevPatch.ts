import type { OverlayItem } from '@/types';

/**
 * 실험용 패치(기본 OFF). `true`이면 차트가 MSB-OB(Bu/Be-OB) + Pre3 띠 위주로만 보이고
 * 다른 존·캔들 마커·WAD·브리핑 가격선 등이 숨겨짐 — 일반 사용 시 반드시 false.
 * MSB-OB 집중 디버그할 때만 true.
 */
export const CHART_DEV_ZONES_MSBOB_ONLY = false;

export function isDevMsbObOnlyAllowedOverlay(item: OverlayItem | Record<string, unknown>): boolean {
  const id = String((item as { id?: unknown }).id ?? '');
  if (id === 'pre3-match-zone') return true;
  if (id.startsWith('whale-auto-bu-ob') || id.startsWith('whale-auto-be-ob')) return true;
  return false;
}

export function filterDevMsbObWhaleOverlays<T extends { id?: string }>(items: T[]): T[] {
  return items.filter((o) => {
    const id = String(o?.id ?? '');
    return id.startsWith('whale-auto-bu-ob') || id.startsWith('whale-auto-be-ob');
  });
}
