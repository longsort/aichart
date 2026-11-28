import Link from 'next/link';
import {
  FLANGE_FACE_TYPES,
  faceChipLabel,
  faceTypeTitle,
  type FaceFilter,
} from '@/lib/wms/flange-face';

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-8 items-center rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white'
    : 'inline-flex min-h-8 items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 text-xs text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

/**
 * 면·형식 필터 칩 — 전체 | SOFF | SORF | BLFF | BLRF (`?face=`).
 */
export function FaceFilterChips({
  face,
  hrefFor,
  counts,
}: {
  face: FaceFilter;
  hrefFor: (f: FaceFilter) => string;
  counts?: Partial<Record<FaceFilter, number>>;
}) {
  const items: FaceFilter[] = ['ALL', ...FLANGE_FACE_TYPES];

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="면·형식 필터">
      <span className="mr-1 text-[11px] font-medium text-slate-500">면·형식</span>
      {items.map((key) => {
        const n = counts?.[key];
        const label = faceChipLabel(key);
        return (
          <Link
            key={key}
            href={hrefFor(key)}
            className={chipClass(face === key)}
            title={key === 'ALL' ? '전체 면·형식' : faceTypeTitle(key)}
          >
            {label}
            {typeof n === 'number' ? (
              <span className="ml-1 tabular-nums opacity-80">{n.toLocaleString()}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
