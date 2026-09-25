'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyzeResponse } from '@/types';
import MergedAnalysisMtfTfBoard from '@/app/components/mergedAnalysis/MergedAnalysisMtfTfBoard';
import styles from '../MonthDeskAnalysisBoard.module.css';

const MTF_POLL_MS = 30_000;

export function useMonthDeskMtfAnalyzes(symbol: string, chartTf: string, chartAnalysis: AnalyzeResponse | null) {
  const [rows, setRows] = useState<Array<{ tf: string; analyze: AnalyzeResponse | null }>>([]);
  const [loading, setLoading] = useState(false);
  const gen = useRef(0);

  const fetchMtf = useCallback(
    async (bust = false) => {
      if (!symbol) return;
      const g = ++gen.current;
      setLoading(true);
      try {
        const q = new URLSearchParams({ symbol, timeframe: chartTf });
        if (bust) q.set('_', String(Date.now()));
        const res = await fetch(`/api/mtf-signal-board?${q.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json()) as { rows?: Array<{ tf: string; analyze: AnalyzeResponse }> };
        if (g !== gen.current) return;
        setRows(
          Array.isArray(j.rows)
            ? j.rows.map((r) => ({ tf: r.tf, analyze: (r.analyze as AnalyzeResponse) ?? null }))
            : []
        );
      } catch {
        if (g === gen.current) setRows([]);
      } finally {
        if (g === gen.current) setLoading(false);
      }
    },
    [symbol, chartTf]
  );

  useEffect(() => {
    void fetchMtf(true);
  }, [fetchMtf, chartAnalysis?.currentPrice]);

  useEffect(() => {
    const id = window.setInterval(() => void fetchMtf(false), MTF_POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchMtf]);

  return { rows, loading, reload: () => void fetchMtf(true) };
}
