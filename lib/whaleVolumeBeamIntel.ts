/**
 * Bitget 과거 CSV·카탈로그 → 롱빔/숏빔 · 약/중/강 반등·하락 · 진입·목표 (현물 %)
 * zone/SMC 미터치 — 거래량·캔들 지능 전용
 */
import type { Candle } from '@/types';
import type {
  BitgetWhaleVolumeCatalog,
  WhaleVolumeLiveMatch,
} from '@/lib/bitgetWhaleVolumeCatalog';
import { matchWhaleVolumeAtIndex } from '@/lib/bitgetWhaleVolumeCatalog';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { buildWhaleMoveTierPack, type WhaleMoveTierPack } from '@/lib/whaleVolumeMoveTierKo';
import type { RangeSegmentCompare, SingleCandleCompare } from '@/lib/bitgetWhaleVolumeCompare';
import { detectVolumeRangePhases } from '@/lib/volumeRangeAccumDist';
import { scoreGreenTrapSegment } from '@/lib/volumeCandleJoint';
import { normalizeChartTimeframe } from '@/lib/constants';

export type BeamKindKo = '롱빔' | '숏빔' | '관망';
export type VerdictKo = '상승' | '하락' | '횡보';

export type WhaleBeamHit = {
  id: string;
  barIdx: number;
  time: number;
  timeFrom: number;
  timeTo: number;
  timeBoxTo: number;
  isLive: boolean;
  tierBtc: number;
  beamKo: BeamKindKo;
  verdictKo: VerdictKo;
  segKind: string;
  move: WhaleMoveTierPack;
  sampleCount: number;
  fromIdx: number;
  toIdx: number;
  volIdx: number;
  volClusterFromIdx: number;
  volClusterToIdx: number;
  volClusterTimeFrom: number;
  volClusterTimeTo: number;
  priceHigh: number;
  priceLow: number;
  priceClose: number;
  entryPrice: number;
  targetPrice: number;
  forecastPct: number | null;
  forecastBars: number;
  strength: number;
  phase?: 'accumulation' | 'distribution';
};

export type WhaleBeamTierStat = {
  tierBtc: number;
  sideKo: string;
  beamKo: BeamKindKo;
  medianPct: number | null;
  p25Pct: number | null;
  p75Pct: number | null;
  sampleCount: number;
  labelKo: string;
};

export type WhaleBeamOracle = {
  railTitleKo: string;
  whaleDnaKo: string;
  forceFlowKo: string;
  futureScenarioKo: string;
  compareKo: string;
  volIntelKo: string;
  longPct: number;
  shortPct: number;
};

export type WhaleBeamIntelPack = {
  symbol: string;
  timeframe: string;
  listingFromKo: string;
  catalogBars: number;
  catalogEvents: number;
  live: WhaleBeamHit | null;
  history: WhaleBeamHit[];
  tierStats: WhaleBeamTierStat[];
  summaryKo: string;
  oracle: WhaleBeamOracle | null;
};

function sideKo(side: string): string {
  if (side === 'buy') return '매수';
  if (side === 'sell') return '매도';
  if (side === 'bull') return '양봉';
  return '음봉';
}

function rangeWindowForTf(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number> = { '15m': 10, '1h': 8, '4h': 6, '1d': 5 };
  return map[tf] ?? 8;
}

function resolveVerdict(medianPct: number | null): VerdictKo {
  if (medianPct == null || !Number.isFinite(medianPct)) return '횡보';
  if (medianPct > 0.12) return '상승';
  if (medianPct < -0.12) return '하락';
  return '횡보';
}

function resolveRangeBox(
  sorted: Candle[],
  barIdx: number,
  tf: string,
  fallbackWin: number
): { fromIdx: number; toIdx: number; segKind: string; phase?: 'accumulation' | 'distribution' } {
  const phases = detectVolumeRangePhases(sorted, tf, 120, 6);
  const ending = phases
    .filter((p) => p.toIdx <= barIdx && barIdx - p.toIdx <= 4)
    .sort((a, b) => b.score - a.score || b.toIdx - a.toIdx)[0];
  if (ending) {
    const segKind =
      ending.phase === 'accumulation'
        ? '매집구간'
        : ending.phase === 'distribution'
          ? '분산구간'
          : '횡보박스';
    return {
      fromIdx: ending.fromIdx,
      toIdx: Math.min(barIdx, ending.toIdx),
      segKind,
      phase: ending.phase === 'neutral' ? undefined : ending.phase,
    };
  }
  const inside = phases.find((p) => barIdx >= p.fromIdx && barIdx <= p.toIdx);
  if (inside) {
    const segKind =
      inside.phase === 'accumulation'
        ? '매집구간'
        : inside.phase === 'distribution'
          ? '분산구간'
          : '횡보박스';
    return {
      fromIdx: inside.fromIdx,
      toIdx: barIdx,
      segKind,
      phase: inside.phase === 'neutral' ? undefined : inside.phase,
    };
  }
  const win = fallbackWin;
  const fromIdx = Math.max(0, barIdx - win + 1);
  return { fromIdx, toIdx: barIdx, segKind: '횡보박스' };
}

