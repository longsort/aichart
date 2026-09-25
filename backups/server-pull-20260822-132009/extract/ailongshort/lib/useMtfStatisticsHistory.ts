'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UnifiedMtfAnalysisStatistics } from '@/lib/unifiedMtfAnalysisStatistics';
import type { MtfStatisticsHistoryDashboard } from '@/lib/mtfStatisticsHistoryStore';

const POLL_MS = 45_000;
const APPEND_MIN_MS = 3 * 60_000;

export function useMtfStatisticsHistory(params: {
  symbol: string;
  chartTf: string;
  currentPrice: number | null | undefined;
  stats: UnifiedMtfAnalysisStatistics | null;
  enabled?: boolean;
}) {
  const enabled = params.enabled !== false;
  const [dashboard, setDashboard] = useState<MtfStatisticsHistoryDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const lastAppendRef = useRef(0);
  const dedupeRef = useRef('');

  const fetchDashboard = useCallback(async () => {
    if (!enabled || !params.symbol) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        symbol: params.symbol,
        chartTf: params.chartTf,
      });
      if (params.currentPrice && params.currentPrice > 0) {
        q.set('currentPrice', String(params.currentPrice));
      }
      const res = await fetch(`/api/mtf-statistics-history?${q.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const j = (await res.json()) as { ok?: boolean; dashboard?: MtfStatisticsHistoryDashboard | null };
      if (j.ok && j.dashboard) setDashboard(j.dashboard);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [enabled, params.symbol, params.chartTf, params.currentPrice]);

  const appendSnapshot = useCallback(async () => {
    if (!enabled || !params.stats || !params.currentPrice || params.currentPrice <= 0) return;

    const dedupe = [
      params.symbol,
      params.chartTf,
      params.stats.statisticalVerdict,
      params.stats.weightedLongPct,
      params.stats.liveTfCount,
    ].join('::');

    const now = Date.now();
    if (dedupeRef.current === dedupe && now - lastAppendRef.current < APPEND_MIN_MS) return;
    if (now - lastAppendRef.current < APPEND_MIN_MS) return;

    dedupeRef.current = dedupe;
    lastAppendRef.current = now;

    try {
      const res = await fetch('/api/mtf-statistics-history', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: params.stats,
          currentPrice: params.currentPrice,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; dashboard?: MtfStatisticsHistoryDashboard };
      if (j.ok && j.dashboard) setDashboard(j.dashboard);
    } catch {
      /* ignore */
    }
  }, [enabled, params.stats, params.symbol, params.chartTf, params.currentPrice]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void fetchDashboard(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, fetchDashboard]);

  useEffect(() => {
    if (!params.stats) return;
    void appendSnapshot();
  }, [params.stats, appendSnapshot]);

  const reload = useCallback(() => {
    void fetchDashboard();
    void appendSnapshot();
  }, [fetchDashboard, appendSnapshot]);

  return { dashboard, loading, reload };
}
