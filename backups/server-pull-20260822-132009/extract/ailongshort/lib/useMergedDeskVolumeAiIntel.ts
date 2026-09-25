'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Candle } from '@/types';
import type { VolumePhaseMtfBundle } from '@/lib/volumePhaseMtf';
import { buildMergedDeskVolumeAiPack, type MergedDeskVolumeAiPack } from '@/lib/mergedDeskVolumeAiIntel';
import { useBitgetWhaleDnaStats } from '@/lib/useBitgetWhaleDnaStats';

const PHASE_MTF_QUERY = '1m,1h,1d,1w,1M';

export function useMergedDeskVolumeAiIntel(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[] | null;
  enabled: boolean;
}): {
  pack: MergedDeskVolumeAiPack | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const { symbol, timeframe, candles, enabled } = params;
  const bitget = useBitgetWhaleDnaStats({ symbol, timeframe, enabled });
  const [phaseBundle, setPhaseBundle] = useState<VolumePhaseMtfBundle | null>(null);
  const [phaseLoading, setPhaseLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPhaseBundle(null);
      setPhaseLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setPhaseLoading(true);
      try {
        const q = new URLSearchParams({
          symbol: symbol.toUpperCase(),
          timeframes: PHASE_MTF_QUERY,
        });
        const res = await fetch(`/api/volume-phase-stats/mtf?${q}`, { cache: 'no-store' });
        const j = (await res.json()) as { ok?: boolean; bundle?: VolumePhaseMtfBundle };
        if (!cancelled) {
          setPhaseBundle(j.ok && j.bundle ? j.bundle : null);
        }
      } catch {
        if (!cancelled) setPhaseBundle(null);
      } finally {
        if (!cancelled) setPhaseLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, symbol, timeframe]);

  const pack = useMemo(() => {
    if (!enabled || !candles?.length) return null;
    return buildMergedDeskVolumeAiPack({
      candles,
      chartTf: timeframe,
      dna: bitget.dna,
      single: bitget.single,
      range: bitget.range,
      mtf: bitget.mtf,
      phaseBundle,
      dataSpanKo: bitget.dataSpanKo,
    });
  }, [
    enabled,
    candles,
    timeframe,
    bitget.dna,
    bitget.single,
    bitget.range,
    bitget.mtf,
    bitget.dataSpanKo,
    phaseBundle,
  ]);

  return {
    pack,
    loading: bitget.loading || phaseLoading,
    error: bitget.error,
    reload: bitget.reload,
  };
}
