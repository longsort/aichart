/**
 * 횡보 → 1차 거래량(빅롱/빅숏) → 간격 → 2차 터짐 → 현물 % 후행 통계.
 * 거래량 막대/히스토그램 데이터는 건드리지 않음 — 라벨·툴팁·가격선만.
 * 확정 승률·수익 보장 없음 · 표본 부족 시 WAIT.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { detectVolumeRangePhases } from '@/lib/volumeRangeAccumDist';
import type { SwingAnchorVolumeEvent } from '@/lib/mergedDeskSwingAnchorVolumeEvents';
import { fmtSpotPctSigned, spotMoveSinceBarPct } from '@/lib/mergedDeskSpotReactionPct';

const SAMPLE_TRUST_MIN = 12;

export type VolumeBurstSide = 'long' | 'short';

export type VolumeBurstPoint = {
  barIdx: number;
  time: number;
  side: VolumeBurstSide;
  rvol: number;
  buyPct: number;
  vol: number;
  inRange: boolean;
};

export type VolumeBurstPairSample = {
  side: VolumeBurstSide;
  firstIdx: number;
  secondIdx: number;
  gapBars: number;
  rangeBars: number;
  rvol1: number;
  rvol2: number;
  forwardPct: number;
};

export type VolumeBurstBucketStat = {
  side: VolumeBurstSide;
  gapBucketKo: string;
  rvolBucketKo: string;
  sampleCount: number;
  sampleLowTrust: boolean;
  medianPct: number | null;
  p25Pct: number | null;
  p75Pct: number | null;
  labelKo: string;
};

export type VolumeBurstSequenceLive = {
  phaseKo: string;
  side: VolumeBurstSide | 'neutral';
  /** 1차 / 2차 / 돌파 / 대기 */
  stageKo: string;
  first: VolumeBurstPoint | null;
  second: VolumeBurstPoint | null;
  gapBars: number | null;
  forecastMedianPct: number | null;
  forecastP25Pct: number | null;
  forecastP75Pct: number | null;
  forecastKo: string;
  spotSinceFirstPct: number | null;
  noteKo: string;
};

