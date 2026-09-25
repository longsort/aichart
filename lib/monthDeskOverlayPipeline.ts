/**
 * 마감·안착 — 차트 zone·진입선(E) 최종 정합 (중복 제거·앵커 참조).
 */
import type { OverlayItem } from '@/types';
import { MONTH_DESK_CORE_MONEY_ENTRY_ID } from '@/lib/monthDeskMoneyZone';

function priceOf(o: OverlayItem | undefined): number | null {
  if (!o) return null;
  const p = Number(o.price1);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

/** 연합 E·구조 E 중복 제거 — plan-entry 1개만 유지 */
export function dedupeMonthDeskEntryLines(items: OverlayItem[]): OverlayItem[] {
  const hasPlan = items.some((o) => String(o.id || '') === 'month-desk-plan-entry');
  if (!hasPlan) return items;

  const planPx = priceOf(items.find((o) => String(o.id || '') === 'month-desk-plan-entry'));

  return items.filter((o) => {
    const id = String(o.id || '');
    if (id === 'month-desk-typeom-entry') return false;
    if (id === 'month-desk-core-money-liq' && planPx != null) {
      const liqPx = priceOf(o);
      if (liqPx != null && relDiff(liqPx, planPx) < 0.004) return false;
    }
    return true;
  });
}

/** clear 밀도: 차트 면 1스택 — $$$$ 핵심 우선, 없으면 연합 zone */
export function resolveMonthDeskClearZonePolicy(items: OverlayItem[]): {
  showCoreMoney: boolean;
  showUnified: boolean;
  showPocket: boolean;
} {
  const showCoreMoney = items.some((o) => String(o.id || '') === MONTH_DESK_CORE_MONEY_ENTRY_ID);
  const showUnified =
    !showCoreMoney && items.some((o) => String(o.id || '') === 'month-desk-unified-zone');
  const showPocket =
    !showCoreMoney &&
    !items.some((o) => String(o.id || '') === 'month-desk-unified-zone') &&
    items.some((o) => String(o.id || '') === 'month-desk-typeom-pocket-zone');
  return { showCoreMoney, showUnified, showPocket };
}
