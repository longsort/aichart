'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SurgeCoinRow } from '@/lib/surgeCoinScan';

type Props = {
  activeSymbol: string;
  onPick: (symbol: string) => void;
};

export function PreSurgeHeaderChips({ activeSymbol, onPick }: Props) {
  const [rows, setRows] = useState<SurgeCoinRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/surge-scan?mode=pre&limit=8', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const j = (await res.json()) as { ok?: boolean; rows?: SurgeCoinRow[] };
      if (res.ok && Array.isArray(j.rows)) {
        const ranked = [...j.rows].sort((a, b) => {
          const g = { A: 0, B: 1, C: 2 } as const;
          return (g[a.grade || 'C'] - g[b.grade || 'C']) || b.score - a.score;
        });
        const ab = ranked.filter((r) => r.grade === 'A' || r.grade === 'B');
        setRows((ab.length >= 4 ? ab : ranked).slice(0, 8));
      }
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 50_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (rows.length === 0) return null;

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span
        className="badge"
        title="급등 전 후보 · 24h 압축+15m 거래량점화+1h. 확정 아님. 클릭→통합분석"
        style={{
          borderColor: 'rgba(34,211,238,0.45)',
          color: '#a5f3fc',
          fontWeight: 800,
        }}
      >
        급등전
      </span>
      {rows.map((r) => {
        const on = r.symbol === activeSymbol;
        const pct = `${r.changePct24h >= 0 ? '+' : ''}${r.changePct24h.toFixed(1)}%`;
        const g = r.grade || 'B';
        const border =
          g === 'A' ? 'rgba(74,222,128,0.7)' : g === 'B' ? 'rgba(34,211,238,0.55)' : 'rgba(148,163,184,0.45)';
        return (
          <button
            key={r.symbol}
            type="button"
            className={`tool-chip tool-chip-button${on ? ' tool-chip-active' : ''}`}
            title={r.noteKo}
            onClick={() => onPick(r.symbol)}
            style={{
              fontWeight: 800,
              fontSize: 11,
              padding: '5px 9px',
              borderColor: on ? 'rgba(74,222,128,0.85)' : border,
              color: g === 'A' ? '#bbf7d0' : '#a5f3fc',
            }}
          >
            {g} {r.base} {pct}
          </button>
        );
      })}
    </span>
  );
}
