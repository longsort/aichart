'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  clearPendingInboundAction,
  receivePendingInboundAction,
  savePendingInboundAction,
} from '@/lib/wms/actions/pending-inbound';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import type { MaterialFilter } from '@/lib/wms/material';
import type { FaceFilter } from '@/lib/wms/flange-face';
import { matchesSkuQuickSearch } from '@/lib/wms/sku-quick-search';
import { MaterialFilterChips } from '@/components/wms/material-filter-chips';
import { FaceFilterChips } from '@/components/wms/face-filter-chips';
import { SkuIdentityCells, SkuIdentityHeaders } from '@/components/wms/sku-identity-cells';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';

/** 표 DOM만 페이지 — 칩/검색은 전체 rows 기준 */
const TABLE_PAGE_SIZE = 80;

export type PendingSkuRow = {
  id: string;
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
  materialType?: string;
  locationName?: string;
  /** 실보유(LOT) — 미입고 목록이면 보통 0 */
  onHand: number;
  /** DB 입고대기 수량 */
  pendingQty: number;
};

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-8 max-w-full shrink-0 items-center rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white'
    : 'inline-flex min-h-8 max-w-full shrink-0 items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 text-xs text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

const STATS_POPUP_FEATURES = 'noopener,noreferrer,width=560,height=720';

/**
 * 입고대기 목록 — 검색·칩 필터 · 대기(DB) 저장 · 입고완료(대기→StockMove IN).
 * 압력 통계는 DB 대기 수량 기준 새 창.
 */