export type VolumeBurstSequenceIntel = {
  horizonBars: number;
  pairSamples: VolumeBurstPairSample[];
  bucketStats: VolumeBurstBucketStat[];
  live: VolumeBurstSequenceLive;
  priceLines: AtlasPulsePriceLine[];
  overlays: OverlayItem[];
  summaryKo: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function horizonForTf(tf: string): number {
  const n = normalizeChartTimeframe(tf);
  const map: Record<string, number> = {
    '1m': 48,
    '5m': 36,
    '15m': 32,
    '1h': 24,
    '4h': 18,
    '1d': 12,
    '1w': 8,
    '1M': 6,
  };
  return map[n] ?? 24;
}

function rvolAt(rows: Candle[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

function forwardSpotPct(rows: Candle[], fromIdx: number, bars: number): number | null {
  const end = Math.min(rows.length - 1, fromIdx + bars);
  const c0 = Number(rows[fromIdx]?.close);
  const c1 = Number(rows[end]?.close);
  if (!(c0 > 0) || !Number.isFinite(c1)) return null;
  return ((c1 - c0) / c0) * 100;
}

function gapBucket(gap: number): string {
  if (gap <= 8) return '짧은간격';
  if (gap <= 24) return '중간간격';
  return '긴간격';
}

function rvolBucket(rv: number): string {
  if (rv >= 2.5) return '초고RVOL';
  if (rv >= 1.85) return '고RVOL';
  return '중RVOL';
}

/** 확정봉만 — RVOL·수급 기준 거래량 터짐 */
export function detectVolumeBurstPoints(
  candles: Candle[],
  timeframe: string,
  period = 20
): VolumeBurstPoint[] {
  const rows = candles;
  const n = rows.length;
  if (n < period + 10) return [];
  const phases = detectVolumeRangePhases(rows, timeframe, 160, 6);
  const lastClosed = n - 2;
  const out: VolumeBurstPoint[] = [];

  for (let i = period; i <= lastClosed; i++) {
    const rv = rvolAt(rows, i, period);
    if (rv == null || rv < 1.38) continue;
    const sp = estimateBarBuySell(rows[i]!);
    const c = rows[i]!;
    let side: VolumeBurstSide | null = null;
    if (sp.buyPct >= 0.56 && Number(c.close) >= Number(c.open) * 0.998) side = 'long';
    else if (sp.sellPct >= 0.56 && Number(c.close) <= Number(c.open) * 1.002) side = 'short';
    if (!side) continue;
    const inRange = phases.some((p) => i >= p.fromIdx && i <= p.toIdx);
    out.push({
      barIdx: i,
      time: Number(c.time),
      side,
      rvol: rv,
      buyPct: sp.buyPct,
      vol: Math.max(0, Number(c.volume) || 0),
      inRange,
    });
  }
  return out;
}

function buildPairCatalog(
  candles: Candle[],
  timeframe: string,
  horizon: number,
  period = 20
): VolumeBurstPairSample[] {
  const bursts = detectVolumeBurstPoints(candles, timeframe, period);
  const phases = detectVolumeRangePhases(candles, timeframe, 200, horizon);
  const samples: VolumeBurstPairSample[] = [];

  for (const phase of phases) {
    const inPhase = bursts.filter((b) => b.barIdx >= phase.fromIdx && b.barIdx <= phase.toIdx + 3);
    for (let a = 0; a < inPhase.length; a++) {
      for (let b = a + 1; b < inPhase.length; b++) {
        const first = inPhase[a]!;
        const second = inPhase[b]!;
        if (first.side !== second.side) continue;
        const gap = second.barIdx - first.barIdx;
        if (gap < 3 || gap > 56) continue;
        const fwd = forwardSpotPct(candles, second.barIdx, horizon);
        if (fwd == null) continue;
        samples.push({
          side: first.side,
          firstIdx: first.barIdx,
          secondIdx: second.barIdx,
          gapBars: gap,
          rangeBars: phase.bars,
          rvol1: first.rvol,
          rvol2: second.rvol,
          forwardPct: fwd,
        });
      }
    }
  }

  /** 횡보 밖 연속 터짐도 표본에 포함 (갭만) */
  for (let i = 0; i < bursts.length; i++) {
    for (let j = i + 1; j < bursts.length; j++) {
      const first = bursts[i]!;
      const second = bursts[j]!;
      if (first.side !== second.side) continue;
      const gap = second.barIdx - first.barIdx;
      if (gap < 4 || gap > 48) continue;
      if (samples.some((s) => s.firstIdx === first.barIdx && s.secondIdx === second.barIdx)) continue;
      const fwd = forwardSpotPct(candles, second.barIdx, horizon);
      if (fwd == null) continue;
      samples.push({
        side: first.side,
        firstIdx: first.barIdx,
        secondIdx: second.barIdx,
        gapBars: gap,
        rangeBars: gap,
        rvol1: first.rvol,
        rvol2: second.rvol,
        forwardPct: fwd,
      });
      break;
    }
  }
  return samples;
}

function buildBucketStats(samples: VolumeBurstPairSample[]): VolumeBurstBucketStat[] {
  const out: VolumeBurstBucketStat[] = [];
  const sides: VolumeBurstSide[] = ['long', 'short'];
  for (const side of sides) {
    const sideSamples = samples.filter((s) => s.side === side);
    if (!sideSamples.length) continue;
    const gaps = Array.from(new Set(sideSamples.map((s) => gapBucket(s.gapBars))));
    const rvols = Array.from(new Set(sideSamples.map((s) => rvolBucket(s.rvol2))));
    for (const g of gaps) {
      for (const r of rvols) {
        const subset = sideSamples.filter(
          (s) => gapBucket(s.gapBars) === g && rvolBucket(s.rvol2) === r
        );
        if (subset.length < 3) continue;
        const pcts = subset.map((s) => s.forwardPct).sort((a, b) => a - b);
        const filtered = pcts.filter((p) => (side === 'long' ? p > -2 : p < 2));
        const use = filtered.length >= 3 ? filtered : pcts;
        const med = percentile(use, 0.5);
        const p25 = percentile(use, 0.25);
        const p75 = percentile(use, 0.75);
        const sideKo = side === 'long' ? '빅롱' : '빅숏';
        out.push({
          side,
          gapBucketKo: g,
          rvolBucketKo: r,
          sampleCount: subset.length,
          sampleLowTrust: subset.length < SAMPLE_TRUST_MIN,
          medianPct: med,
          p25Pct: p25,
          p75Pct: p75,
          labelKo: `${sideKo}·${g}·${r}`,
        });
      }
    }
  }
  return out.sort((a, b) => b.sampleCount - a.sampleCount);
}

function pickBestStat(
  stats: VolumeBurstBucketStat[],
  side: VolumeBurstSide,
  gapBars: number,
  rvol2: number
): VolumeBurstBucketStat | null {
  const g = gapBucket(gapBars);
  const r = rvolBucket(rvol2);
  return (
    stats.find((s) => s.side === side && s.gapBucketKo === g && s.rvolBucketKo === r) ??
    stats.find((s) => s.side === side && s.gapBucketKo === g) ??
    stats.find((s) => s.side === side) ??
    null
  );
}

function fmtRange(p25: number | null, med: number | null, p75: number | null): string {
  if (med == null || !Number.isFinite(med)) return '';
  if (p25 != null && p75 != null && Math.abs(p75 - p25) >= 0.4) {
    return `${fmtSpotPctSigned(p25)}~${fmtSpotPctSigned(p75)}`;
  }
  return fmtSpotPctSigned(med);
}

function resolveLive(
  candles: Candle[],
  timeframe: string,
  bursts: VolumeBurstPoint[],
  swingEvents: SwingAnchorVolumeEvent[],
  stats: VolumeBurstBucketStat[],
  spot: number | null,
  horizon: number
): VolumeBurstSequenceLive {
  const phases = detectVolumeRangePhases(candles, timeframe, 120, horizon);
  const n = candles.length;
  const lastClosed = n - 2;
  const activePhase = phases.find((p) => lastClosed >= p.fromIdx && lastClosed <= p.toIdx + horizon);

  const swingSorted = [...swingEvents].sort((a, b) => a.barIdx - b.barIdx);
  const lastSwing = swingSorted[swingSorted.length - 1] ?? null;
  const prevSwing =
    swingSorted.length >= 2 ? swingSorted[swingSorted.length - 2]! : null;

  let first: VolumeBurstPoint | null = null;
  let second: VolumeBurstPoint | null = null;
  let side: VolumeBurstSide | 'neutral' = 'neutral';

  if (prevSwing && lastSwing && prevSwing.side === lastSwing.side) {
    side = lastSwing.side;
    first =
      bursts.find((b) => b.barIdx === prevSwing.barIdx) ??
      ({
        barIdx: prevSwing.barIdx,
        time: prevSwing.time,
        side: prevSwing.side,
        rvol: prevSwing.rvol,
        buyPct: prevSwing.buyPct,
        vol: 0,
        inRange: true,
      } satisfies VolumeBurstPoint);
    second =
      bursts.find((b) => b.barIdx === lastSwing.barIdx) ??
      ({
        barIdx: lastSwing.barIdx,
        time: lastSwing.time,
        side: lastSwing.side,
        rvol: lastSwing.rvol,
        buyPct: lastSwing.buyPct,
        vol: 0,
        inRange: true,
      } satisfies VolumeBurstPoint);
  } else if (lastSwing) {
    side = lastSwing.side;
    first =
      bursts.find((b) => b.barIdx === lastSwing.barIdx) ??
      ({
        barIdx: lastSwing.barIdx,
        time: lastSwing.time,
        side: lastSwing.side,
        rvol: lastSwing.rvol,
        buyPct: lastSwing.buyPct,
        vol: 0,
        inRange: !!activePhase,
      } satisfies VolumeBurstPoint);
  }

  const gapBars = first && second ? second.barIdx - first.barIdx : null;
  const stageKo = second
    ? '2차터짐'
    : first && activePhase
      ? '1차·횡보대기'
      : first
        ? '1차'
        : activePhase
          ? '횡보매집'
          : '대기';

  const phaseKo = activePhase
    ? activePhase.phase === 'accumulation'
      ? '횡보·매집'
      : activePhase.phase === 'distribution'
        ? '횡보·분산'
        : '횡보'
    : '추세·비횡보';

  let stat: VolumeBurstBucketStat | null = null;
  if (side !== 'neutral' && gapBars != null && second) {
    stat = pickBestStat(stats, side, gapBars, second.rvol);
  } else if (side !== 'neutral' && first) {
    stat = pickBestStat(stats, side, 12, first.rvol);
  }

  const spotSinceFirstPct =
    first && spot != null && spot > 0 ? spotMoveSinceBarPct(candles, first.barIdx, spot) : null;

  const forecastKo =
    stat && stat.medianPct != null && !stat.sampleLowTrust
      ? `과거 n${stat.sampleCount} · ${fmtRange(stat.p25Pct, stat.medianPct, stat.p75Pct)}`
      : stat && stat.medianPct != null
        ? `표본${stat.sampleCount} · ${fmtSpotPctSigned(stat.medianPct)} (참고)`
        : '';

  const noteKo = [
    phaseKo,
    stageKo,
    side === 'long' ? '빅롱' : side === 'short' ? '빅숏' : '',
    gapBars != null ? `간격${gapBars}봉` : '',
    forecastKo,
    '확정아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    phaseKo,
    side,
    stageKo,
    first,
    second,
    gapBars,
    forecastMedianPct: stat?.medianPct ?? null,
    forecastP25Pct: stat?.p25Pct ?? null,
    forecastP75Pct: stat?.p75Pct ?? null,
    forecastKo,
    spotSinceFirstPct,
    noteKo,
  };
}

function buildForecastOverlays(
  candles: Candle[],
  timeframe: string,
  live: VolumeBurstSequenceLive
): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[] } {
  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  if (!live.second || live.forecastMedianPct == null || live.side === 'neutral') {
    return { overlays, priceLines };
  }
  const base = Number(candles[live.second.barIdx]?.close);
  if (!(base > 0)) return { overlays, priceLines };
  const sign = live.side === 'long' ? 1 : -1;
  const medAbs = Math.abs(live.forecastMedianPct);
  const medPx = base * (1 + (sign * medAbs) / 100);
  const sideKo = live.side === 'long' ? '빅롱' : '빅숏';
  const tLast = Number(candles[candles.length - 1]!.time);
  const barSec = candleBarDurationSec(timeframe, tLast);
  const t1 = Number(candles[Math.max(0, live.second.barIdx)]!.time);
  const t2 = tLast + 8 * barSec;
  const col = live.side === 'long' ? '#38bdf8' : '#f87171';

  priceLines.push({
    price: medPx,
    color: col,
    title: `${sideKo}2차·예상중앙`,
    lineWidth: 1,
    lineStyle: 'dotted',
    axisLabel: false,
  });

  if (live.forecastP25Pct != null && live.forecastP75Pct != null) {
    const p25Px = base * (1 + (sign * Math.abs(live.forecastP25Pct)) / 100);
    const p75Px = base * (1 + (sign * Math.abs(live.forecastP75Pct)) / 100);
    priceLines.push({
      price: p25Px,
      color: col,
      title: `${sideKo}·p25`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: false,
    });
    priceLines.push({
      price: p75Px,
      color: col,
      title: `${sideKo}·p75`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: false,
    });
    overlays.push({
      id: `vol-burst-seq-${live.side}-${Math.round(medPx)}`,
      kind: 'zone',
      label: `${sideKo}2차·통계`,
      zoneFaceBase: `${sideKo}통계`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: Math.max(p25Px, p75Px),
      price2: Math.min(p25Px, p75Px),
      confidence: 62,
      color: live.side === 'long' ? 'rgba(56,189,248,0.14)' : 'rgba(248,113,113,0.14)',
      lineLabelColor: col,
      category: 'chartPrimeTrendChannels',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'merged-desk-vol-burst-seq',
      labelTooltip: `${live.noteKo}`,
      structureBias: live.side === 'long' ? 'bullish' : 'bearish',
    });
  }

  return { overlays, priceLines };
}

export function buildVolumeBurstSequenceIntel(params: {
  candles: Candle[];
  timeframe?: string;
  swingEvents?: SwingAnchorVolumeEvent[];
  spotPx?: number | null;
  rvolPeriod?: number;
}): VolumeBurstSequenceIntel {
  const rows = params.candles ?? [];
  const tf = params.timeframe ?? '4h';
  const period = Math.max(8, params.rvolPeriod ?? 20);
  const horizon = horizonForTf(tf);
  const emptyLive: VolumeBurstSequenceLive = {
    phaseKo: '대기',
    side: 'neutral',
    stageKo: '대기',
    first: null,
    second: null,
    gapBars: null,
    forecastMedianPct: null,
    forecastP25Pct: null,
    forecastP75Pct: null,
    forecastKo: '',
    spotSinceFirstPct: null,
    noteKo: '거래량쌍 통계 · 표본 부족',
  };
  if (rows.length < period + horizon + 12) {
    return {
      horizonBars: horizon,
      pairSamples: [],
      bucketStats: [],
      live: emptyLive,
      priceLines: [],
      overlays: [],
      summaryKo: '거래량쌍 · 대기',
    };
  }

  const pairSamples = buildPairCatalog(rows, tf, horizon, period);
  const bucketStats = buildBucketStats(pairSamples);
  const bursts = detectVolumeBurstPoints(rows, tf, period);
  const spot =
    params.spotPx != null && Number.isFinite(Number(params.spotPx)) && Number(params.spotPx) > 0
      ? Number(params.spotPx)
      : Number(rows[rows.length - 1]?.close) > 0
        ? Number(rows[rows.length - 1]!.close)
        : null;
  const live = resolveLive(
    rows,
    tf,
    bursts,
    params.swingEvents ?? [],
    bucketStats,
    spot,
    horizon
  );
  const { overlays, priceLines } = buildForecastOverlays(rows, tf, live);

  const summaryKo = [
    live.phaseKo,
    live.stageKo,
    live.forecastKo ? live.forecastKo.slice(0, 28) : '',
    pairSamples.length ? `표본${pairSamples.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 56);

  return {
    horizonBars: horizon,
    pairSamples,
    bucketStats,
    live,
    priceLines,
    overlays,
    summaryKo: summaryKo || '거래량쌍 · 대기',
  };
}

/** 스윙앵커 빅롱/빅숏 마커·툴팁에 1·2차·통계 % 합류 (막대 데이터 불변) */
export function enrichSwingEventsWithBurstSequence(
  events: SwingAnchorVolumeEvent[],
  intel: VolumeBurstSequenceIntel | null
): SwingAnchorVolumeEvent[] {
  if (!intel?.live || !events.length) return events;
  const { live } = intel;
  if (live.side === 'neutral') return events;

  const firstIdx = live.first?.barIdx ?? null;
  const secondIdx = live.second?.barIdx ?? null;
  const fc = live.forecastKo ? live.forecastKo.replace(/과거 n\d+ · /, '').split(' ')[0] : '';

  return events.map((ev) => {
    const ladderEarly = ev.phase === 'watch' || ev.phase === 'setup';
    let stage = '';
    if (!ladderEarly) {
      if (secondIdx != null && ev.barIdx === secondIdx) stage = '2차';
      else if (firstIdx != null && ev.barIdx === firstIdx) stage = '1차';
    }

    let markerKo = ev.markerKo;
    if (!ladderEarly) {
      if (stage === '2차' && fc) {
        markerKo = `${ev.side === 'long' ? '빅롱' : '빅숏'}·2차 ${fc}`;
      } else if (stage === '1차') {
        markerKo = `${ev.side === 'long' ? '빅롱' : '빅숏'}·1차`;
      }
    }

    const bits = [ev.tooltipKo];
    if (stage) bits.push(`${stage} · ${live.phaseKo}`);
    if (stage === '2차' && live.forecastKo) bits.push(`통계 ${live.forecastKo}`);
    if (live.spotSinceFirstPct != null && ev.barIdx === secondIdx) {
      bits.push(`1차→현물 ${fmtSpotPctSigned(live.spotSinceFirstPct)}`);
    }
    bits.push('조건부·확정아님');

    return {
      ...ev,
      markerKo,
      tooltipKo: bits.filter(Boolean).join(' · '),
    };
  });
}
