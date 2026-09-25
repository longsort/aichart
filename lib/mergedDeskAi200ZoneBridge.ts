/**
 * AI200 확정 zone — MTF 스캔·차트 TF 투영·E/SL/TP1~3 면 작도.
 * 라벨: AI200. 확정(CONFIRM)만 zone. LTF 무관 동일 가격.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { formatZoneFacePrice } from '@/lib/mergedDeskDumpLifeCycle';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  AI200_ZONE_COLORS,
  ai200ZoneHalf,
  type Ai200ZoneRole,
} from '@/lib/mergedDeskAi200ZoneColors';
import {
  buildMergedDeskScalp200Plan,
  type Scalp200PlanPack,
} from '@/lib/mergedDeskScalp200Plan';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedDeskNewsHintLite } from '@/lib/mergedDeskEntryHardGates';
import {
  mergeAi200ZonesForDisplay,
  type Ai200ZoneSpec,
} from '@/lib/mergedDeskAi200ZoneRegistry';
import { loadSettings } from '@/lib/settings';

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

export function scalp200PlanToAi200Spec(
  plan: Scalp200PlanPack,
  sourceTf: string
): Ai200ZoneSpec | null {
  if (plan.zoneLife?.lifeState !== 'CONFIRM_ENTRY') return null;
  if (plan.direction === 'NEUTRAL' || !(plan.entry > 0)) return null;
  const half = Math.max(
    Math.abs(plan.entry - plan.stopLoss) * 0.5,
    plan.entry * 0.0004,
    6
  );
  const zl = plan.zoneLife;
  return {
    sourceTf: normalizeChartTimeframe(sourceTf),
    direction: plan.direction,
    entry: plan.entry,
    stopLoss: plan.stopLoss,
    tp1: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    top: plan.entry + half,
    bot: plan.entry - half,
    mid: plan.entry,
    formedTime: zl.formedTime,
    evidenceKo: zl.evidenceKo.slice(0, 4),
    detailKo: [
      `${plan.direction === 'LONG' ? '롱' : '숏'} E ${fmt(plan.entry)} SL ${fmt(plan.stopLoss)}`,
      `TP ${fmt(plan.tp1)} / ${fmt(plan.tp2)} / ${fmt(plan.tp3)}`,
      zl.evidenceKo.join(' · '),
      plan.disclaimerKo,
    ].join('\n'),
  };
}

function buildAi200RoleZone(params: {
  spec: Ai200ZoneSpec;
  role: Ai200ZoneRole;
  labelKo: string;
  price: number;
  half: number;
  t1: number;
  t2: number;
  priceOnly: boolean;
  slot: string;
}): OverlayItem {
  const vis = AI200_ZONE_COLORS[params.role];
  const face = formatZoneFacePrice({
    nameKo: params.labelKo,
    mid: params.price,
    priceOnly: params.priceOnly,
    signalKo: params.priceOnly ? undefined : params.spec.evidenceKo.slice(0, 2).join('+') || undefined,
  });

  return {
    id: `merged-desk-ai200-${params.role}-${params.slot}`,
    kind: 'zone',
    label: face.face,
    zoneFaceBase: face.face,
    zoneFaceSignal: params.priceOnly ? '' : face.signal,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: params.t1,
    time2: params.t2,
    price1: params.price + params.half,
    price2: params.price - params.half,
    confidence: params.role === 'entry' ? 90 : 78,
    color: vis.fill,
    zoneFillPreserve: true,
    structureBias:
      params.role === 'sl'
        ? 'bearish'
        : params.spec.direction === 'LONG'
          ? 'bullish'
          : 'bearish',
    overlayZoneExtraClass: [
      'merged-desk-scalp200-zone',
      'merged-desk-scalp200-ai',
      vis.lifeClass,
      params.role === 'entry' ? 'merged-desk-scalp200-entry-allowed' : '',
      'merged-desk-pill-zone',
      'merged-desk-zone-label-on',
    ]
      .filter(Boolean)
      .join(' '),
    labelBackgroundColor: vis.labelBg,
    labelTextColor: vis.labelFg,
    labelTooltip: `${params.labelKo} · ${params.spec.sourceTf}\n${face.tip}\n${params.spec.detailKo}`,
    noProject: true,
  };
}

/** 확정 AI200 — E · SL · TP1~3 zone 면 (기존 앱 색과 분리) */
export function buildAi200ConfirmedZoneOverlays(
  specs: Ai200ZoneSpec[],
  chartCandles: Candle[]
): OverlayItem[] {
  if (!specs.length || chartCandles.length < 8) return [];

  const t2 = mergedDeskRbFutureTime2(chartCandles, MERGED_DESK_RIGHT_FUTURE_BARS);
  const priceOnly = loadSettings().chartMergedDeskZonePriceOnlyLabels === true;
  const out: OverlayItem[] = [];

  for (const spec of specs) {
    const t1 = Number(snapMergedOverlayTimeToCandles(spec.formedTime, chartCandles));
    const slot = `${spec.sourceTf}-${spec.direction}-${Math.round(spec.entry)}`;
    const entryHalf = Math.max((spec.top - spec.bot) / 2, ai200ZoneHalf(spec.entry, spec.stopLoss));
    const slHalf = ai200ZoneHalf(spec.stopLoss, spec.entry, 0.00022);
    const tpHalf = ai200ZoneHalf(spec.entry, spec.stopLoss, 0.00028);

    out.push(
      buildAi200RoleZone({
        spec,
        role: 'entry',
        labelKo: priceOnly ? `AI200 ${fmt(spec.entry)}` : 'AI200',
        price: spec.entry,
        half: entryHalf,
        t1,
        t2,
        priceOnly,
        slot,
      })
    );

    if (spec.stopLoss > 0) {
      out.push(
        buildAi200RoleZone({
          spec,
          role: 'sl',
          labelKo: priceOnly ? `AI200 SL ${fmt(spec.stopLoss)}` : 'AI200 SL',
          price: spec.stopLoss,
          half: slHalf,
          t1,
          t2,
          priceOnly,
          slot,
        })
      );
    }

    const tps: Array<{ role: Ai200ZoneRole; px: number; label: string }> = [
      { role: 'tp1', px: spec.tp1 ?? 0, label: priceOnly ? `AI200 TP1 ${fmt(spec.tp1)}` : 'AI200 TP1' },
      { role: 'tp2', px: spec.tp2 ?? 0, label: priceOnly ? `AI200 TP2 ${fmt(spec.tp2)}` : 'AI200 TP2' },
      { role: 'tp3', px: spec.tp3 ?? 0, label: priceOnly ? `AI200 TP3 ${fmt(spec.tp3)}` : 'AI200 TP3' },
    ];
    for (const tp of tps) {
      if (!(tp.px > 0)) continue;
      out.push(
        buildAi200RoleZone({
          spec,
          role: tp.role,
          labelKo: tp.label,
          price: tp.px,
          half: tpHalf,
          t1,
          t2,
          priceOnly,
          slot,
        })
      );
    }
  }

  return out;
}

