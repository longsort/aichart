import Link from 'next/link';
import type { MaterialFilter } from '@/lib/wms/material';

function chipClass(active: boolean, tone: 'neutral' | 'red' = 'neutral') {
  if (active) {
    return tone === 'red'
      ? 'inline-flex min-h-8 items-center rounded-md bg-red-700 px-2.5 text-xs font-semibold text-white'
      : 'inline-flex min-h-8 items-center rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white';
  }
  return tone === 'red'
    ? 'inline-flex min-h-8 items-center rounded-md border border-red-800/80 bg-slate-900 px-2.5 text-xs text-red-200 hover:border-red-600'
    : 'inline-flex min-h-8 items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 text-xs text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

/**
 * 재질 필터 칩 — 전체 | 304 | 316 (같은 페이지 Link만).
 * hrefFor(material) 이 현재 압력/사이즈 등 쿼리를 유지하도록 호출측에서 구성.
 */
export function MaterialFilterChips({
  material,
  hrefFor,
  counts,
}: {
  material: MaterialFilter;
  hrefFor: (m: MaterialFilter) => string;
  /** 선택적 건수 뱃지 */
  counts?: Partial<Record<MaterialFilter, number>>;
}) {
  const items: Array<{ key: MaterialFilter; label: string; tone: 'neutral' | 'red' }> = [
    { key: 'ALL', label: '전체', tone: 'neutral' },
    { key: '304', label: '304', tone: 'neutral' },
    { key: '316', label: '316', tone: 'red' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="재질 필터">
      <span className="mr-1 text-[11px] font-medium text-slate-500">재질</span>
      {items.map((it) => {
        const n = counts?.[it.key];
        return (
          <Link
            key={it.key}
            href={hrefFor(it.key)}
            className={chipClass(material === it.key, it.tone)}
            title={`${it.label} 재질만`}
          >
            {it.label}
            {typeof n === 'number' ? (
              <span className="ml-1 tabular-nums opacity-80">{n.toLocaleString()}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
