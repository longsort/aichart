'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NOMINAL_SIZES, PRESSURE_CLASSES } from '@/lib/wms/codes';
import {
  FLANGE_FACE_TYPES,
  faceChipLabel,
  type FaceFilter,
} from '@/lib/wms/flange-face';
import type { MaterialFilter } from '@/lib/wms/material';
import {
  YUIL_CATALOG_PRESSURE_CHIPS,
  catalogPressureChipLabel,
  catalogPressureChipTitle,
  getCatalogPressureChip,
} from '@/lib/wms/yuil-catalog-filters';
import { buildSkuFilterHref } from '@/lib/wms/sku-filter-query';
import type { SkuSortMode } from '@/lib/wms/sku-list-sort';
import { MaterialFilterChips } from '@/components/wms/material-filter-chips';
import { FaceFilterChips } from '@/components/wms/face-filter-chips';
import { SkuSortChips } from '@/components/wms/sku-sort-chips';
import { PressureOpenChip } from '@/components/wms/pressure-open-chip';

const LIVE_SEARCH_DEBOUNCE_MS = 200;

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-9 max-w-full items-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white'
    : 'inline-flex min-h-9 max-w-full items-center rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

export type SkuListFilterValues = {
  material?: MaterialFilter;
  face?: FaceFilter;
  sort?: SkuSortMode;
  pressure?: string;
  size?: string;
  q?: string;
};

/**
 * 재고현황·입고대기 공통 필터 패널.
 * 빠른찾기 = 입력 즉시(디바운스) 라이브 필터.
 * link: URL 칩 · controlled: 로컬 칩 (모피 가공/홀대기).
 */
