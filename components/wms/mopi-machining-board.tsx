'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { completeMopiMachiningAction } from '@/lib/wms/actions/mopi-process';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import { matchesSkuQuickSearch } from '@/lib/wms/sku-quick-search';
import { SkuIdentityCells, SkuIdentityHeaders } from '@/components/wms/sku-identity-cells';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';
import type { MopiSkuQueueRow } from '@/lib/wms/mopi-queries';

const TABLE_PAGE_SIZE = 80;

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-8 max-w-full shrink-0 items-center rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white'
    : 'inline-flex min-h-8 max-w-full shrink-0 items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 text-xs text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

/** 가공대기 — 모피 보유>0 · 가공완료 → 홀가공대기 */
export function MopiMachiningBoard({ rows }: { rows: MopiSkuQueueRow[] }) {
  const [query, setQuery] = useState('');
  const [pressure, setPressure] = useState('ALL');
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  function selectPressure(next: string) {
    setPressure(next);
    setQuery('');
    setPage(1);
  }

  const pressureChips = useMemo(() => {
    const counts = new Map<string, { sku: number; onHand: number }>();
    for (const r of rows) {
      const key = (r.pressureClass || '').trim() || '—';
      const cur = counts.get(key) || { sku: 0, onHand: 0 };
      cur.sku += 1;
      cur.onHand += r.onHand;
      counts.set(key, cur);
    }
    return [...counts.entries()]
      .map(([key, v]) => ({
        key,
        count: v.sku,
        onHand: v.onHand,
        label: catalogPressureChipLabel(key) || key,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows.filter((r) => {
      const pc = (r.pressureClass || '').trim() || '—';
      if (pressure !== 'ALL' && pc !== pressure) return false;
      if (!q) return true;
      return matchesSkuQuickSearch(
        {
          pressureClass: pc,
          size: r.size,
          itemCode: r.itemCode,
          itemName: r.itemName,
          extra: `${r.finishedItemCode} ${catalogPressureChipLabel(pc) || pc}`,
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

  const onHandTotal = useMemo(() => rows.reduce((s, r) => s + r.onHand, 0), [rows]);

  function draftQty(row: MopiSkuQueueRow): string {
    if (qtyDraft[row.id] != null) return qtyDraft[row.id];
    return String(row.onHand > 0 ? row.onHand : 1);
  }

  return (
    <div className="space-y-3">
      <header className="sticky top-0 z-20 -mx-1 border-b border-slate-700/80 bg-slate-950/95 px-1 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/mopi/pending" className="text-sm text-slate-400 hover:text-teal-200">
            모피 입고대기
          </Link>
          <span className="text-slate-600">→</span>
          <span className="text-sm font-semibold text-slate-100">가공대기</span>
          <span className="text-slate-600">→</span>
          <Link href="/mopi/hole" className="text-sm text-slate-400 hover:text-teal-200">
            홀가공대기
          </Link>
          <span className="text-xs text-slate-500">
            SKU <strong className="tabular-nums text-slate-200">{rows.length.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-slate-500">
            보유 합{' '}
            <strong className="tabular-nums text-amber-300">{onHandTotal.toLocaleString()}</strong>
          </span>
          <div
            className="flex w-full basis-full flex-wrap items-center gap-1.5"
            role="toolbar"
            aria-label="압력 필터"
          >
            <button type="button" className={chipClass(pressure === 'ALL')} onClick={() => selectPressure('ALL')}>
              전체
              <span className="ml-1 tabular-nums opacity-80">{rows.length.toLocaleString()}</span>
            </button>
            {pressureChips.map((c) => (
              <button
                key={c.key}
                type="button"
                className={chipClass(pressure === c.key)}
                onClick={() => selectPressure(c.key)}
                title={`${c.label} · 보유 ${c.onHand}`}
              >
                {c.label}
                <span className="ml-1 tabular-nums opacity-80">{c.count}</span>
              </button>
            ))}
          </div>
          <label className="flex w-full max-w-md basis-full items-center gap-2 sm:ml-auto sm:basis-auto">
            <span className="sr-only">빠른찾기</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 50A20BL · 20K50A · BLRF…"
              className={wmsControlCompact}
            />
          </label>
        </div>
      </header>

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
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <SkuIdentityHeaders />
              <th className="px-3 py-2 text-right">모피 보유</th>
              <th className="px-3 py-2">완성품</th>
              <th className="px-3 py-2">수량</th>
              <th className="px-3 py-2">가공완료</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80 align-top">
                <SkuIdentityCells row={r} />
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-300">
                  {r.onHand.toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.finishedItemCode}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    max={r.onHand}
                    value={draftQty(r)}
                    onChange={(e) => setQtyDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className={wmsControlCompact}
                    aria-label={`${r.itemCode} 가공 수량`}
                    form={`mopi-mach-${r.id}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <form id={`mopi-mach-${r.id}`} action={completeMopiMachiningAction}>
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="returnTo" value="/mopi/machining" />
                    <input type="hidden" name="quantity" value={draftQty(r)} />
                    <button
                      type="submit"
                      disabled={!r.finishedItemId || r.onHand <= 0}
                      className="inline-flex min-h-9 items-center rounded-md border border-teal-700 bg-teal-900/50 px-3 text-xs font-semibold text-teal-100 hover:border-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
                      title={r.finishedItemId ? '모피 차감 → 홀가공대기' : '대응 완성품 없음'}
                    >
                      가공완료
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {rows.length === 0 ? '가공대기 모피가 없습니다. 먼저 모피 입고완료 하세요.' : '필터에 맞는 행이 없습니다.'}
          </p>
        ) : null}
      </section>
    </div>
  );
}
