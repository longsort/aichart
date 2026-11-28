'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  clearPendingInboundAction,
  receivePendingInboundAction,
  savePendingInboundAction,
  undoLastPendingReceiveAction,
} from '@/lib/wms/actions/pending-inbound';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import type { MaterialFilter } from '@/lib/wms/material';
import type { FaceFilter } from '@/lib/wms/flange-face';
import { matchesSkuQuickSearch } from '@/lib/wms/sku-quick-search';
import { sortSkuRows, type SkuSortMode } from '@/lib/wms/sku-list-sort';
import { SkuListFilterPanel } from '@/components/wms/sku-list-filter-panel';
import { SkuIdentityCells, SkuIdentityHeaders } from '@/components/wms/sku-identity-cells';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';

/** 표 DOM만 페이지 — 칩은 URL · 빠른찾기는 클라이언트 라이브 */
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
  /** 단건 입고완료 되돌리기 가능 수량 (있으면 버튼 표시) */
  undoableQty?: number;
};

const STATS_POPUP_FEATURES = 'noopener,noreferrer,width=560,height=720';

/**
 * 입고대기 목록 — 재고현황과 동일 필터 패널 · 대기(DB) 저장 · 입고완료.
 */
export function StockPendingBoard({
  rows,
  userName,
  material = 'ALL',
  face = 'ALL',
  sort = 'stock',
  pressure = 'ALL',
  size = 'ALL',
  q = '',
  pressures = [],
  sizes = [],
  pressureTotals = {},
  pressureLabels,
  basePath = '/stock/pending',
  showMaterialChips = true,
  showFaceChips = true,
  showPressureStats = true,
  crumbLabel = '입고대기',
}: {
  rows: PendingSkuRow[];
  userName?: string;
  material?: MaterialFilter;
  face?: FaceFilter;
  sort?: SkuSortMode;
  pressure?: string;
  size?: string;
  q?: string;
  pressures?: string[];
  sizes?: string[];
  pressureTotals?: Record<string, number>;
  pressureLabels?: Record<string, string>;
  basePath?: string;
  showMaterialChips?: boolean;
  showFaceChips?: boolean;
  showPressureStats?: boolean;
  crumbLabel?: string;
}) {
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [liveQ, setLiveQ] = useState((q || '').trim());

  useEffect(() => {
    setLiveQ((q || '').trim());
  }, [q]);

  const filtered = useMemo(() => {
    const query = liveQ.trim();
    if (!query) return rows;
    return rows.filter((r) =>
      matchesSkuQuickSearch(
        {
          pressureClass: r.pressureClass,
          size: r.size,
          itemCode: r.itemCode,
          itemName: r.itemName,
          extra: catalogPressureChipLabel(r.pressureClass) || r.pressureClass,
        },
        query,
      ),
    );
  }, [rows, liveQ]);

  const sorted = useMemo(() => sortSkuRows(filtered, sort), [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return sorted.slice(start, start + TABLE_PAGE_SIZE);
  }, [sorted, safePage]);

  useEffect(() => {
    setPage(1);
  }, [pressure, size, liveQ, material, face, sort]);

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
        </div>
      </header>

      <SkuListFilterPanel
        basePath={basePath}
        values={{ material, face, sort, pressure, size, q: liveQ }}
        pressures={pressures}
        sizes={sizes}
        pressureTotals={pressureTotals}
        pressureLabels={pressureLabels}
        showMaterial={showMaterialChips}
        showFace={showFaceChips}
        onLiveQueryChange={setLiveQ}
        liveSearchNav="history"
        skuCount={sorted.length}
      />

      <p className="text-xs text-slate-500">
        수량 입력 → <strong className="text-amber-200/90">대기 저장</strong>(DB, 보유 아님) → 공장 도착
        후 <strong className="text-teal-300">입고완료</strong>. 오클릭 시{' '}
        <strong className="text-slate-300">되돌리기</strong>. 필터=재고현황과 동일 패널.
        표시 <strong className="text-slate-300">{sorted.length.toLocaleString()}</strong>
        {pressure !== 'ALL' ? (
          <>
            {' '}
            · 칩{' '}
            <strong className="text-teal-300">
              {catalogPressureChipLabel(pressure) || pressure}
            </strong>
          </>
        ) : null}
        {size !== 'ALL' ? (
          <>
            {' '}
            · 사이즈 <strong className="text-sky-300">{size}</strong>
          </>
        ) : null}
        {totalPages > 1 ? (
          <>
            {' '}
            · 표 {safePage}/{totalPages}페이지
          </>
        ) : null}
      </p>

      <section className="overflow-x-auto rounded-lg border border-slate-700">
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
            <span>
              표 {pageRows.length.toLocaleString()}건 표시 · 필터 {sorted.length.toLocaleString()}
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
              <th className="px-3 py-2">입고·되돌리기</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const hasPending = r.pendingQty > 0;
              const undoQty = r.undoableQty && r.undoableQty > 0 ? r.undoableQty : 0;
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
                    <div className="flex min-w-[7rem] flex-wrap items-center gap-1.5">
                      <form action={receivePendingInboundAction} className="inline-flex">
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
                      {undoQty > 0 ? (
                        <form action={undoLastPendingReceiveAction} className="inline-flex">
                          <input type="hidden" name="itemId" value={r.id} />
                          <input type="hidden" name="returnTo" value={basePath} />
                          <button
                            type="submit"
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-600 px-2 text-xs text-slate-300 hover:border-amber-600 hover:text-amber-200"
                            title={`최근 입고완료 ${undoQty} 되돌리기 → 대기로 복원`}
                          >
                            되돌리기
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            필터에 맞는 미입고/대기 SKU가 없습니다. 칩·검색을 조정하세요.
          </p>
        ) : null}
      </section>
    </div>
  );
}
