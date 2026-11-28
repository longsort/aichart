import Link from 'next/link';
import {
  SKU_SORT_MODES,
  skuSortLabel,
  type SkuSortMode,
} from '@/lib/wms/sku-list-sort';

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-8 items-center rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white'
    : 'inline-flex min-h-8 items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 text-xs text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

/** 목록 정렬 칩 — 기본(보유우선) | 보유량순 | 압력순 (URL 또는 onSelect) */
export function SkuSortChips({
  sort,
  hrefFor,
  onSelect,
}: {
  sort: SkuSortMode;
  hrefFor?: (mode: SkuSortMode) => string;
  onSelect?: (mode: SkuSortMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="목록 정렬">
      <span className="mr-1 text-[11px] font-medium text-slate-500">정렬</span>
      {SKU_SORT_MODES.map((mode) => {
        const active = sort === mode;
        const label = skuSortLabel(mode);
        if (onSelect) {
          return (
            <button
              key={mode}
              type="button"
              className={chipClass(active)}
              title={label}
              aria-pressed={active}
              onClick={() => onSelect(mode)}
            >
              {label}
            </button>
          );
        }
        return (
          <Link
            key={mode}
            href={hrefFor ? hrefFor(mode) : '#'}
            className={chipClass(active)}
            title={label}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
