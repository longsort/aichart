/**
 * 통합·분석 — 핵심 지지·반등 + 하방 핵심지지·상방 핵심저항 투영 분석·차트.
 * 캔들 근처만이 아니라 하락 시 하방 지지·상승 시 상방 저항 사다리를 함께 표시.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import {
  mergedDeskAnalysisZoneTimes,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
  type MergedDeskAnalysisZoneContext,
} from '@/lib/mergedAnalysisOverlayTimes';
import {
  computeCandleTrendChannelGeom,
} from '@/lib/mergedDeskCandleTrendline';
import { buildMergedDeskChannelMoneyEdgePack } from '@/lib/mergedDeskChannelMoneyEdge';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import {
  buildMergedDeskStructureVerdictPack,
  type MergedDeskStructureVerdictPack,
} from '@/lib/mergedDeskStructureVerdict';
import { buildMergedDeskProjectedDownsidePack } from '@/lib/mergedDeskProjectedDownsideSupports';
import { buildMergedDeskProjectedUpsidePack } from '@/lib/mergedDeskProjectedUpsideResists';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';

const EMPTY_SMC_LEADING: MergedSmcLeadingContext = {
  marks: [],
  obs: [],
  bosCountInLeg: 0,
  legDirection: 'range',
  lastChoch: null,
  bounceHint: null,
  summaryKo: '',
  detailKo: '',
  active: false,
};

export type MergedDeskSupportReboundAnalysis = {
  summaryKo: string;
  detailKo: string;
  supportPrice: number | null;
  supportLabelKo: string;
  reboundTargets: Array<{ label: string; price: number; sourceKo: string }>;
  structureVerdict: MergedDeskStructureVerdictPack;
  projectedDownsideKo: string;
  projectedUpsideKo: string;
  overlays: OverlayItem[];
};

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function pickNearestSupportZone(
  keyZones: MergedKeyZone[],
  close: number,
  atr: number
): MergedKeyZone | null {
  const demand = keyZones
    .filter((z) => z.kind === 'demand')
    .filter((z) => z.price <= close + atr * 0.35)
    .sort((a, b) => {
      const da = Math.abs(close - a.price);
      const db = Math.abs(close - b.price);
      if (Math.abs(da - db) > atr * 0.05) return da - db;
      return b.score - a.score;
    });
  return demand[0] ?? null;
}

function estimateAtr(candles: Candle[], endIdx: number, period = 14): number {
  const start = Math.max(1, endIdx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[endIdx]?.close ?? 1) * 0.01;
}

export function buildMergedDeskSupportReboundAnalysis(params: {
  candles: Candle[];
  timeframe: string;
  keyZones: MergedKeyZone[];
  bounceScenarios: MergedBounceScenario[];
  smcLeading?: import('@/lib/mergedAnalysisSmcLeading').MergedSmcLeadingContext;
  judgment?: import('@/lib/mergedAnalysisTradeJudgment').MergedTradeJudgment | null;
  criticalZones?: MergedCriticalZone[];
  vrvp?: { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): MergedDeskSupportReboundAnalysis {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  if (work.length < 20) {
    const emptyVerdict = buildMergedDeskStructureVerdictPack({
      candles: params.candles,
      timeframe: params.timeframe,
      keyZones: params.keyZones,
      bounceScenarios: params.bounceScenarios,
      smcLeading: params.smcLeading ?? EMPTY_SMC_LEADING,
    });
    return {
      summaryKo: '지지·반등 분석 — 데이터 부족',
      detailKo: '',
      supportPrice: null,
      supportLabelKo: '',
      reboundTargets: [],
      structureVerdict: emptyVerdict,
      projectedDownsideKo: '',
      projectedUpsideKo: '',
      overlays: buildMergedDeskChannelMoneyEdgePack(params.candles, params.timeframe).overlays,
    };
  }

  const close = work[work.length - 1]!.close;
  const atr = estimateAtr(work, work.length - 1);
  const channelGeom = computeCandleTrendChannelGeom(params.candles, params.timeframe);
  const activeBounce =
    params.bounceScenarios.find((s) => s.active && s.direction === 'up') ??
    params.bounceScenarios.find((s) => s.direction === 'up') ??
    null;
  const supportZone = pickNearestSupportZone(params.keyZones, close, atr);

  const supportPrice =
    activeBounce?.anchorPrice ??
    supportZone?.price ??
    channelGeom?.lowerEnd.price ??
    null;
  const supportLabelKo =
    activeBounce?.labelKo ??
    supportZone?.labelKo ??
    '채널 하단 지지';

  const reboundFromScenario =
    activeBounce?.targets.map((t) => ({
      label: t.label as string,
      price: t.price,
      sourceKo: t.sourceKo,
    })) ?? [];

  const reboundTargets: Array<{ label: string; price: number; sourceKo: string }> = [...reboundFromScenario];
  if (channelGeom && reboundTargets.length < 3) {
    const mid = channelGeom.midEnd.price;
    const upper = channelGeom.upperEnd.price;
    if (mid > close && !reboundTargets.some((t) => Math.abs(t.price - mid) < atr * 0.2)) {
      reboundTargets.push({ label: 'T채널중', price: mid, sourceKo: '채널 중심선' });
    }
    if (upper > close && !reboundTargets.some((t) => Math.abs(t.price - upper) < atr * 0.2)) {
      reboundTargets.push({ label: 'T채널상', price: upper, sourceKo: '채널 상단 추세선' });
    }
  }

  reboundTargets.sort((a, b) => a.price - b.price);

  const nextTarget = reboundTargets.find((t) => t.price > close + atr * 0.05) ?? reboundTargets[0];
  const supportDistPct =
    supportPrice != null && close > 0 ? ((close - supportPrice) / close) * 100 : null;

  const analysisZoneCtx: MergedDeskAnalysisZoneContext = {
    anchorTime: activeBounce?.anchorTime ?? supportZone?.time1 ?? null,
    legHigh: activeBounce?.legHigh ?? channelGeom?.upper[1].price ?? null,
    legLow: activeBounce?.legLow ?? channelGeom?.lower[1].price ?? null,
    direction: activeBounce?.direction ?? null,
    pivotTimes: channelGeom
      ? [channelGeom.upper[1].time, channelGeom.lower[1].time]
      : undefined,
  };
  const { t1, t2 } = mergedDeskAnalysisZoneTimes(work, tf, analysisZoneCtx);

  const structureVerdict = buildMergedDeskStructureVerdictPack({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: params.keyZones,
    bounceScenarios: params.bounceScenarios,
    smcLeading: params.smcLeading ?? EMPTY_SMC_LEADING,
    judgment: params.judgment ?? null,
    supportPrice,
  });

  const projectedDownside = buildMergedDeskProjectedDownsidePack({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: params.keyZones,
    criticalZones: params.criticalZones,
    bounceScenarios: params.bounceScenarios,
    vrvp: params.vrvp,
    analysis: params.analysis,
    whaleMemoryZones: params.whaleMemoryZones,
  });
  const projectedUpside = buildMergedDeskProjectedUpsidePack({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: params.keyZones,
    criticalZones: params.criticalZones,
    bounceScenarios: params.bounceScenarios,
    vrvp: params.vrvp,
    analysis: params.analysis,
    whaleMemoryZones: params.whaleMemoryZones,
  });

  const summaryKo = [
    supportPrice != null && nextTarget
      ? `지지 ${fmtPx(supportPrice)} (${supportLabelKo}) · 반등 ${nextTarget.label} ${fmtPx(nextTarget.price)}`
      : null,
    projectedDownside.summaryKo || null,
    projectedUpside.summaryKo || null,
  ]
    .filter(Boolean)
    .join(' | ') || '핵심 지지·저항 — 구간 탐색 중';

  const detailKo = [
    supportPrice != null
      ? `지지가 ${fmtPx(supportPrice)}${supportDistPct != null ? ` (현재가 대비 ${supportDistPct.toFixed(1)}%)` : ''}`
      : null,
    reboundTargets.length
      ? `반등 목표 ${reboundTargets.map((t) => `${t.label} ${fmtPx(t.price)}`).join(' → ')}`
      : null,
    projectedDownside.summaryKo || null,
    projectedUpside.summaryKo || null,
    activeBounce?.statusKo,
  ]
    .filter(Boolean)
    .join(' · ');

  const overlays: OverlayItem[] = [
    ...buildMergedDeskChannelMoneyEdgePack(params.candles, params.timeframe).overlays,
    ...structureVerdict.overlays,
    ...projectedDownside.overlays,
    ...projectedUpside.overlays,
  ];

  if (supportPrice != null && supportZone) {
    overlays.push({
      id: `merged-desk-support-rebound-zone-${Math.round(supportPrice)}`,
      kind: 'demandZone',
      label: `지지 ${fmtPx(supportPrice)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: supportZone.top,
      price2: supportZone.bot,
      confidence: 88,
      color: 'rgba(45,212,191,0.14)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-desk-support-rebound',
        'merged-ares-key-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
      ].join(' '),
      labelTooltip: `${supportLabelKo} · ${detailKo} (조건부 참고)`,
    });
  }

  for (const t of reboundTargets.slice(0, 4)) {
    overlays.push({
      id: `merged-desk-support-rebound-${t.label}-${Math.round(t.price)}`,
      kind: 'keyLevel',
      label: `반등 ${t.label} ${fmtPx(t.price)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: t.price,
      price2: t.price,
      confidence: 86,
      color: t.label.includes('채널') ? '#7dd3fc' : '#2dd4bf',
      category: 'structure',
      lineDash: t.label === 'Tmax' || t.label === 'T채널상' ? '4 4' : '10 6',
      lineStrokeWidth: t.label === 'T1' || t.label === 'T채널중' ? 2.2 : 1.8,
      overlayZoneExtraClass: 'merged-desk-support-rebound merged-ares-bounce-line merged-ares-bounce-line--up',
      labelTooltip: `${t.label} ${fmtPx(t.price)} · ${t.sourceKo}`,
    });
  }

  if (supportPrice != null) {
    overlays.push({
      id: `merged-desk-support-rebound-pin`,
      kind: 'label',
      label: `▼ 지지 ${fmtPx(supportPrice)}`,
      x1: 0.5,
      y1: 0.5,
      time1: (supportZone?.time2 ?? Number(work[work.length - 1]!.time)) as UTCTimestamp,
      price1: supportPrice,
      confidence: 90,
      color: '#2dd4bf',
      labelBackgroundColor: 'rgba(6,78,59,0.92)',
      labelTextColor: '#ecfdf5',
      category: 'labels',
      overlayZoneExtraClass: 'merged-desk-support-rebound-pin',
      labelTooltip: summaryKo,
    });
  }

  return {
    summaryKo,
    detailKo,
    supportPrice,
    supportLabelKo,
    reboundTargets,
    structureVerdict,
    projectedDownsideKo: projectedDownside.summaryKo,
    projectedUpsideKo: projectedUpside.summaryKo,
    overlays,
  };
}
