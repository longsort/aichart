/**
 * SKU 목록 정렬 — 재고현황·입고대기·모피 큐 공통.
 * URL ?sort=stock|qty|pressure
 */

import { compareNominalSize, CATALOG_PRESSURE_CHIP_KEYS } from '@/lib/wms/codes';

export const SKU_SORT_MODES = ['stock', 'qty', 'pressure'] as const;

export type SkuSortMode = (typeof SKU_SORT_MODES)[number];

export type SkuSortableRow = {
  onHand?: number;
  quantity?: number; // hole-wait 등
  pressureClass?: string | null;
  size?: string | null;
  itemCode?: string | null;
};

const PRESSURE_RANK = new Map(
  CATALOG_PRESSURE_CHIP_KEYS.map((k, i) => [k.trim().toLowerCase(), i]),
);

export function parseSkuSortMode(raw?: string | null): SkuSortMode {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'qty' || v === 'quantity' || v === 'onhand') return 'qty';
  if (v === 'pressure' || v === 'pc' || v === 'pressureclass') return 'pressure';
  // stock | default | stockfirst | …
  return 'stock';
}

export function skuSortLabel(mode: SkuSortMode): string {
  if (mode === 'qty') return '보유량순';
  if (mode === 'pressure') return '압력순';
  return '기본(보유우선)';
}

function qtyOf(r: SkuSortableRow): number {
  if (typeof r.onHand === 'number') return r.onHand;
  if (typeof r.quantity === 'number') return r.quantity;
  return 0;
}

/** 압력 안정 정렬키 — 카탈로그 칩 순서 우선, 없으면 숫자·문자열 */
export function comparePressureClass(a?: string | null, b?: string | null): number {
  const aa = String(a || '').trim();
  const bb = String(b || '').trim();
  if (aa === bb) return 0;
  const ra = PRESSURE_RANK.get(aa.toLowerCase());
  const rb = PRESSURE_RANK.get(bb.toLowerCase());
  if (ra != null && rb != null) return ra - rb;
  if (ra != null) return -1;
  if (rb != null) return 1;
  const na = Number((aa.match(/(\d+)/) || [])[1]);
  const nb = Number((bb.match(/(\d+)/) || [])[1]);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return aa.localeCompare(bb, 'ko');
}

function compareCode(a?: string | null, b?: string | null): number {
  return String(a || '').localeCompare(String(b || ''), 'ko');
}

function compareBase(a: SkuSortableRow, b: SkuSortableRow): number {
  const bySize = compareNominalSize(String(a.size || ''), String(b.size || ''));
  if (bySize !== 0) return bySize;
  const byPc = comparePressureClass(a.pressureClass, b.pressureClass);
  if (byPc !== 0) return byPc;
  return compareCode(a.itemCode, b.itemCode);
}

/**
 * 정렬 비교자.
 * - stock(기본): 보유>0 먼저 → 사이즈·압력·품번
 * - qty: 보유량 내림차순 → 품번
 * - pressure: 압력 카탈로그 순 → 사이즈·품번
 */
export function compareSkuRows(a: SkuSortableRow, b: SkuSortableRow, mode: SkuSortMode): number {
  if (mode === 'qty') {
    const byQty = qtyOf(b) - qtyOf(a);
    if (byQty !== 0) return byQty;
    return compareBase(a, b);
  }
  if (mode === 'pressure') {
    const byPc = comparePressureClass(a.pressureClass, b.pressureClass);
    if (byPc !== 0) return byPc;
    const bySize = compareNominalSize(String(a.size || ''), String(b.size || ''));
    if (bySize !== 0) return bySize;
    const byQty = qtyOf(b) - qtyOf(a);
    if (byQty !== 0) return byQty;
    return compareCode(a.itemCode, b.itemCode);
  }
  // stock first
  const aStock = qtyOf(a) > 0 ? 0 : 1;
  const bStock = qtyOf(b) > 0 ? 0 : 1;
  if (aStock !== bStock) return aStock - bStock;
  const byQty = qtyOf(b) - qtyOf(a);
  if (byQty !== 0) return byQty;
  return compareBase(a, b);
}

export function sortSkuRows<T extends SkuSortableRow>(rows: T[], mode: SkuSortMode): T[] {
  return [...rows].sort((a, b) => compareSkuRows(a, b, mode));
}