export function StockPendingBoard({
  rows,
  userName,
  material = 'ALL',
  face = 'ALL',
  basePath = '/stock/pending',
  showMaterialChips = true,
  showFaceChips = true,
  showPressureStats = true,
  crumbLabel = '입고대기',
}: {
  rows: PendingSkuRow[];
  userName?: string;
  /** URL ?material= — 서버에서 이미 필터된 rows */
  material?: MaterialFilter;
  /** URL ?face= — 서버에서 이미 필터된 rows */
  face?: FaceFilter;
  /** 폼 returnTo · 재질칩 링크 기준 경로 */
  basePath?: string;
  /** 모피 큐 등에서는 재질칩 숨김 */
  showMaterialChips?: boolean;
  showFaceChips?: boolean;
  /** 완성품 입고대기 압력 통계 팝업 */
  showPressureStats?: boolean;
  crumbLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [pressure, setPressure] = useState<string>('ALL');
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  function pendingHref(next: { material?: MaterialFilter; face?: FaceFilter }) {
    const m = next.material ?? material;
    const f = next.face ?? face;
    const sp = new URLSearchParams();
    if (m !== 'ALL') sp.set('material', m);
    if (f !== 'ALL') sp.set('face', f);
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  }

  function materialHref(m: MaterialFilter) {
    return pendingHref({ material: m });
  }

  function faceHref(f: FaceFilter) {
    return pendingHref({ face: f });
  }

  /** 칩 클릭 = 해당 압력 목록만 (검색어 잔존으로 빈 표 나는 것 방지) */
  function selectPressure(next: string) {
    setPressure(next);
    setQuery('');
    setPage(1);
  }

  const pressureChips = useMemo(() => {
    const counts = new Map<string, { sku: number; pendingQty: number }>();
    for (const r of rows) {
      const key = (r.pressureClass || '').trim() || '—';
      const cur = counts.get(key) || { sku: 0, pendingQty: 0 };
      cur.sku += 1;
      cur.pendingQty += r.pendingQty > 0 ? r.pendingQty : 0;
      counts.set(key, cur);
    }
    return [...counts.entries()]
      .map(([key, v]) => ({
        key,
        count: v.sku,
        pendingQty: v.pendingQty,
        label: catalogPressureChipLabel(key) || key,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows.filter((r) => {
      const pc = (r.pressureClass || '').trim() || '—';
      // 칩 키는 rows의 pressureClass 그대로 — 카운트와 동일 집합
      if (pressure !== 'ALL' && pc !== pressure) return false;
      if (!q) return true;
      return matchesSkuQuickSearch(
        {
          pressureClass: pc,
          size: r.size,
          itemCode: r.itemCode,
          itemName: r.itemName,
          extra: catalogPressureChipLabel(pc) || pc,
        },
        q,
      );
    });
  }, [rows, query, pressure]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return filtered.slice(start, start + TABLE_PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [query, pressure]);

  const pendingSkuCount = useMemo(
    () => rows.filter((r) => r.pendingQty > 0).length,
    [rows],
  );
  const pendingQtyTotal = useMemo(
    () => rows.reduce((s, r) => s + (r.pendingQty > 0 ? r.pendingQty : 0), 0),
    [rows],
  );

  const userInitial = (userName || 'U').trim().slice(0, 1).toUpperCase() || 'U';

  function draftOrPending(row: PendingSkuRow): string {
    if (qtyDraft[row.id] != null) return qtyDraft[row.id];
    if (row.pendingQty > 0) return String(row.pendingQty);
    return '1';
  }

  function openPressureStatsWindow() {
    window.open('/stock/pending/stats', 'wms-pending-pressure-stats', STATS_POPUP_FEATURES);
  }

  return (
    <div className="space-y-3">
      <header className="sticky top-0 z-20 -mx-1 border-b border-slate-700/80 bg-slate-950/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-950/80">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-semibold text-slate-100 hover:text-teal-200"
          >
            재고현황
          </Link>
          <span className="hidden text-slate-600 sm:inline">/</span>
          <span className="shrink-0 text-sm text-slate-400">{crumbLabel}</span>
          <span className="text-xs text-slate-500">
            미입고 <strong className="tabular-nums text-slate-200">{rows.length.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-slate-500">
            대기 SKU{' '}
            <strong className="tabular-nums text-amber-300">{pendingSkuCount.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-slate-500">
            대기 합{' '}
            <strong className="tabular-nums text-teal-300">{pendingQtyTotal.toLocaleString()}</strong>
          </span>

          {showPressureStats ? (
            <button
              type="button"
              onClick={openPressureStatsWindow}
              className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-teal-700 bg-teal-950/60 px-2.5 text-xs font-semibold text-teal-100 hover:border-teal-500"
              title="DB 입고대기 압력 통계를 새 창에서 열기"
            >
              압력 통계 · 새 창
            </button>
          ) : null}

          <div
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
            title={userName || 'user'}
            aria-label={userName ? `로그인 ${userName}` : '사용자'}
          >
            {userInitial}
          </div>

          {showMaterialChips ? (
            <div className="w-full basis-full">
              <MaterialFilterChips material={material} hrefFor={materialHref} />
            </div>
          ) : null}
          {showFaceChips ? (
            <div className="w-full basis-full">
              <FaceFilterChips face={face} hrefFor={faceHref} />
            </div>
          ) : null}

          {/* 압력 칩: 가로 클립 금지 · 여러 줄 wrap · 같은 페이지 필터만 */}
          <div
            className="flex w-full basis-full flex-wrap items-center gap-1.5"
            role="toolbar"
            aria-label="압력별 목록 필터"
          >
            <button
              type="button"
              className={chipClass(pressure === 'ALL')}
              onClick={() => selectPressure('ALL')}
              title="전체 압력 (검색 초기화)"
            >
              전체
              <span className="ml-1 tabular-nums opacity-80">{rows.length.toLocaleString()}</span>
            </button>
            {pressureChips.map((c) => (
              <button
                type="button"
                key={c.key}
                className={chipClass(pressure === c.key)}
                onClick={() => selectPressure(c.key)}
                title={
                  c.pendingQty > 0
                    ? `${c.label} · ${c.count}건 · 대기 ${c.pendingQty} · 목록 필터`
                    : `${c.label} · ${c.count}건 · 목록 필터`
                }
              >
                <span>{c.label}</span>
                <span className="ml-1 tabular-nums opacity-80">{c.count.toLocaleString()}</span>
                {c.pendingQty > 0 ? (
                  <span className="ml-1 tabular-nums text-amber-200/90">대기{c.pendingQty}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <div className="mb-2 text-sm font-semibold text-slate-100">빠른찾기 (압력·사이즈·품번)</div>
        <div className="mb-2 flex gap-2">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">압력·사이즈·품번 검색</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 50a · 10K · 품번… (칩 클릭 시 검색 초기화)"
              className="w-full min-h-10 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
              autoComplete="off"
            />
          </label>
          {query.trim() ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-slate-600 px-3 text-xs text-slate-300 hover:border-teal-600 hover:text-teal-200"
              title="검색어 지우기"
            >
              지우기
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          수량 입력 → <strong className="text-amber-200/90">대기 저장</strong>(DB, 보유 아님) → 공장
          도착 후 <strong className="text-teal-300">입고완료</strong>(StockMove IN). 검색=압력·사이즈·품번/명칭.
          칩=같은 페이지 필터(클릭 시 검색 초기화). 표시{' '}
          <strong className="text-slate-300">{filtered.length.toLocaleString()}</strong>
          {` / 전체 ${rows.length.toLocaleString()}`}
          {pressure !== 'ALL' ? (
            <>
              {' '}
              · 칩{' '}
              <strong className="text-teal-300">
                {catalogPressureChipLabel(pressure) || pressure}
              </strong>
            </>
          ) : null}
          {totalPages > 1 ? (
            <>
              {' '}
              · 표 {safePage}/{totalPages}페이지
            </>
          ) : null}
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-700">
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
            <span>
              표 {pageRows.length.toLocaleString()}건 표시 · 필터{' '}
              {filtered.length.toLocaleString()} / 전체 {rows.length.toLocaleString()}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="text-teal-300 hover:underline disabled:cursor-not-allowed disabled:text-slate-600"
              >
                ← 이전
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="text-teal-300 hover:underline disabled:cursor-not-allowed disabled:text-slate-600"
              >
                다음 →
              </button>
            </span>
          </div>
        ) : null}
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <SkuIdentityHeaders />
              <th className="px-3 py-2 text-right">보유</th>
              <th className="px-3 py-2 text-right">대기</th>
              <th className="px-3 py-2">수량</th>
              <th className="px-3 py-2">대기 저장</th>
              <th className="px-3 py-2">입고완료</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const hasPending = r.pendingQty > 0;
              return (
                <tr key={r.id} className="border-b border-slate-800/80 align-top">
                  <SkuIdentityCells row={r} />
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {r.onHand.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {hasPending ? (
                      <span className="font-semibold tabular-nums text-amber-300">
                        대기 {r.pendingQty.toLocaleString()}
                      </span>
                    ) : (
                      <span className="tabular-nums text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name={`qty-${r.id}`}
                      type="number"
                      min={1}
                      value={draftOrPending(r)}
                      onChange={(e) =>
                        setQtyDraft((prev) => ({
                          ...prev,
                          [r.id]: e.target.value,
                        }))
                      }
                      className={wmsControlCompact}
                      aria-label={`${r.itemCode} 수량`}
                      form={`pending-save-${r.id}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <form
                      id={`pending-save-${r.id}`}
                      action={savePendingInboundAction}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <input type="hidden" name="itemId" value={r.id} />
                      <input type="hidden" name="returnTo" value={basePath} />
                      <input type="hidden" name="quantity" value={draftOrPending(r)} />
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-amber-700/80 bg-amber-950/40 px-3 text-xs font-semibold text-amber-100 hover:border-amber-500"
                        title="입고대기(DB)로 저장 — 보유 수량 증가 없음"
                      >
                        대기 저장
                      </button>
                      {hasPending ? (
                        <button
                          type="submit"
                          formAction={clearPendingInboundAction}
                          className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-700 px-2 text-xs text-slate-400 hover:border-red-800 hover:text-red-200"
                          title="대기 취소(재고 변동 없음)"
                        >
                          취소
                        </button>
                      ) : null}
                    </form>
                  </td>
                  <td className="px-3 py-2">
                    <form
                      action={receivePendingInboundAction}
                      className="flex min-w-[7rem] flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="itemId" value={r.id} />
                      <input type="hidden" name="returnTo" value={basePath} />
                      <input type="hidden" name="quantity" value={draftOrPending(r)} />
                      <button
                        type="submit"
                        disabled={!hasPending}
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-teal-700 bg-teal-900/50 px-3 text-xs font-semibold text-teal-100 hover:border-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          hasPending
                            ? '공장 도착 후: 대기→실재고(StockMove IN)'
                            : '먼저 대기 저장하세요'
                        }
                      >
                        입고완료
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {rows.length === 0
              ? '미입고(보유 0) SKU가 없습니다.'
              : query.trim()
                ? '검색어와 압력 칩을 동시에 만족하는 SKU가 없습니다. 검색을 지우거나 압력 칩을 다시 누르세요.'
                : '선택한 압력에 해당하는 SKU가 없습니다.'}
          </p>
        ) : null}
      </section>
    </div>
  );
}
