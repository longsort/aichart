'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { completeMopiHoleAction } from '@/lib/wms/actions/mopi-process';
import {
  YUIL_CATALOG_PRESSURE_CHIPS,
  catalogPressureChipLabel,
  itemMatchesCatalogPressure,
} from '@/lib/wms/yuil-catalog-filters';
import { matchesSkuQuickSearch } from '@/lib/wms/sku-quick-search';
import { sortSkuRows, type SkuSortMode } from '@/lib/wms/sku-list-sort';
import {
  SkuListFilterPanel,
  type SkuListFilterValues,
} from '@/components/wms/sku-list-filter-panel';
import { SkuIdentityCells, SkuIdentityHeaders } from '@/components/wms/sku-identity-cells';
import type { MopiHoleWaitRow } from '@/lib/wms/mopi-queries';

const TABLE_PAGE_SIZE = 80;

function buildPressureTotals(rows: MopiHoleWaitRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const chip of YUIL_CATALOG_PRESSURE_CHIPS) totals[chip.key] = 0;
  for (const r of rows) {
    if (r.quantity <= 0) continue;
    const identity = {
      pressureClass: r.pressureClass,
      productType: '',
      standard: '',
      itemName: r.itemName,
      itemCode: r.itemCode,
    };
    for (const chip of YUIL_CATALOG_PRESSURE_CHIPS) {
      if (itemMatchesCatalogPressure(identity, chip.key)) {
        totals[chip.key] = (totals[chip.key] || 0) + r.quantity;
      }
    }
    const pc = (r.pressureClass || '').trim();
    if (pc && !YUIL_CATALOG_PRESSURE_CHIPS.some((c) => c.key === pc)) {
      totals[pc] = (totals[pc] || 0) + r.quantity;
    }
  }
  return totals;
}

/** 홀가공대기 — 홀가공완료 → 완성품 재고 합류 */
export function MopiHoleBoard({ rows }: { rows: MopiHoleWaitRow[] }) {
  const [filters, setFilters] = useState<SkuListFilterValues>({
    sort: 'stock',
    pressure: 'ALL',
    size: 'ALL',
    q: '',
  });
  const [liveQ, setLiveQ] = useState('');
  const [page, setPage] = useState(1);

  const pressure = filters.pressure || 'ALL';
  const size = filters.size || 'ALL';
  const sort = (filters.sort || 'stock') as SkuSortMode;
  const pressureTotals = useMemo(() => buildPressureTotals(rows), [rows]);

  const filtered = useMemo(() => {
    const q = liveQ.trim();
    const list = rows.filter((r) => {
      if (size !== 'ALL' && r.size !== size) return false;
      if (
        !itemMatchesCatalogPressure(
          {
            pressureClass: r.pressureClass,
            productType: '',
            standard: '',
            itemName: r.itemName,
            itemCode: r.itemCode,
          },
          pressure,
        )
      ) {
        return false;
      }
      if (!q) return true;
      return matchesSkuQuickSearch(
        {
          pressureClass: r.pressureClass,
          size: r.size,
          itemCode: r.itemCode,
          itemName: r.itemName,
          extra: `${r.finishedItemCode} ${r.orderNo} ${catalogPressureChipLabel(r.pressureClass) || r.pressureClass}`,
        },
        q,
      );
    });
    return sortSkuRows(list, sort);
  }, [rows, liveQ, pressure, size, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return filtered.slice(start, start + TABLE_PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [liveQ, pressure, size, sort]);

  const qtyTotal = useMemo(() => rows.reduce((s, r) => s + r.quantity, 0), [rows]);

  return (
    <div className="space-y-3">
      <header className="sticky top-0 z-20 -mx-1 border-b border-slate-700/80 bg-slate-950/95 px-1 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/mopi/pending" className="text-sm text-slate-400 hover:text-teal-200">
            모피 입고대기
          </Link>
          <span className="text-slate-600">→</span>
          <Link href="/mopi/machining" className="text-sm text-slate-400 hover:text-teal-200">
            가공대기
          </Link>
          <span className="text-slate-600">→</span>
          <span className="text-sm font-semibold text-slate-100">홀가공대기</span>
          <span className="text-xs text-slate-500">
            건수 <strong className="tabular-nums text-slate-200">{rows.length.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-slate-500">
            수량 합{' '}
            <strong className="tabular-nums text-amber-300">{qtyTotal.toLocaleString()}</strong>
          </span>
        </div>
      </header>

      <SkuListFilterPanel
        basePath="/mopi/hole"
        mode="controlled"
        values={{ ...filters, q: liveQ }}
        onChange={(next) => {
          setFilters(next);
          if (next.q === '') setLiveQ('');
        }}
        onLiveQueryChange={setLiveQ}
        pressureTotals={pressureTotals}
        searchRows={rows}
        showMaterial={false}
        showFace={false}
        showSort
        skuCount={filtered.length}
      />

      <section className="overflow-x-auto rounded-md border border-slate-800">
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
            <span>
              {filtered.length.toLocaleString()}건 · {safePage}/{totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                이전
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                다음
              </button>
            </div>
          </div>
        ) : null}
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <SkuIdentityHeaders />
              <th className="px-3 py-2 text-right">수량</th>
              <th className="px-3 py-2">완성품 합류</th>
              <th className="px-3 py-2">지시</th>
              <th className="px-3 py-2">홀가공완료</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.orderId} className="border-b border-slate-800/80 align-top">
                <SkuIdentityCells row={r} />
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-300">
                  {r.quantity.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-teal-200">{r.finishedItemCode}</div>
                  <div className="text-[11px] text-slate-500">{r.finishedItemName}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.orderNo}</td>
                <td className="px-3 py-2">
                  <form action={completeMopiHoleAction}>
                    <input type="hidden" name="orderId" value={r.orderId} />
                    <input type="hidden" name="returnTo" value="/mopi/hole" />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-950/50 px-3 text-xs font-semibold text-emerald-100 hover:border-emerald-500"
                      title="완성품 OPEN LOT에 합류"
                    >
                      홀가공완료
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {rows.length === 0 ? '홀가공대기 없음. 가공대기에서 가공완료 하세요.' : '필터에 맞는 행이 없습니다.'}
          </p>
        ) : null}
      </section>
    </div>
  );
}