export type Ai200ZonePack = {
  zones: Ai200ZoneSpec[];
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  chartPlan: Scalp200PlanPack | null;
};

export function buildMergedDeskAi200ZonePack(params: {
  symbol: string;
  chartCandles: Candle[];
  chartTf: string;
  candlesByTf: Record<string, Candle[]>;
  registryZones: Ai200ZoneSpec[];
  activeTrade: MergedDeskActiveTradePlan;
  practiceAi?: PracticeAiPlanPack | null;
  master?: MasterFuturesDecision | null;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  newsHint?: MergedDeskNewsHintLite | null;
  mtfAligned?: boolean | null;
  mtfAlignmentScore?: number | null;
  spotPx?: number | null;
  dumpZones?: import('@/lib/mergedDeskMtfDumpZoneBridge').MtfDumpZoneSpec[] | null;
  scanTfs: string[];
}): Ai200ZonePack {
  const chartTf = normalizeChartTimeframe(params.chartTf);
  const scanned: Ai200ZoneSpec[] = [];
  let chartPlan: Scalp200PlanPack | null = null;

  const base = {
    symbol: params.symbol,
    activeTrade: params.activeTrade,
    practiceAi: params.practiceAi,
    master: params.master,
    hotZone: params.hotZone,
    newsHint: params.newsHint,
    mtfAligned: params.mtfAligned,
    mtfAlignmentScore: params.mtfAlignmentScore,
    spotPx: params.spotPx,
  };

  for (const tf of params.scanTfs) {
    const candles =
      tf === chartTf
        ? params.chartCandles
        : params.candlesByTf[tf] ?? params.candlesByTf[normalizeChartTimeframe(tf)];
    if (!candles || candles.length < 24) continue;

    const plan = buildMergedDeskScalp200Plan({
      ...base,
      candles,
      timeframe: tf,
      dumpZones: params.dumpZones,
    });
    if (tf === chartTf) chartPlan = plan;
    const spec = plan ? scalp200PlanToAi200Spec(plan, tf) : null;
    if (spec) scanned.push(spec);
  }

  const zones = mergeAi200ZonesForDisplay(params.registryZones, scanned);
  const overlays = buildAi200ConfirmedZoneOverlays(zones, params.chartCandles);
  const priceLines = chartPlan?.priceLines ?? [];

  return { zones, overlays, priceLines, chartPlan };
}
