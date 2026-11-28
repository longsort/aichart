import type { ReactNode } from 'react';
import { isScs316 } from '@/lib/wms/material';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';

/** 재고현황·입고대기 표 공통 — 압력 / 사이즈 / 품번·명칭 */
export type SkuIdentityFields = {
  pressureClass: string;
  size: string;
  itemCode: string;
  itemName: string;
  materialType?: string | null;
  locationName?: string | null;
};

/** 헤더 3열 — 재고현황과 동일 클래스 */
export function SkuIdentityHeaders() {
  return (
    <>
      <th className="px-3 py-2">압력</th>
      <th className="px-3 py-2">사이즈</th>
      <th className="px-3 py-2">품번 / 명칭</th>
    </>
  );
}

/**
 * 셀 3열 — 304: teal/sky · 316: 빨강(배지 없이 텍스트만).
 * metaExtra: 재고현황 긴급/주의 적용값 등 추가 한 줄.
 */
export function SkuIdentityCells({
  row,
  metaExtra,
}: {
  row: SkuIdentityFields;
  metaExtra?: ReactNode;
}) {
  const material = (row.materialType || '').trim();
  const location = (row.locationName || '').trim();
  const metaBits = [material, location].filter(Boolean).join(' · ');
  const red = isScs316(row.materialType);

  return (
    <>
      <td className={`px-3 py-2 font-medium ${red ? 'text-red-400' : 'text-teal-200'}`}>
        {catalogPressureChipLabel(row.pressureClass) || row.pressureClass || '—'}
      </td>
      <td className={`px-3 py-2 font-medium ${red ? 'text-red-400' : 'text-sky-200'}`}>
        {row.size || '—'}
      </td>
      <td className="px-3 py-2">
        <div className={`font-mono ${red ? 'text-red-300' : 'text-slate-100'}`}>{row.itemCode}</div>
        <div className={`text-xs ${red ? 'text-red-300/80' : 'text-slate-400'}`}>{row.itemName}</div>
        {metaBits || metaExtra ? (
          <div className={`text-[11px] ${red ? 'text-red-400/70' : 'text-slate-500'}`}>
            {metaBits || null}
            {metaExtra}
          </div>
        ) : null}
      </td>
    </>
  );
}