function volClusterInRange(
  sorted: Candle[],
  fromIdx: number,
  toIdx: number
): { volFrom: number; volTo: number; peakIdx: number } {
  let peakIdx = fromIdx;
  let peakRvol = 0;
  for (let i = fromIdx; i <= toIdx; i++) {
    const sma = smaTotalVolumeAt(sorted, i, 20);
    const rvol = sma > 0 ? sorted[i]!.volume / sma : 0;
    if (rvol >= peakRvol) {
      peakRvol = rvol;
      peakIdx = i;
    }
  }
  let volFrom = peakIdx;
  let volTo = peakIdx;
  for (let i = peakIdx - 1; i >= fromIdx; i--) {
    const sma = smaTotalVolumeAt(sorted, i, 20);
    const rvol = sma > 0 ? sorted[i]!.volume / sma : 0;
    if (rvol >= Math.max(1.1, peakRvol * 0.55)) volFrom = i;
    else break;
  }
  for (let i = peakIdx + 1; i <= toIdx; i++) {
    const sma = smaTotalVolumeAt(sorted, i, 20);
    const rvol = sma > 0 ? sorted[i]!.volume / sma : 0;
    if (rvol >= Math.max(1.1, peakRvol * 0.55)) volTo = i;
    else break;
  }
  return { volFrom, volTo, peakIdx };
}

function resolveBeamKo(
  match: Pick<WhaleVolumeLiveMatch, 'dominant' | 'fingerprint'>,
  medianPct: number | null,
  rvol: number | null
): BeamKindKo {
  const isBeam = (rvol != null && rvol >= 2.0) || match.fingerprint.rvol === 'extreme';
  if (!isBeam) return '관망';
  if (medianPct != null && medianPct > 0.2) return '롱빔';
  if (medianPct != null && medianPct < -0.2) return '숏빔';
  if (match.dominant === 'LONG') return '롱빔';
  if (match.dominant === 'SHORT') return '숏빔';
  return '관망';
}

