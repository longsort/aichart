'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WhaleVolumeLiveMatch, WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import type { RangeSegmentCompare, SingleCandleCompare } from '@/lib/bitgetWhaleVolumeCompare';
import { buildBitgetWhaleDnaPanel, type BitgetWhaleDnaPanel } from '@/lib/bitgetWhaleDnaPanel';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';

export type BitgetWhaleDnaStatsBundle = {
  dna: BitgetWhaleDnaPanel | null;
  intel: WhaleBeamIntelPack | null;
  single: SingleCandleCompare | null;
  range: RangeSegmentCompare | null;
  mtf: WhaleVolumeMtfPack | null;
  match: WhaleVolumeLiveMatch | null;
  dataSpanKo: string;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useBitgetWhaleDnaStats(params: {
  symbol: string;
  timeframe: string;
  enabled: boolean;
}): BitgetWhaleDnaStatsBundle {
  const { symbol, timeframe, enabled } = params;
  const [intel, setIntel] = useState<WhaleBeamIntelPack | null>(null);
  const [single, setSingle] = useState<SingleCandleCompare | null>(null);
  const [range, setRange] = useState<RangeSegmentCompare | null>(null);
  const [mtf, setMtf] = useState<WhaleVolumeMtfPack | null>(null);
  const [match, setMatch] = useState<WhaleVolumeLiveMatch | null>(null);
  const [dataSpanKo, setDataSpanKo] = useState('');
  const [similarHistoryCount, setSimilarHistoryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setIntel(null);
      setSingle(null);
      setRange(null);
      setMtf(null);
      setMatch(null);
      setDataSpanKo('');
      setSimilarHistoryCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({
          symbol: symbol.toUpperCase(),
          timeframe,
          mtf: '1',
        });
        const bq = new URLSearchParams({ symbol: symbol.toUpperCase(), timeframe });
        const [matchRes, beamRes] = await Promise.all([
          fetch(`/api/bitget-whale-volume-match?${q}`, { cache: 'no-store' }),
          fetch(`/api/bitget-whale-volume-beam-intel?${bq}`, { cache: 'no-store' }),
        ]);
        const matchData = (await matchRes.json()) as {
          ok?: boolean;
          match?: WhaleVolumeLiveMatch | null;
          mtfPack?: WhaleVolumeMtfPack | null;
          catalogMeta?: { dataSpanKo?: string; listingFromKo?: string } | null;
          candleCompare?: {
            singleCandle?: SingleCandleCompare | null;
            rangeSegment?: RangeSegmentCompare | null;
            similarHistoryCount?: number;
          } | null;
        };
        const beamData = (await beamRes.json()) as {
          ok?: boolean;
          intel?: WhaleBeamIntelPack | null;
          catalogMeta?: { dataSpanKo?: string } | null;
        };
        if (cancelled) return;

        if (matchData?.ok) {
          setMatch(matchData.match ?? null);
          setMtf(matchData.mtfPack ?? null);
          setSingle(matchData.candleCompare?.singleCandle ?? null);
          setRange(matchData.candleCompare?.rangeSegment ?? null);
          setSimilarHistoryCount(matchData.candleCompare?.similarHistoryCount ?? 0);
          setDataSpanKo(
            matchData.catalogMeta?.dataSpanKo ??
              beamData.catalogMeta?.dataSpanKo ??
              matchData.catalogMeta?.listingFromKo ??
              ''
          );
        } else {
          setMatch(null);
          setMtf(null);
          setSingle(null);
          setRange(null);
          setSimilarHistoryCount(0);
        }

        setIntel(beamData?.ok && beamData.intel ? beamData.intel : null);
        if (beamData?.catalogMeta?.dataSpanKo) {
          setDataSpanKo(beamData.catalogMeta.dataSpanKo);
        }

        if (!matchData?.ok && !beamData?.ok) {
          setError('Bitget DNA 데이터 없음');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'fetch failed');
          setIntel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, symbol, timeframe, tick]);

  const dna = buildBitgetWhaleDnaPanel({
    intel,
    single,
    range,
    mtf,
    match,
    dataSpanKo: dataSpanKo || undefined,
    similarHistoryCount,
  });

  return {
    dna,
    intel,
    single,
    range,
    mtf,
    match,
    dataSpanKo,
    loading,
    error,
    reload,
  };
}
