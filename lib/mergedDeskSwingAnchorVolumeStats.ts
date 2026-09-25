/**
 * 스윙앵커 빅롱/빅숏 — 이벤트 로그·N봉 집계 (내부 보정).
 * probFavorable = 조건부 유리 비율 — 확정 승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { matchWhaleVolumeAtIndex } from '@/lib/bitgetWhaleVolumeCatalog';
import type { BitgetWhaleVolumeCatalog } from '@/lib/bitgetWhaleVolumeCatalog';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import {
  detectSwingAnchorVolumeEvents,
  type SwingAnchorVolumeEvent,
} from '@/lib/mergedDeskSwingAnchorVolumeEvents';
import {
  attachSwingAnchorOutcomes,
  swingAnchorHorizonsForTf,
  type SwingAnchorEventWithOutcomes,
  type SwingAnchorHorizonOutcome,
} from '@/lib/mergedDeskSwingAnchorVolumeOutcomes';

const SAMPLE_TRUST_MIN = 12;

export type SwingAnchorStatsBucket = 'big-long' | 'big-short' | 'big-long+whale' | 'big-short+whale';

export type SwingAnchorHorizonAgg = {
  bars: number;
  sampleCount: number;
  sampleLowTrust: boolean;
  /** 조건부 유리 비율 — 확정 승률 아님 */
  probFavorable: number;
  medianClosePct: number | null;
  medianMfePct: number | null;
  medianMaePct: number | null;
  invalidationRate: number;
};

export type SwingAnchorBucketStats = {
  bucket: SwingAnchorStatsBucket;
  labelKo: string;
  horizons: SwingAnchorHorizonAgg[];
};

export type SwingAnchorEventLogEntry = {
  time: number;
  side: 'long' | 'short';
  tier: SwingAnchorStatsBucket;
  volDeltaPct: number;
  rvol: number;
  buyPct: number;
  score: number;
  whaleAligned: boolean;
  whaleBeamKo?: string;
  outcomes: Record<string, SwingAnchorHorizonOutcome>;
};

export type SwingAnchorVolumeStatsFile = {
  version: 1;
  symbol: string;
  timeframe: string;
  builtAt: string;
  totalBars: number;
  eventCount: number;
  horizons: number[];
  buckets: SwingAnchorBucketStats[];
  recentEvents: SwingAnchorEventLogEntry[];
  disclaimerKo: string;
};

function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function resolveWhaleBeamAtBar(
  candles: Candle[],
  catalog: BitgetWhaleVolumeCatalog | null,
  barIdx: number
): { aligned: 'long' | 'short' | null; beamKo: string } {
  if (!catalog || barIdx < 20) return { aligned: null, beamKo: '관망' };
  const match = matchWhaleVolumeAtIndex(candles, catalog, barIdx);
  if (!match || match.sampleCount < 3) return { aligned: null, beamKo: '관망' };

  const bucket = match.bucket;
  const hBand = bucket?.horizons.find((x) => x.bars === match.primaryHorizon) ?? bucket?.horizons[0];
  const medianPct = hBand?.medianPct ?? null;
  const sma = smaTotalVolumeAt(candles, barIdx, 20);
  const rvol = sma > 0 ? (Number(candles[barIdx]?.volume) || 0) / sma : match.currentRvol;
  const isBeam = (rvol != null && rvol >= 2.0) || match.fingerprint.rvol === 'extreme';
  if (!isBeam) return { aligned: null, beamKo: '관망' };

  if (medianPct != null && medianPct > 0.2) return { aligned: 'long', beamKo: '롱빔' };
  if (medianPct != null && medianPct < -0.2) return { aligned: 'short', beamKo: '숏빔' };
  if (match.dominant === 'LONG') return { aligned: 'long', beamKo: '롱빔' };
  if (match.dominant === 'SHORT') return { aligned: 'short', beamKo: '숏빔' };
  return { aligned: null, beamKo: '관망' };
}

function bucketForEvent(
  ev: SwingAnchorVolumeEvent,
  whaleAligned: boolean
): SwingAnchorStatsBucket {
  if (ev.side === 'long') return whaleAligned ? 'big-long+whale' : 'big-long';
  return whaleAligned ? 'big-short+whale' : 'big-short';
}

const BUCKET_LABEL: Record<SwingAnchorStatsBucket, string> = {
  'big-long': '빅롱 V±%',
  'big-short': '빅숏 V±%',
  'big-long+whale': '빅롱+고래DNA',
  'big-short+whale': '빅숏+고래DNA',
};