function hitFromMatch(params: {
  candles: Candle[];
  catalog: BitgetWhaleVolumeCatalog;
  barIdx: number;
  isLive: boolean;
  singleCandle?: SingleCandleCompare | null;
  rangeSegment?: RangeSegmentCompare | null;
}): WhaleBeamHit | null {
  const { candles, catalog, barIdx, isLive, singleCandle, rangeSegment } = params;
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (barIdx < 20 || barIdx >= n) return null;

  const match = matchWhaleVolumeAtIndex(sorted, catalog, barIdx);
  if (!match || match.sampleCount < 3) return null;

  const primaryH = match.primaryHorizon;
  const bucket = match.bucket;
  const hBand = bucket?.horizons.find((x) => x.bars === primaryH) ?? bucket?.horizons[0];

  let medianPct = hBand?.medianPct ?? null;
  let p25 = hBand?.p25Pct ?? null;
  let p75 = hBand?.p75Pct ?? null;
  let longPct = hBand?.longPct ?? match.longPct;
  let shortPct = hBand?.shortPct ?? match.shortPct;

  if (isLive) {
    const rgBand =
      rangeSegment?.forecasts.find((f) => f.bars === primaryH) ?? rangeSegment?.forecasts[0];
    const scBand =
      singleCandle?.forecasts.find((f) => f.bars === primaryH) ?? singleCandle?.forecasts[0];
    const liveBand = rgBand ?? scBand;
    if (liveBand && liveBand.sampleCount >= 3) {
      medianPct = liveBand.medianPct ?? medianPct;
      p25 = liveBand.p25Pct ?? p25;
      p75 = liveBand.p75Pct ?? p75;
      longPct = liveBand.longPct;
      shortPct = liveBand.shortPct;
    }
  }

  const tf = normalizeChartTimeframe(catalog.timeframe);
  const fallbackWin = rangeSegment?.bars ?? rangeWindowForTf(tf);
  const rangeBox = resolveRangeBox(sorted, barIdx, tf, fallbackWin);
  const fromIdx = rangeBox.fromIdx;
  const toIdx = rangeBox.toIdx;
  const seg = sorted.slice(fromIdx, toIdx + 1);
  const cluster = volClusterInRange(sorted, fromIdx, toIdx);
  const phases = detectVolumeRangePhases(sorted, tf, 100, primaryH);
  const phase = phases.find((p) => barIdx >= p.fromIdx && barIdx <= p.toIdx) ?? null;
  const trap = scoreGreenTrapSegment(seg);

  const move = buildWhaleMoveTierPack({
    medianPct,
    p25Pct: p25,
    p75Pct: p75,
    forecastBars: primaryH,
    longPct,
    shortPct,
    phase: rangeBox.phase ?? (phase?.phase === 'neutral' ? undefined : phase?.phase),
    trap: trap.isTrap,
    scenarioKo: isLive ? rangeSegment?.scenarioKo?.slice(0, 10) : rangeBox.segKind.slice(0, 6),
  });

  const sma = smaTotalVolumeAt(sorted, barIdx, 20);
  const rvol = sma > 0 ? sorted[barIdx]!.volume / sma : match.currentRvol;
  const beamKo = resolveBeamKo(match, medianPct, rvol);
  const verdictKo = resolveVerdict(medianPct);

  if (beamKo !== '관망' || verdictKo !== '횡보') {
    move.chartLine1 = `구간→${verdictKo} · ${beamKo !== '관망' ? `${beamKo} · ` : ''}${move.tierLabel} ${move.pctLabel}`;
    move.chartLine2 = `${rangeBox.segKind} · ${move.entryKo} · +${primaryH}봉 · n${match.sampleCount}`;
    move.volLine = `${rangeBox.segKind} ${beamKo !== '관망' ? beamKo : verdictKo} ${move.rangeLabel || move.pctLabel}`;
  } else {
    move.chartLine1 = `구간→${verdictKo} · ${rangeBox.segKind} ${move.pctLabel}`;
    move.chartLine2 = `${move.entryKo} · n${match.sampleCount}`;
    move.volLine = `${rangeBox.segKind} ${move.pctLabel}`;
  }

  const c = sorted[barIdx]!;
  const close = c.close;
  const hi = Math.max(...seg.map((x) => x.high));
  const lo = Math.min(...seg.map((x) => x.low));
  const entryPrice = move.dir === 'long' ? lo : move.dir === 'short' ? hi : close;
  const targetPrice =
    close > 0 && medianPct != null ? close * (1 + medianPct / 100) : close;

  const strength =
    (match.sampleCount >= 15 ? 20 : match.sampleCount) +
    (beamKo !== '관망' ? 18 : 0) +
    (verdictKo !== '횡보' ? 12 : 0) +
    (isLive ? 30 : 0) +
    Math.abs(medianPct ?? 0) +
    (rangeBox.segKind !== '횡보박스' ? 8 : 0);

  if (!isLive && beamKo === '관망' && verdictKo === '횡보') return null;

  return {
    id: `beam-${barIdx}-${match.tierBtc}`,
    barIdx,
    time: c.time as number,
    timeFrom: sorted[fromIdx]!.time as number,
    timeTo: sorted[toIdx]!.time as number,
    timeBoxTo: sorted[Math.max(fromIdx, isLive && toIdx > fromIdx ? toIdx - 1 : toIdx)]!.time as number,
    isLive,
    tierBtc: match.tierBtc,
    beamKo,
    verdictKo,
    segKind: rangeBox.segKind,
    move,
    sampleCount: match.sampleCount,
    fromIdx,
    toIdx,
    volIdx: cluster.peakIdx,
    volClusterFromIdx: cluster.volFrom,
    volClusterToIdx: cluster.volTo,
    volClusterTimeFrom: sorted[cluster.volFrom]!.time as number,
    volClusterTimeTo: sorted[cluster.volTo]!.time as number,
    priceHigh: hi,
    priceLow: lo,
    priceClose: close,
    entryPrice,
    targetPrice,
    forecastPct: medianPct,
    forecastBars: primaryH,
    strength,
    phase: rangeBox.phase,
  };
}

