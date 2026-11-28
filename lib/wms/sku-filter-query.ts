/**
 * SKU 목록 필터 URL — 재고현황·입고대기·모피 큐 공통.
 * 칩 클릭 시 검색어(q)·page 는 기본 초기화 (정렬만 q 유지).
 */

import type { FaceFilter } from '@/lib/wms/flange-face';
import type { MaterialFilter } from '@/lib/wms/material';
import type { SkuSortMode } from '@/lib/wms/sku-list-sort';

export type SkuFilterQuery = {
  pressure?: string;
  size?: string;
  q?: string;
  material?: MaterialFilter | string;
  face?: FaceFilter | string;
  sort?: SkuSortMode | string;
  /** shortage=1, band=empty, panel=sizes, page=N … */
  extra?: Record<string, string | undefined>;
};

export function buildSkuFilterHref(basePath: string, query: SkuFilterQuery): string {
  const sp = new URLSearchParams();
  const pressure = (query.pressure || 'ALL').trim() || 'ALL';
  const size = (query.size || 'ALL').trim() || 'ALL';
  const material = (query.material || 'ALL').toString().trim() || 'ALL';
  const face = (query.face || 'ALL').toString().trim() || 'ALL';
  const sort = (query.sort || 'stock').toString().trim() || 'stock';
  const q = (query.q || '').trim();

  if (pressure !== 'ALL') sp.set('pressure', pressure);
  if (size !== 'ALL') sp.set('size', size);
  if (material !== 'ALL') sp.set('material', material);
  if (face !== 'ALL') sp.set('face', face);
  if (sort !== 'stock') sp.set('sort', sort);
  if (q) sp.set('q', q);

  if (query.extra) {
    for (const [k, v] of Object.entries(query.extra)) {
      if (v) sp.set(k, v);
    }
  }

  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
