/**
 * 캔들 구간 + 거래량 스파이크 → 차트·볼륨 지표식 신호
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { WhaleVolumeLiveMatch, WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import type { SingleCandleCompare, RangeSegmentCompare } from '@/lib/bitgetWhaleVolumeCompare';
import {
  buildWhaleMoveTierPack,
  moveTierFromForwardBand,
  type MoveDir,
  type WhaleMoveTierPack,
} from '@/lib/whaleVolumeMoveTierKo';
import { detectVolumeRangePhases, type VolumeRangePhase } from '@/lib/volumeRangeAccumDist';
import { scoreGreenTrapSegment } from '@/lib/volumeCandleJoint';
import { evalBarVolumeShock, RVOL_SHOCK_MIN, type BarVolumeShock } from '@/lib/volumeShockMetrics';
import type { VolumeShockForecastResult } from '@/lib/volumeShockForecast';
import { sanitizeChartCandlesForSeries, type VolumePanelMarker } from '@/lib/volumeHistogramIntelligence';

export type WhaleSegmentVolumeSignal = {
  id: string;
  fromIdx: number;
  toIdx: number;
  volIdx: number;
  volClusterFromIdx?: number;
  volClusterToIdx?: number;
  timeFrom: number;
  timeTo: number;
  timeBoxTo?: number;
  timeVol: number;
  timeVolFrom?: number;
  timeVolTo?: number;
  priceHigh: number;
  priceLow: number;
  priceClose: number;
  entryPrice?: number;
  targetPrice?: number;
  move: WhaleMoveTierPack;
  forecastPct: number | null;
  forecastBars: number;
  strength: number;
  kind: 'range_vol' | 'vol_burst' | 'live';
  phase?: 'accumulation' | 'distribution';
  isLive: boolean;
  beamKo?: string;
  verdictKo?: string;
  segKind?: string;
};

function forwardPct(rows: Candle[], idx: number, bars: number): number | null {
  const c0 = rows[idx];
  const c1 = rows[idx + bars];
  if (!c0 || !c1 || c0.close <= 0) return null;
  return ((c1.close / c0.close) - 1) * 100;
}

function phaseToMove(
  phase: VolumeRangePhase,
  trap: boolean,
  fwd: number | null,
  focusH: number
): WhaleMoveTierPack | null {
  if (phase.phase === 'neutral' && !trap) return null;
  const p25 = fwd != null ? fwd * 0.55 : null;
  const p75 = fwd != null ? fwd * 1.35 : null;
  return buildWhaleMoveTierPack({
    medianPct: fwd,
    p25Pct: p25,
    p75Pct: p75,
    forecastBars: focusH,
    phase: phase.phase === 'neutral' ? undefined : phase.phase,
    trap,
    scenarioKo: trap ? '양봉위장분산' : phase.phase === 'accumulation' ? '횡보매집' : '횡보분산',
  });
}

function shockToMove(
  shock: BarVolumeShock,
  fwd: number | null,
  focusH: number
): WhaleMoveTierPack {
  const p25 = fwd != null ? fwd * 0.55 : null;
  const p75 = fwd != null ? fwd * 1.35 : null;
  return buildWhaleMoveTierPack({
    medianPct: fwd,
    p25Pct: p25,
    p75Pct: p75,
    forecastBars: focusH,
    scenarioKo: shock.rvol >= 2.5 ? '거래량폭발' : '거래량증가',
    phase: shock.side === 'long' ? 'accumulation' : 'distribution',
  });
}

function signalFromPhase(
  rows: Candle[],
  phase: VolumeRangePhase,
  focusH: number,
  lastIdx: number
): WhaleSegmentVolumeSignal | null {
  const seg = rows.slice(phase.fromIdx, phase.toIdx + 1);
  if (seg.length < 4) return null;

  let volIdx = phase.toIdx;
  let maxVol = 0;
  for (let i = phase.fromIdx; i <= phase.toIdx; i++) {
    const v = rows[i]!.volume || 0;
    if (v >= maxVol) {
      maxVol = v;
      volIdx = i;
    }
  }

  const trap = scoreGreenTrapSegment(seg);
  const hi = Math.max(...seg.map((c) => c.high));
  const lo = Math.min(...seg.map((c) => c.low));
  const fwd =
    phase.breakPct ??
    forwardPct(rows, phase.toIdx, focusH) ??
    forwardPct(rows, volIdx, focusH);
  const move = phaseToMove(phase, trap.isTrap, fwd, focusH);
  if (!move || move.dir === 'neutral') return null;

  const strength = Math.round(phase.score * 12 + (phase.toIdx === lastIdx ? 4 : 0) + (trap.isTrap ? 2 : 0));
  const close = rows[phase.toIdx]!.close;

  return {
    id: `range-${phase.fromIdx}-${phase.toIdx}`,
    fromIdx: phase.fromIdx,
    toIdx: phase.toIdx,
    volIdx,
    timeFrom: rows[phase.fromIdx]!.time as number,
    timeTo: rows[phase.toIdx]!.time as number,
    timeVol: rows[volIdx]!.time as number,
    priceHigh: hi,
    priceLow: lo,
    priceClose: close,
    move,
    forecastPct: fwd,
    forecastBars: focusH,
    strength,
    kind: 'range_vol',
    phase: phase.phase === 'neutral' ? undefined : phase.phase,
    isLive: phase.toIdx >= lastIdx - 1,
  };
}

function signalFromShock(
  rows: Candle[],
  idx: number,
  shock: BarVolumeShock,
  focusH: number,
  lastIdx: number
): WhaleSegmentVolumeSignal | null {
  const win = Math.min(8, idx);
  const fromIdx = Math.max(0, idx - win);
  const seg = rows.slice(fromIdx, idx + 1);
  const hi = Math.max(...seg.map((c) => c.high));
  const lo = Math.min(...seg.map((c) => c.low));
  const fwd = forwardPct(rows, idx, focusH);
  const move = shockToMove(shock, fwd, focusH);

  return {
    id: `burst-${idx}`,
    fromIdx,
    toIdx: idx,
    volIdx: idx,
    timeFrom: rows[fromIdx]!.time as number,
    timeTo: rows[idx]!.time as number,
    timeVol: rows[idx]!.time as number,
    priceHigh: hi,
    priceLow: lo,
    priceClose: rows[idx]!.close,
    move,
    forecastPct: fwd,
    forecastBars: focusH,
    strength: Math.round(shock.rvol * 8 + (idx === lastIdx ? 6 : 0)),
    kind: 'vol_burst',
    isLive: idx === lastIdx,
  };
}

function dedupeSignals(list: WhaleSegmentVolumeSignal[]): WhaleSegmentVolumeSignal[] {
  const sorted = [...list].sort((a, b) => b.strength - a.strength || b.toIdx - a.toIdx);
  const out: WhaleSegmentVolumeSignal[] = [];
  for (const s of sorted) {
    const overlap = out.some((o) => {
      const timeOverlap = !(s.toIdx < o.fromIdx - 2 || s.fromIdx > o.toIdx + 2);
      const volDup = Math.abs(s.volIdx - o.volIdx) <= 2 && s.move.tier === o.move.tier;
      return timeOverlap || volDup;
    });
    if (!overlap) out.push(s);
    if (out.length >= 10) break;
  }
  return out.sort((a, b) => a.toIdx - b.toIdx);
}

export function detectWhaleSegmentVolumeSignals(params: {
  candles: Candle[];
  timeframe: string;
  volumeShock?: VolumeShockForecastResult | null;
  whaleMatch?: WhaleVolumeLiveMatch | null;
  singleCandle?: SingleCandleCompare | null;
  rangeSegment?: RangeSegmentCompare | null;
  mtfPack?: WhaleVolumeMtfPack | null;
  maxSignals?: number;
}): WhaleSegmentVolumeSignal[] {
  const {
    candles,
    timeframe,
    volumeShock,
    whaleMatch,
    singleCandle,
    rangeSegment,
    mtfPack,
    maxSignals = 10,
  } = params;

  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < 12) return [];

  const tf = normalizeChartTimeframe(timeframe);
  const focusH = whaleMatch?.primaryHorizon ?? 4;
  const lastIdx = n - 1;
  const hits: WhaleSegmentVolumeSignal[] = [];

  const phases = detectVolumeRangePhases(rows, tf, 120, focusH);
  for (const phase of phases) {
    const sig = signalFromPhase(rows, phase, focusH, lastIdx);
    if (sig) hits.push(sig);
  }

  if (volumeShock) {
    const lookback = 48;
    for (let i = n - 1; i >= Math.max(0, n - lookback); i--) {
      const shock = evalBarVolumeShock(rows, i, volumeShock);
      if (!shock) continue;
      if (i !== lastIdx && !(shock.tags.includes('P99') || shock.rvol >= RVOL_SHOCK_MIN * 1.2)) continue;
      const sig = signalFromShock(rows, i, shock, focusH, lastIdx);
      if (sig) hits.push(sig);
    }
  }

  const primaryH = whaleMatch?.primaryHorizon ?? focusH;
  const rgBand = rangeSegment?.forecasts.find((f) => f.bars === primaryH) ?? rangeSegment?.forecasts[0];
  const scBand = singleCandle?.forecasts.find((f) => f.bars === primaryH) ?? singleCandle?.forecasts[0];
  const band = rgBand ?? scBand;
  const trap = /위장|분산/.test(`${rangeSegment?.scenarioKo ?? ''}${rangeSegment?.theoryKo ?? ''}`);

  if (band && whaleMatch && whaleMatch.sampleCount >= 2) {
    const win = rangeSegment?.bars ?? 8;
    const fromIdx = Math.max(0, lastIdx - win + 1);
    const seg = rows.slice(fromIdx, lastIdx + 1);
    const move = moveTierFromForwardBand(band, {
      phase: rangeSegment?.sellPct && rangeSegment.sellPct >= 52 ? 'distribution' : rangeSegment?.bullPct && rangeSegment.bullPct >= 52 ? 'accumulation' : undefined,
      trap,
      scenarioKo: rangeSegment?.scenarioKo ?? singleCandle?.burstKo?.slice(0, 10),
    });
    hits.push({
      id: `live-${lastIdx}`,
      fromIdx,
      toIdx: lastIdx,
      volIdx: lastIdx,
      timeFrom: rows[fromIdx]!.time as number,
      timeTo: rows[lastIdx]!.time as number,
      timeVol: rows[lastIdx]!.time as number,
      priceHigh: Math.max(...seg.map((c) => c.high)),
      priceLow: Math.min(...seg.map((c) => c.low)),
      priceClose: rows[lastIdx]!.close,
      move,
      forecastPct: band.medianPct,
      forecastBars: primaryH,
      strength: 100 + (whaleMatch.longPct >= 58 || whaleMatch.shortPct >= 58 ? 10 : 0),
      kind: 'live',
      isLive: true,
    });
  }

  return dedupeSignals(hits).slice(-maxSignals);
}

export type WhaleSegmentDrawGeom = {
  id: string;
  mode: 'range_box_live' | 'range_box_past';
  x1: number;
  x2: number;
  yTop: number;
  yBot: number;
  volX1: number;
  volX2: number;
  yVol: number;
  arrowLen: number;
  /** 가격축 직전 — 선·박스만, 텍스트는 우측 레일 */
  lineEndX: number;
  chartLine1: string;
  chartLine2: string;
  volLine: string;
  entryY: number;
  targetY: number;
  entryPrice: number;
  targetPrice: number;
  entryPriceLabel: string;
  targetPriceLabel: string;
  forecastEtaKo: string;
  pctLabel: string;
  color: string;
  dir: MoveDir;
  isLive: boolean;
  verdictKo: string;
  segKind: string;
  beamKo: string;
  breakX: number;
  breakY: number;
  arrowUp: boolean;
  /** 통합·분석 — 우측 여백 오라클 (마지막 봉 겹침 방지) */
  layout?: 'margin_oracle' | 'inline';
  marginLeft?: number;
  marginRight?: number;
  marginAxisX?: number;
  chartAnchorX?: number;
};

function fmtSegPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return p.toFixed(2);
}

function forecastEtaKo(timeframe: string, bars: number): string {
  const tf = normalizeChartTimeframe(timeframe);
  const minPerBar: Record<string, number> = {
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  const mins = (minPerBar[tf] ?? 60) * Math.max(1, bars);
  if (mins < 90) return `${mins}분 이내`;
  if (mins < 1440) return `${Math.round(mins / 60)}시간 이내`;
  return `${Math.round(mins / 1440)}일 이내`;
}

/** 차트에 그릴 신호 — live 1개 + 과거(마지막 봉과 분리) */
export function thinWhaleSegmentSignalsForDraw(
  signals: WhaleSegmentVolumeSignal[],
  lastIdx: number,
  opts?: { maxPast?: number; minBarGap?: number; liveClearance?: number }
): WhaleSegmentVolumeSignal[] {
  const maxPast = opts?.maxPast ?? 3;
  const minBarGap = opts?.minBarGap ?? 8;
  const liveClearance = opts?.liveClearance ?? 6;
  const live = signals.filter((s) => s.isLive).sort((a, b) => b.strength - a.strength);
  const past = signals
    .filter((s) => !s.isLive && s.toIdx < lastIdx - liveClearance)
    .sort((a, b) => b.strength - a.strength || b.toIdx - a.toIdx);
  const bestLive = live[0] ?? null;
  const pickedPast: WhaleSegmentVolumeSignal[] = [];
  for (const s of past) {
    if (pickedPast.length >= maxPast) break;
    const tooClose = pickedPast.some((p) => Math.abs(p.volIdx - s.volIdx) < minBarGap);
    if (tooClose) continue;
    pickedPast.push(s);
  }
  const out = bestLive ? [bestLive, ...pickedPast] : pickedPast;
  return out.sort((a, b) => a.toIdx - b.toIdx);
}

function geomFieldsFromSignal(
  s: WhaleSegmentVolumeSignal,
  priceToY: (p: number) => number | null
): { entryY: number; targetY: number; entryPrice: number; targetPrice: number } {
  const close = s.priceClose;
  const med = s.forecastPct ?? 0;
  const entryPrice =
    s.entryPrice ??
    (s.move.dir === 'long' ? s.priceLow : s.move.dir === 'short' ? s.priceHigh : close);
  const targetPrice =
    s.targetPrice ?? (close > 0 ? close * (1 + med / 100) : close);
  const entryY = priceToY(entryPrice) ?? priceToY(close) ?? 0;
  const targetY = priceToY(targetPrice) ?? entryY;
  return { entryY, targetY, entryPrice, targetPrice };
}

export function buildWhaleSegmentDrawGeom(params: {
  signals: WhaleSegmentVolumeSignal[];
  resolveTimeX: (t: number) => number;
  priceToY: (p: number) => number | null;
  chartHeight: number;
  volPanelTopRatio?: number;
  lastBarTime?: number;
  prevBarTime?: number;
  timeframe?: string;
  chartWidth?: number;
  priceAxisReserve?: number;
  layoutMode?: 'margin' | 'inline';
}): WhaleSegmentDrawGeom[] {
  const {
    signals,
    resolveTimeX,
    priceToY,
    chartHeight,
    volPanelTopRatio = 0.82,
    lastBarTime,
    prevBarTime,
    timeframe = '15m',
    chartWidth = 800,
    priceAxisReserve = 62,
    layoutMode = 'inline',
  } = params;
  const yVolBase = chartHeight * volPanelTopRatio + 10;
  const lineEndX = Math.max(80, chartWidth - priceAxisReserve);
  const marginW = 92;
  const marginRight = Math.max(lineEndX, chartWidth - priceAxisReserve - 4);
  const marginLeft = Math.max(80, marginRight - marginW);
  const marginAxisX = marginLeft + marginW / 2;
  const live = signals.find((s) => s.isLive);
  const past = signals.filter((s) => !s.isLive);
  const out: WhaleSegmentDrawGeom[] = [];

  const pushGeom = (
    s: WhaleSegmentVolumeSignal,
    mode: 'range_box_live' | 'range_box_past',
    yVolOffset: number,
    arrowScale: number
  ) => {
    const x1 = resolveTimeX(s.timeFrom);
    const vx1 = resolveTimeX(s.timeVolFrom ?? s.timeFrom);
    const vx2 = resolveTimeX(s.timeVolTo ?? s.timeTo);
    const yTop = priceToY(s.priceHigh);
    const yBot = priceToY(s.priceLow);

    const isLiveMode = mode === 'range_box_live';
    const boxEndT = isLiveMode && s.timeBoxTo != null ? s.timeBoxTo : s.timeTo;
    const x2resolved = resolveTimeX(boxEndT);
    if (!Number.isFinite(x1) || !Number.isFinite(x2resolved) || yTop == null || yBot == null) return;

    const boxTop = Math.min(yTop, yBot) - 5;
    const boxBot = Math.max(yTop, yBot) + 5;
    const med = Math.abs(s.forecastPct ?? 0);
    const arrowLen = Math.min(100, Math.max(40, 36 + med * 12)) * arrowScale;
    const { entryY, targetY, entryPrice, targetPrice } = geomFieldsFromSignal(s, priceToY);

    const x2 = isLiveMode
      ? Math.min(Math.max(x1, x2resolved), lineEndX - 24)
      : Math.max(x1, x2resolved);
    const isUp = s.move.dir === 'long' || s.verdictKo === '상승';
    const useMargin = layoutMode === 'margin' && isLiveMode;
    const chartAnchorX = x2;
    const breakX = useMargin ? marginAxisX : x2;
    const breakY = isUp ? boxTop - 10 : boxBot + 10;

    const pctLabel = s.move.pctLabel || '—';
    const entryPriceLabel = `${s.move.entryKo} ${fmtSegPrice(entryPrice)}`;
    const targetPriceLabel = `목표 ${fmtSegPrice(targetPrice)} (${pctLabel})`;
    const forecastEta = forecastEtaKo(timeframe, s.forecastBars);

    out.push({
      id: s.id,
      mode,
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      yTop: boxTop,
      yBot: boxBot,
      volX1: Math.min(vx1, vx2),
      volX2: Math.max(vx1, vx2),
      yVol: yVolBase + yVolOffset,
      arrowLen,
      lineEndX,
      chartLine1: s.move.chartLine1,
      chartLine2: `${s.move.chartLine2} · ${forecastEta}`,
      volLine: s.move.volLine,
      entryY,
      targetY,
      entryPrice,
      targetPrice,
      entryPriceLabel,
      targetPriceLabel,
      forecastEtaKo: forecastEta,
      pctLabel: s.move.pctLabel || pctLabel,
      color: s.move.color,
      dir: s.move.dir,
      isLive: s.isLive,
      verdictKo: s.verdictKo ?? '횡보',
      segKind: s.segKind ?? '횡보박스',
      beamKo: s.beamKo ?? '관망',
      breakX,
      breakY,
      arrowUp: isUp,
      layout: useMargin ? 'margin_oracle' : 'inline',
      marginLeft: useMargin ? marginLeft : undefined,
      marginRight: useMargin ? marginRight : undefined,
      marginAxisX: useMargin ? marginAxisX : undefined,
      chartAnchorX: useMargin ? chartAnchorX : undefined,
    });
  };

  if (live) pushGeom(live, 'range_box_live', 0, 1);
  past.forEach((s, i) => pushGeom(s, 'range_box_past', i * 6, 0.72));

  return out;
}
