/**
 * 통합·분석 — 스윙(1~7일+) 차트 작도: 롱/숏 구간·채널·전환·AI zone/line.
 * 조건부 참고용 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  computeInstitutionalSuperTrendEnvelopeSegmentsFused,
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type InstitutionalSuperTrendCore,
  type MonthDeskBandFusionContext,
} from '@/lib/institutionalSuperBand';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import { buildMergedAdvancedSwingFusionPack } from '@/lib/mergedAdvancedSwingFusionOverlays';
import { buildMergedAdvancedRibbonSwingChartMarkers } from '@/lib/mergedAdvancedRibbonSwingPack';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  isMergedDesk4hReferenceSwingTf,
  mergedDesk4hReferencePivotWindowForTf,
  mergedDesk4hReferenceRegimeSegments,
  mergedDesk4hReferenceSwingChannelLookback,
} from '@/lib/mergedDesk4hReference';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { buildCandleAnchoredSwingChannel } from '@/lib/mergedDeskCandleTrendline';
import { buildMergedDeskChannelMoneyEdgePack } from '@/lib/mergedDeskChannelMoneyEdge';
import { buildMergedAdvancedStRibbonFillOverlays } from '@/lib/mergedAdvancedStRibbonFillOverlays';

function swingWorkCandles(candles: Candle[], timeframe: string): Candle[] {
  return sanitizeChartCandlesForSeries(mergedWorkCandles(candles, timeframe), timeframe);
}

function pickSpread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]!);
  const last = items[items.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function swingPivotWindow(timeframe: string): { L: number; R: number } {
  return mergedDesk4hReferencePivotWindowForTf(timeframe);
}

function swingChannelLookback(_timeframe?: string): number {
  return mergedDesk4hReferenceSwingChannelLookback();
}

function maxRegimeSegments(timeframe: string): number {
  if (isMergedDesk4hReferenceSwingTf(timeframe)) {
    return mergedDesk4hReferenceRegimeSegments();
  }
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1Y') return 24;
  return mergedDesk4hReferenceRegimeSegments();
}

/** 전 TF 4h 전환 마커 상한 */
function maxTrendFlipMarkers(_timeframe?: string): number {
  return 80;
}

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const h = candles[i]!.high;
  for (let j = i - L; j < i; j++) {
    if (candles[j]!.high >= h) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length) return false;
    if (candles[j]!.high > h) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i]!.low;
  for (let j = i - L; j < i; j++) {
    if (candles[j]!.low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length) return false;
    if (candles[j]!.low < lo) return false;
  }
  return true;
}

function priceAtIndex(candles: Candle[], idx: number, slopePerBar: number, anchorIdx: number, anchorPrice: number): number {
  return anchorPrice + slopePerBar * (idx - anchorIdx);
}

/** ST 융합 추세 구간 — 차트 전체 높이 롱(초록)/숏(빨강) 배경 */
export function buildMergedSwingRegimeBands(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null | undefined;
  reuseCore?: InstitutionalSuperTrendCore | null;
}): OverlayItem[] {
  const cap = maxRegimeSegments(params.timeframe);
  if (cap <= 0) return [];

  const safe = swingWorkCandles(params.candles, params.timeframe);
  if (safe.length < 6) return [];

  const segs = computeInstitutionalSuperTrendEnvelopeSegmentsFused(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    params.fusion ?? null,
    params.reuseCore ?? null
  );
  if (!segs.length) return [];

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of safe) {
    pMin = Math.min(pMin, c.low);
    pMax = Math.max(pMax, c.high);
  }
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMax <= pMin) return [];

  const paint = pickSpread(segs, cap);
  const pad = (pMax - pMin) * 0.02;
  return paint.map((seg, idx) => {
    const longSeg = seg.dir === 'long';
    const t1n = Number(seg.upper[0]?.time ?? seg.lower[0]?.time);
    const t2n = Number(
      seg.upper[seg.upper.length - 1]?.time ?? seg.lower[seg.lower.length - 1]?.time
    );
    if (!Number.isFinite(t1n) || !Number.isFinite(t2n)) return null;
    const item: OverlayItem = {
      id: `merged-swing-regime-${idx}`,
      kind: (longSeg ? 'demandZone' : 'supplyZone') as OverlayItem['kind'],
      label: longSeg ? '롱 구간' : '숏 구간',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1n,
      time2: t2n,
      price1: pMax + pad,
      price2: pMin - pad,
      confidence: 48,
      color: longSeg ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
      category: 'scenario',
      zoneFillPreserve: true,
      structureBias: (longSeg ? 'bullish' : 'bearish') as OverlayItem['structureBias'],
      overlayZoneExtraClass: [
        'merged-swing-regime',
        longSeg ? 'merged-swing-regime--long' : 'merged-swing-regime--short',
      ].join(' '),
      labelTooltip: longSeg
        ? '스윙·롱 구간 — ST 융합 추세(참고·비보장)'
        : '스윙·숏 구간 — ST 융합 추세(참고·비보장)',
    };
    return item;
  }).filter((o): o is OverlayItem => o != null);
}