function buildOracleCopy(params: {
  hit: WhaleBeamHit;
  catalog: BitgetWhaleVolumeCatalog;
  rangeSegment?: RangeSegmentCompare | null;
}): WhaleBeamOracle {
  const { hit, catalog, rangeSegment } = params;
  const phaseKo =
    hit.phase === 'accumulation' ? '고래매집' : hit.phase === 'distribution' ? '고래분산' : '세력횡보';
  const domPct =
    hit.verdictKo === '상승'
      ? hit.move.longPct
      : hit.verdictKo === '하락'
        ? hit.move.shortPct
        : Math.max(hit.move.longPct, hit.move.shortPct);
  const simN = rangeSegment?.similarCount ?? hit.sampleCount;
  const volTrend = rangeSegment?.volTrendKo ?? '';
  return {
    railTitleKo: 'WHALE·ORACLE ①',
    whaleDnaKo: `${hit.tierBtc}BTC · ${hit.segKind} · ${phaseKo}`,
    forceFlowKo:
      hit.move.longPct >= hit.move.shortPct
        ? `매수세력 ${hit.move.longPct.toFixed(0)}% · ${volTrend || '거래량 DNA'}`
        : `매도세력 ${hit.move.shortPct.toFixed(0)}% · ${volTrend || '거래량 DNA'}`,
    futureScenarioKo: `유사 ${simN}건 DNA → ${hit.verdictKo} ${domPct.toFixed(0)}% · ${hit.move.tierLabel}`,
    compareKo: `Bitget 선물 ${catalog.totalBars.toLocaleString()}봉 · ${catalog.listingFromKo}~ 대조`,
    volIntelKo: `${hit.segKind} ${hit.beamKo !== '관망' ? hit.beamKo : hit.verdictKo} ${hit.move.rangeLabel || hit.move.pctLabel}`,
    longPct: hit.move.longPct,
    shortPct: hit.move.shortPct,
  };
}

function buildTierStats(catalog: BitgetWhaleVolumeCatalog): WhaleBeamTierStat[] {
  const primaryH = catalog.horizons[0] ?? 4;
  const seen = new Set<number>();
  const out: WhaleBeamTierStat[] = [];

  for (const b of catalog.buckets) {
    if (seen.has(b.tierBtc)) continue;
    if (b.sampleCount < 5) continue;
    seen.add(b.tierBtc);
    const h = b.horizons.find((x) => x.bars === primaryH) ?? b.horizons[0];
    if (!h) continue;
    const beamKo = resolveBeamKo(
      {
        dominant: h.longPct >= 55 ? 'LONG' : h.shortPct >= 55 ? 'SHORT' : 'NEUTRAL',
        fingerprint: { body: b.body, wick: b.wick, rvol: b.rvol },
      },
      h.medianPct,
      b.rvol === 'extreme' ? 3 : b.rvol === 'high' ? 2.2 : 1.5
    );
    out.push({
      tierBtc: b.tierBtc,
      sideKo: sideKo(b.side),
      beamKo,
      medianPct: h.medianPct,
      p25Pct: h.p25Pct,
      p75Pct: h.p75Pct,
      sampleCount: h.sampleCount,
      labelKo: `${b.tierBtc}BTC ${beamKo} ${h.medianPct != null ? `${h.medianPct >= 0 ? '+' : ''}${h.medianPct.toFixed(1)}%` : '—'} n${h.sampleCount}`,
    });
    if (out.length >= 10) break;
  }
  return out.sort((a, b) => b.tierBtc - a.tierBtc);
}

export function buildWhaleBeamIntelPack(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  catalog: BitgetWhaleVolumeCatalog;
  singleCandle?: SingleCandleCompare | null;
  rangeSegment?: RangeSegmentCompare | null;
  historyLookback?: number;
}): WhaleBeamIntelPack | null {
  const {
    symbol,
    timeframe,
    candles,
    catalog,
    singleCandle,
    rangeSegment,
    historyLookback = 72,
  } = params;

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (n < 25) return null;

  const lastIdx = n - 1;
  const live = hitFromMatch({
    candles: sorted,
    catalog,
    barIdx: lastIdx,
    isLive: true,
    singleCandle,
    rangeSegment,
  });

  const history: WhaleBeamHit[] = [];
  const minGap = 8;
  let lastPick = -999;
  for (let i = n - 2; i >= Math.max(20, n - historyLookback); i--) {
    if (lastIdx - i < 10) continue;
    const hit = hitFromMatch({ candles: sorted, catalog, barIdx: i, isLive: false });
    if (!hit) continue;
    if (hit.beamKo === '관망' && hit.verdictKo === '횡보') continue;
    if (i - lastPick < minGap) continue;
    history.push(hit);
    lastPick = i;
    if (history.length >= 3) break;
  }

  const tierStats = buildTierStats(catalog);
  const oracle = live
    ? buildOracleCopy({ hit: live, catalog, rangeSegment })
    : null;
  const summaryKo = live
    ? `${live.tierBtc}BTC ${live.beamKo} · ${live.move.tierLabel} ${live.move.pctLabel} · n${live.sampleCount} · ${catalog.listingFromKo}~`
    : `카탈로그 ${catalog.totalBars}봉 · ${catalog.eventCount}이벤트`;

  return {
    symbol,
    timeframe,
    listingFromKo: catalog.listingFromKo,
    catalogBars: catalog.totalBars,
    catalogEvents: catalog.eventCount,
    live,
    history: history.sort((a, b) => a.barIdx - b.barIdx),
    tierStats,
    summaryKo,
    oracle,
  };
}