export function SkuListFilterPanel({
  basePath,
  values,
  pressures = [],
  sizes = [],
  pressureTotals = {},
  pressureLabels,
  showMaterial = true,
  showFace = true,
  showSort = true,
  preserveExtra,
  materialHint = '316 행은 빨강 · 칩/합계는 선택한 재질만 집계',
  mode = 'link',
  onChange,
  localQuery,
  onLocalQueryChange,
  /** 라이브 검색 콜백(디바운스 후). 클라이언트 필터용 */
  onLiveQueryChange,
  /**
   * 검색어 URL 동기화:
   * - router: Next soft navigation (재고현황 서버 필터)
   * - history: replaceState only (입고대기 등 RSC 재실행 없음)
   * - off: URL 유지
   */
  liveSearchNav = 'off',
  skuCount,
}: {
  basePath: string;
  values: SkuListFilterValues;
  pressures?: string[];
  sizes?: string[];
  pressureTotals?: Record<string, number>;
  pressureLabels?: Record<string, string>;
  showMaterial?: boolean;
  showFace?: boolean;
  showSort?: boolean;
  preserveExtra?: Record<string, string | undefined>;
  materialHint?: string;
  mode?: 'link' | 'controlled';
  onChange?: (next: SkuListFilterValues) => void;
  localQuery?: string;
  onLocalQueryChange?: (q: string) => void;
  onLiveQueryChange?: (q: string) => void;
  liveSearchNav?: 'off' | 'history' | 'router';
  skuCount?: number;
}) {
  const router = useRouter();
  const material = values.material || 'ALL';
  const face = values.face || 'ALL';
  const sort = values.sort || 'stock';
  const pressure = (values.pressure || 'ALL').trim() || 'ALL';
  const size = (values.size || 'ALL').trim() || 'ALL';
  const seedQ =
    mode === 'controlled' ? localQuery ?? values.q ?? '' : values.q ?? localQuery ?? '';

  const [draftQ, setDraftQ] = useState(seedQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(seedQ);

  // 칩 네비 등으로 서버 q가 바뀌면 입력 동기화
  useEffect(() => {
    setDraftQ(seedQ);
    lastEmitted.current = seedQ;
  }, [seedQ, pressure, size, material, face]);

  const catalogKeys = YUIL_CATALOG_PRESSURE_CHIPS.map((c) => c.key);
  const catalogSet = new Set(catalogKeys);
  const pressureOpts = pressures.length ? pressures : [...PRESSURE_CLASSES];
  const allPressureKeys = [...catalogKeys, ...pressureOpts.filter((p) => !catalogSet.has(p))];
  const ratingKeys = allPressureKeys.filter((k) => getCatalogPressureChip(k)?.group !== 'product');
  const productKeys = allPressureKeys.filter((k) => getCatalogPressureChip(k)?.group === 'product');
  const sizeOpts = sizes.length ? sizes : [...NOMINAL_SIZES];

  function hrefFor(patch: Partial<SkuListFilterValues> & { keepQ?: boolean }) {
    const nextQ = patch.keepQ ? draftQ.trim() : patch.q !== undefined ? patch.q : '';
    return buildSkuFilterHref(basePath, {
      pressure: patch.pressure ?? pressure,
      size: patch.size ?? size,
      material: patch.material ?? material,
      face: patch.face ?? face,
      sort: patch.sort ?? sort,
      q: nextQ || undefined,
      extra: preserveExtra,
    });
  }

  function apply(patch: Partial<SkuListFilterValues> & { clearQ?: boolean }) {
    if (!onChange) return;
    const next: SkuListFilterValues = {
      material,
      face,
      sort,
      pressure,
      size,
      q: draftQ,
      ...patch,
    };
    if (patch.clearQ) {
      next.q = '';
      setDraftQ('');
      emitLive('');
    }
    onChange(next);
  }

  function emitLive(q: string) {
    lastEmitted.current = q;
    onLiveQueryChange?.(q);
    onLocalQueryChange?.(q);
    if (liveSearchNav === 'off') return;
    const href = buildSkuFilterHref(basePath, {
      pressure,
      size,
      material,
      face,
      sort,
      q: q.trim() || undefined,
      extra: preserveExtra,
    });
    if (liveSearchNav === 'history') {
      if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== href) {
        window.history.replaceState(null, '', href);
      }
      return;
    }
    if (liveSearchNav === 'router') {
      router.replace(href, { scroll: false });
    }
  }

  function scheduleLive(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q === lastEmitted.current) return;
      emitLive(q);
    }, LIVE_SEARCH_DEBOUNCE_MS);
  }

  function onDraftChange(next: string) {
    setDraftQ(next);
    // controlled 모피: 입력 즉시 draft 반영, 필터는 디바운스
    scheduleLive(next);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDraftQ('');
    emitLive('');
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function renderPressureChip(p: string, active: boolean) {
    const label = pressureLabels?.[p] || catalogPressureChipLabel(p);
    const total = pressureTotals[p] ?? 0;
    const body = (
      <>
        <span>{label}</span>
        <span className="ml-1.5 tabular-nums opacity-80">{total.toLocaleString()}</span>
      </>
    );
    if (mode === 'link') {
      return (
        <PressureOpenChip
          key={p}
          href={hrefFor({ pressure: p, size })}
          className={chipClass(active)}
          title={catalogPressureChipTitle(p)}
        >
          {body}
        </PressureOpenChip>
      );
    }
    return (
      <button
        key={p}
        type="button"
        className={chipClass(active)}
        title={catalogPressureChipTitle(p)}
        onClick={() => apply({ pressure: p, clearQ: true })}
      >
        {body}
      </button>
    );
  }

  const showCount = draftQ.trim() && typeof skuCount === 'number';

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
      <div className="mb-3 space-y-1.5">
        {showMaterial ? (
          mode === 'link' ? (
            <MaterialFilterChips
              material={material}
              hrefFor={(m) => hrefFor({ material: m, pressure, size })}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="재질 필터">
              <span className="mr-1 text-[11px] font-medium text-slate-500">재질</span>
              {(['ALL', '304', '316'] as MaterialFilter[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={chipClass(material === m)}
                  onClick={() => apply({ material: m, clearQ: true })}
                >
                  {m === 'ALL' ? '전체' : m}
                </button>
              ))}
            </div>
          )
        ) : null}
        {showFace ? (
          mode === 'link' ? (
            <FaceFilterChips face={face} hrefFor={(f) => hrefFor({ face: f, pressure, size })} />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="면·형식 필터">
              <span className="mr-1 text-[11px] font-medium text-slate-500">면·형식</span>
              {(['ALL', ...FLANGE_FACE_TYPES] as FaceFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={chipClass(face === f)}
                  onClick={() => apply({ face: f, clearQ: true })}
                >
                  {faceChipLabel(f)}
                </button>
              ))}
            </div>
          )
        ) : null}
        {showSort ? (
          mode === 'controlled' ? (
            <SkuSortChips sort={sort} onSelect={(s) => apply({ sort: s })} />
          ) : (
            <SkuSortChips
              sort={sort}
              hrefFor={(s) => hrefFor({ sort: s, pressure, size, keepQ: true })}
            />
          )
        ) : null}
        {showMaterial ? <p className="text-[11px] text-slate-500">{materialHint}</p> : null}
      </div>

      <div className="mb-2 text-sm font-semibold text-slate-100">빠른찾기 (압력·사이즈·FACE·압축)</div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="block min-w-0 flex-1 basis-[16rem]">
          <span className="sr-only">압력·사이즈·FACE 압축 검색 (입력 즉시)</span>
          <input
            type="search"
            value={draftQ}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="예: 50A20BL · 20K50A · 100ABL150FL… (입력 즉시)"
            className="w-full min-h-10 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        {draftQ.trim() ? (
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex min-h-10 items-center rounded-md border border-slate-600 px-3 text-xs text-slate-300 hover:border-teal-600 hover:text-teal-200"
            title="검색어 지우기"
          >
            지우기
          </button>
        ) : null}
        {showCount ? (
          <span className="text-xs text-slate-500">
            검색 <strong className="text-slate-300">{draftQ.trim()}</strong> · SKU{' '}
            <strong className="text-teal-300">{skuCount!.toLocaleString()}</strong>
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        입력하면 바로 목록이 갱신됩니다(압축 검색 50A20BL · K 생략). 압력·사이즈·FACE 칩 클릭 시
        검색어는 초기화됩니다.
      </p>

      <div className="mb-2 text-sm font-semibold text-slate-100">압력등급</div>
      <div className="mb-1 text-[11px] text-slate-500">
        압력 · kg/cm² · BAR · ANSI/AWWA · 칩=페이지 내 필터 · 보유합계
      </div>
      <div className="flex w-full flex-wrap items-center gap-2">
        {mode === 'link' ? (
          <PressureOpenChip href={hrefFor({ pressure: 'ALL', size })} className={chipClass(pressure === 'ALL')}>
            전체
          </PressureOpenChip>
        ) : (
          <button
            type="button"
            className={chipClass(pressure === 'ALL')}
            onClick={() => apply({ pressure: 'ALL', clearQ: true })}
          >
            전체
          </button>
        )}
        {ratingKeys.map((p) => renderPressureChip(p, pressure === p))}
      </div>

      {productKeys.length ? (
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-slate-500">
            유일 카탈로그 제품·규격명 (페이지 내 필터 · 보유합계)
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">
            {productKeys.map((p) => renderPressureChip(p, pressure === p))}
          </div>
        </div>
      ) : null}

      <div className="mb-2 mt-4 text-sm font-semibold text-slate-100">사이즈</div>
      <div className="flex w-full flex-wrap items-center gap-2">
        {mode === 'link' ? (
          <Link href={hrefFor({ pressure, size: 'ALL' })} className={chipClass(size === 'ALL')}>
            전체
          </Link>
        ) : (
          <button
            type="button"
            className={chipClass(size === 'ALL')}
            onClick={() => apply({ size: 'ALL', clearQ: true })}
          >
            전체
          </button>
        )}
        {sizeOpts.map((s) =>
          mode === 'link' ? (
            <Link key={s} href={hrefFor({ pressure, size: s })} className={chipClass(size === s)}>
              {s}
            </Link>
          ) : (
            <button
              key={s}
              type="button"
              className={chipClass(size === s)}
              onClick={() => apply({ size: s, clearQ: true })}
            >
              {s}
            </button>
          ),
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        압력·사이즈 칩은 이 페이지에서 교집합 필터 (예:{' '}
        <strong className="text-slate-300">
          {basePath}?pressure=10K
        </strong>
        ).
      </p>
    </section>
  );
}
