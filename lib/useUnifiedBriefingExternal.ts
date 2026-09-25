'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfirmedSignalRecord } from '@/lib/serverVirtualStore';
import type { WhaleMemoryZoneRow } from '@/lib/whaleMemory';
import {
  buildNewsBriefingSnap,
  buildSignalHistoryBriefingSnap,
  buildWhaleBriefingSnap,
  type UnifiedBriefingExternalContext,
} from '@/lib/unifiedBriefingExternalContext';

const NEWS_CACHE_KEY = 'ailongshort-news-events-v1';
const POLL_MS = 60_000;

type NewsEventRaw = { title: string; timeMs: number; symbols?: string[] };

function readNewsCache(): NewsEventRaw[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NewsEventRaw[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useUnifiedBriefingExternal(params: {
  symbol: string;
  chartTf: string;
  currentPrice: number | null | undefined;
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  enabled?: boolean;
}) {
  const enabled = params.enabled !== false;
  const [newsEvents, setNewsEvents] = useState<NewsEventRaw[]>(() => readNewsCache());
  const [whaleZones, setWhaleZones] = useState<WhaleMemoryZoneRow[]>([]);
  const [signals, setSignals] = useState<ConfirmedSignalRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [newsRes, whaleRes, sigRes] = await Promise.all([
        fetch('/api/news-events', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null),
        fetch(
          `/api/whale-memory?symbol=${encodeURIComponent(params.symbol)}&timeframe=${encodeURIComponent(params.chartTf)}`,
          { cache: 'no-store', credentials: 'same-origin' }
        ).catch(() => null),
        fetch('/api/confirmed-signals', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null),
      ]);

      if (newsRes?.ok) {
        const j = (await newsRes.json()) as { events?: NewsEventRaw[] };
        const events = Array.isArray(j.events) ? j.events : [];
        setNewsEvents(events);
        if (typeof window !== 'undefined' && events.length) {
          try {
            window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(events));
          } catch {
            /* ignore */
          }
        }
      }

      if (whaleRes?.ok) {
        const j = (await whaleRes.json()) as { ok?: boolean; zones?: WhaleMemoryZoneRow[] };
        setWhaleZones(j.ok && Array.isArray(j.zones) ? j.zones : []);
      }

      if (sigRes?.ok) {
        const j = (await sigRes.json()) as { ok?: boolean; signals?: ConfirmedSignalRecord[] };
        setSignals(j.ok && Array.isArray(j.signals) ? j.signals : []);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, params.symbol, params.chartTf]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, reload]);

  const context: UnifiedBriefingExternalContext = useMemo(() => {
    const cached = newsEvents.length ? newsEvents : readNewsCache();
    return {
      news: buildNewsBriefingSnap(cached, params.symbol),
      whale: buildWhaleBriefingSnap(whaleZones, params.currentPrice, params.masterDirection),
      signalHistory: buildSignalHistoryBriefingSnap(
        signals,
        params.symbol,
        params.chartTf,
        params.masterDirection
      ),
    };
  }, [
    newsEvents,
    whaleZones,
    signals,
    params.symbol,
    params.chartTf,
    params.currentPrice,
    params.masterDirection,
  ]);

  return { context, loading, reload };
}