export function beamHitToSegmentSignal(hit: WhaleBeamHit) {
  return {
    id: hit.id,
    fromIdx: hit.fromIdx,
    toIdx: hit.toIdx,
    volIdx: hit.volIdx,
    volClusterFromIdx: hit.volClusterFromIdx,
    volClusterToIdx: hit.volClusterToIdx,
    timeVolFrom: hit.volClusterTimeFrom,
    timeVolTo: hit.volClusterTimeTo,
    timeFrom: hit.timeFrom,
    timeTo: hit.timeTo,
    timeBoxTo: hit.timeBoxTo,
    timeVol: hit.time,
    priceHigh: hit.priceHigh,
    priceLow: hit.priceLow,
    priceClose: hit.priceClose,
    entryPrice: hit.entryPrice,
    targetPrice: hit.targetPrice,
    move: hit.move,
    forecastPct: hit.forecastPct,
    forecastBars: hit.forecastBars,
    strength: hit.strength,
    kind: hit.isLive ? ('live' as const) : ('vol_burst' as const),
    phase: hit.phase,
    isLive: hit.isLive,
    beamKo: hit.beamKo,
    verdictKo: hit.verdictKo,
    segKind: hit.segKind,
  };
}

export function beamHitsToSegmentSignals(intel: WhaleBeamIntelPack | null) {
  if (!intel) return [];
  const out = [];
  if (intel.live) out.push(beamHitToSegmentSignal(intel.live));
  for (const h of intel.history) out.push(beamHitToSegmentSignal(h));
  return out;
}

const BEAM_LONG_PAL = ['#34d399', '#6ee7b7', '#a7f3d0'] as const;
const BEAM_SHORT_PAL = ['#fb7185', '#fda4af', '#fecaca'] as const;
const BEAM_NEUT_PAL = ['#fbbf24', '#fcd34d', '#fde68a'] as const;

/** 카탈로그 롱빔/숏빔 히트 → 거래량 막대 색·강조 (텍스트는 마커 레이어) */
export function applyBeamIntelVolumeColors(
  base: import('lightweight-charts').HistogramData<import('lightweight-charts').UTCTimestamp>[],
  candles: Candle[],
  intel: WhaleBeamIntelPack | null
): import('lightweight-charts').HistogramData<import('lightweight-charts').UTCTimestamp>[] {
  if (!intel) return base;
  const hits = [intel.live, ...intel.history].filter(Boolean) as WhaleBeamHit[];
  if (hits.length === 0) return base;

  const out = base.slice();
  for (const hit of hits) {
    const tFrom = hit.volClusterTimeFrom;
    const tTo = hit.volClusterTimeTo;
    for (let i = 0; i < candles.length; i++) {
      const t = Number(candles[i]!.time);
      if (t < tFrom || t > tTo) continue;
      const idx = i;
      if (idx < 0 || idx >= out.length) continue;
      const bar = out[idx]!;
      const isLong = hit.beamKo === '롱빔' || hit.move.dir === 'long' || hit.verdictKo === '상승';
      const isShort = hit.beamKo === '숏빔' || hit.move.dir === 'short' || hit.verdictKo === '하락';
      const palette = isLong ? BEAM_LONG_PAL : isShort ? BEAM_SHORT_PAL : BEAM_NEUT_PAL;
      const tier =
        hit.isLive ? 2 : hit.tierBtc >= 10 ? 2 : hit.tierBtc >= 5 ? 1 : 0;
      const color = palette[Math.min(tier, 2)];
      const boost = hit.isLive ? 1.22 : 1.1;
      out[idx] = {
        ...bar,
        value: (bar.value ?? 0) * boost,
        color,
      };
    }
  }
  return out;
}