/** 스윙 피벗 기반 평행 채널 — 상·중·하단 (캔들 피벗 스냅) */
export function buildMergedSwingParallelChannel(params: {
  candles: Candle[];
  timeframe: string;
}): OverlayItem[] {
  return buildCandleAnchoredSwingChannel(params.candles, params.timeframe);
}

/** ST 추세 전환 — 초록/빨강 구간 경계 캔들 마커 */
export function buildMergedSwingTrendFlipMarkers(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null | undefined;
  reuseCore?: InstitutionalSuperTrendCore | null;
}): AtlasPulseMarker[] {
  const safe = swingWorkCandles(params.candles, params.timeframe);
  if (safe.length < 8) return [];

  const core =
    params.reuseCore && params.reuseCore.trend.length === safe.length
      ? params.reuseCore
      : computeInstitutionalSuperTrendCore(
          safe,
          INSTITUTIONAL_BAND_DEFAULT_PERIOD,
          INSTITUTIONAL_BAND_DEFAULT_MULT
        );
  if (!core) return [];

  const segs = computeInstitutionalSuperTrendEnvelopeSegmentsFused(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    params.fusion ?? null,
    core
  );
  if (segs.length < 2) return [];

  const cap = maxTrendFlipMarkers(params.timeframe);
  const out: AtlasPulseMarker[] = [];
  for (let s = 1; s < segs.length; s++) {
    const prev = segs[s - 1]!;
    const cur = segs[s]!;
    if (prev.dir === cur.dir) continue;
    const t = Number(cur.upper[0]?.time);
    if (!Number.isFinite(t)) continue;
    const long = cur.dir === 'long';
    out.push({
      time: t as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: long ? '#22c55e' : '#ef4444',
      text: long ? '▲' : '▼',
      size: 1,
      id: `merged-swing-flip-${long ? 'long' : 'short'}-${t}`,
    });
  }

  return pickSpread(out, cap);
}

export type MergedSwingChartDrawPack = {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
};

/** 스윙 차트 작도 통합 — 구간·채널·AI zone/line·밴드 전환 마커 */
export function buildMergedSwingChartDrawPack(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null | undefined;
  analysis: AnalyzeResponse | null;
}): MergedSwingChartDrawPack {
  const safe = swingWorkCandles(params.candles, params.timeframe);
  const core =
    safe.length >= 8
      ? computeInstitutionalSuperTrendCore(
          safe,
          INSTITUTIONAL_BAND_DEFAULT_PERIOD,
          INSTITUTIONAL_BAND_DEFAULT_MULT
        )
      : null;

  const regime = buildMergedSwingRegimeBands({
    candles: params.candles,
    timeframe: params.timeframe,
    fusion: params.fusion,
    reuseCore: core,
  });
  /** 채널·추세선 — 파란/빨간 평행채널 + 채널머니 캡션 + ST 계단 구름 */
  const channelMoney = buildMergedDeskChannelMoneyEdgePack(params.candles, params.timeframe, {
    analysis: params.analysis,
  });
  const channel = channelMoney.overlays.length
    ? channelMoney.overlays
    : buildMergedSwingParallelChannel({
        candles: params.candles,
        timeframe: params.timeframe,
      });
  const stRibbon = buildMergedAdvancedStRibbonFillOverlays({
    candles: params.candles,
    timeframe: params.timeframe,
    fusion: params.fusion,
    reuseCore: core,
  });
  const swingFusion = buildMergedAdvancedSwingFusionPack({
    analysis: params.analysis,
    candles: params.candles,
    timeframe: params.timeframe,
  });
  const flipMarkers = buildMergedSwingTrendFlipMarkers({
    candles: params.candles,
    timeframe: params.timeframe,
    fusion: params.fusion,
    reuseCore: core,
  });
  const ribbonMarkers: AtlasPulseMarker[] = core
    ? pickSpread(
        buildMergedAdvancedRibbonSwingChartMarkers(safe, core).map((m, i) => ({
          time: m.time,
          position: m.position === 'inBar' ? 'belowBar' : m.position,
          shape: m.shape,
          color: m.color,
          text: m.text,
          size: (m.size ?? 2) as 1 | 2 | 3,
          id: `merged-ribbon-swing-m-${i}-${Number(m.time)}`,
        })),
        48
      )
    : [];

  const tf = normalizeChartTimeframe(params.timeframe);
  const isSwingTf = isMergedDesk4hReferenceSwingTf(tf);
  const ribbonOn = isSwingTf;

  return {
    overlays: [...regime, ...stRibbon, ...channel, ...swingFusion],
    markers: [...flipMarkers, ...(ribbonOn ? ribbonMarkers : [])],
  };
}