function aggregateHorizon(
  events: SwingAnchorEventWithOutcomes[],
  h: number
): SwingAnchorHorizonAgg {
  const closePcts: number[] = [];
  const mfePcts: number[] = [];
  const maePcts: number[] = [];
  let favorable = 0;
  let invalidated = 0;
  let n = 0;
  for (const e of events) {
    const o = e.outcomes[`h${h}`];
    if (!o) continue;
    n += 1;
    closePcts.push(o.closePct);
    mfePcts.push(o.mfePct);
    maePcts.push(o.maePct);
    if (o.favorable) favorable += 1;
    if (o.invalidated) invalidated += 1;
  }
  const sortedClose = [...closePcts].sort((a, b) => a - b);
  const sortedMfe = [...mfePcts].sort((a, b) => a - b);
  const sortedMae = [...maePcts].sort((a, b) => a - b);
  return {
    bars: h,
    sampleCount: n,
    sampleLowTrust: n < SAMPLE_TRUST_MIN,
    probFavorable: n ? favorable / n : 0,
    medianClosePct: n ? percentileSorted(sortedClose, 0.5) : null,
    medianMfePct: n ? percentileSorted(sortedMfe, 0.5) : null,
    medianMaePct: n ? percentileSorted(sortedMae, 0.5) : null,
    invalidationRate: n ? invalidated / n : 0,
  };
}

export function computeSwingAnchorVolumeStats(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  catalog?: BitgetWhaleVolumeCatalog | null;
  maxScanEvents?: number;
}): SwingAnchorVolumeStatsFile {
  const tf = normalizeChartTimeframe(params.timeframe);
  const horizons = swingAnchorHorizonsForTf(tf);
  const rows = [...params.candles].sort((a, b) => a.time - b.time);

  const rawEvents = detectSwingAnchorVolumeEvents(rows, {
    timeframe: tf,
    scanBars: Math.min(240, Math.max(80, rows.length - 20)),
    maxEvents: params.maxScanEvents ?? 80,
    minBarGap: 3,
  });

  const enriched: SwingAnchorEventWithOutcomes[] = attachSwingAnchorOutcomes(rows, rawEvents, horizons).map(
    (ev) => {
      const whale = resolveWhaleBeamAtBar(rows, params.catalog ?? null, ev.barIdx);
      const whaleAligned =
        (ev.side === 'long' && whale.aligned === 'long') ||
        (ev.side === 'short' && whale.aligned === 'short');
      return {
        ...ev,
        whaleAligned,
        whaleBeamKo: whale.beamKo !== '관망' ? whale.beamKo : undefined,
      };
    }
  );

  const byBucket = new Map<SwingAnchorStatsBucket, SwingAnchorEventWithOutcomes[]>();
  for (const ev of enriched) {
    const whaleAligned = Boolean((ev as { whaleAligned?: boolean }).whaleAligned);
    const b = bucketForEvent(ev, whaleAligned);
    const list = byBucket.get(b) ?? [];
    list.push(ev);
    byBucket.set(b, list);
  }

  const buckets: SwingAnchorBucketStats[] = (
    ['big-long', 'big-short', 'big-long+whale', 'big-short+whale'] as SwingAnchorStatsBucket[]
  ).map((bucket) => ({
    bucket,
    labelKo: BUCKET_LABEL[bucket],
    horizons: horizons.map((h) => aggregateHorizon(byBucket.get(bucket) ?? [], h)),
  }));

  const recentEvents: SwingAnchorEventLogEntry[] = enriched
    .slice(-50)
    .reverse()
    .map((ev) => {
      const whaleAligned = Boolean((ev as { whaleAligned?: boolean }).whaleAligned);
      return {
        time: ev.time,
        side: ev.side,
        tier: bucketForEvent(ev, whaleAligned),
        volDeltaPct: ev.volDeltaPct,
        rvol: ev.rvol,
        buyPct: ev.buyPct,
        score: ev.score,
        whaleAligned,
        whaleBeamKo: (ev as { whaleBeamKo?: string }).whaleBeamKo,
        outcomes: ev.outcomes,
      };
    });

  return {
    version: 1,
    symbol: params.symbol.toUpperCase(),
    timeframe: tf,
    builtAt: new Date().toISOString(),
    totalBars: rows.length,
    eventCount: enriched.length,
    horizons,
    buckets,
    recentEvents,
    disclaimerKo: '조건부 참고 통계 — 확정 승률·수익 아님 · 샘플 부족 시 신뢰 낮음',
  };
}
