'use client';

import { useMemo, useState } from 'react';
import { quickStockInAction } from '@/lib/wms/actions/sku-quick';
import { catalogPressureChipLabel } from '@/lib/wms/yuil-catalog-filters';
import { wmsControlCompact } from '@/components/wms/wms-form-styles';

export type PendingSkuRow = {
  id: string;
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
};

function chipClass(active: boolean) {
  return active
    ? 'inline-flex min-h-8 max-w-full items-center rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white'
    : 'inline-flex min-h-8 max-w-full items-center rounded-md border border-slate-600 bg-slate-900 px-2.5 text-xs text-slate-200 hover:border-teal-600 hover:text-teal-200';
}

/**
 * 입고대기 목록 — 압력 검색·칩으로 클라이언트 필터 (빠른 점프).
 */
export function StockPendingBoard({ rows }: { rows: PendingSkuRow[] }) {
  const [query, setQuery] = useState('');
  const [pressure, setPressure] = useState<string>('ALL');

  const pressureChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = (r.pressureClass || '').trim() || '—';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({
        key,
        count,
        label: catalogPressureChipLabel(key) || key,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const pc = (r.pressureClass || '').trim() || '—';
      if (pressure !== 'ALL' && pc !== pressure) return false;
      if (!q) return true;
      const label = (catalogPressureChipLabel(pc) || pc).toLowerCase();
      const hay = `${pc} ${label} ${r.size} ${r.itemCode} ${r.itemName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, pressure]);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <div className="mb-2 text-sm font-semibold text-slate-100">압력 빠른찾기</div>
        <label className="mb-2 block">
          <span className="sr-only">압력·품번 검색</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="10K · 40BAR · 품번 검색…"
            className="w-full min-h-10 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
            autoComplete="off"
          />
        </label>
        <div className="mb-1 text-[11px] text-slate-500">칩 클릭 = 해당 압력만 · 검색은 목록만 좁힘(페이지 이동 없음)</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chipClass(pressure === 'ALL')}
            onClick={() => setPressure('ALL')}
          >
            전체
            <span className="ml-1 tabular-nums opacity-80">{rows.length.toLocaleString()}</span>
          </button>
          {pressureChips.map((c) => (
            <button
              type="button"
              key={c.key}
              className={chipClass(pressure === c.key)}
              onClick={() => setPressure(c.key)}
              title={c.key}
            >
              <span className="truncate">{c.label}</span>
              <span className="ml-1 tabular-nums opacity-80">{c.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          표시 <strong className="text-slate-300">{filtered.length.toLocaleString()}</strong>
          {pressure !== 'ALL' || query.trim()
            ? ` / 전체 ${rows.length.toLocaleString()}`
            : null}
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/90 text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">압력</th>
              <th className="px-3 py-2">사이즈</th>
              <th className="px-3 py-2">품번 / 명칭</th>
              <th className="px-3 py-2 text-right">보유</th>
              <th className="px-3 py-2">입고완료</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80 align-top">
                <td className="px-3 py-2 font-medium text-teal-200">
                  {catalogPressureChipLabel(r.pressureClass) || r.pressureClass || '—'}
                </td>
                <td className="px-3 py-2 text-slate-200">{r.size || '—'}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-100">{r.itemCode}</div>
                  <div className="text-xs text-slate-400">{r.itemName}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">0</td>
                <td className="px-3 py-2">
                  <form action={quickStockInAction} className="flex min-w-[10rem] flex-wrap items-center gap-2">
                    <input type="hidden" name="itemId" value={r.id} />
                    <input type="hidden" name="returnTo" value="/stock/pending" />
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      defaultValue={1}
                      className={wmsControlCompact}
                      aria-label={`${r.itemCode} 입고수량`}
                      required
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-teal-700 bg-teal-900/50 px-3 text-xs font-semibold text-teal-100 hover:border-teal-500"
                    >
                      입고완료
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {rows.length === 0
              ? '미입고(보유 0) SKU가 없습니다.'
              : '검색·칩 조건에 맞는 SKU가 없습니다.'}
          </p>
        ) : null}
      </section>
    </div>
  );
}
