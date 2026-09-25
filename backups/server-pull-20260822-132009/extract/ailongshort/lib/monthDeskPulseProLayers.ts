/**
 * 통합 펄스 Pro — 돌파·안착·되돌림·무효·구조·AI S/R·고래·VRVP를
 * 차트 zone·line·아이콘으로만 출력 (카드·긴 라벨 없음).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import { pickBestSettleSnapshot } from '@/lib/monthDeskSettleChartGuide';
import { computeCandleAnalysisVpLevelCenters } from '@/lib/candleAnalysisAutoOverlays';
import { buildMonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';
import type { AtlasPulseMarker, AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { lastBarSpan, lastBarTime } from '@/lib/monthDeskLastCandleFocus';

export const PULSE_PRO_IDS = {
  invalidZone: 'pulse-pro-invalid-zone',
  whalePressure: 'pulse-pro-whale-pressure',
  vrvpPoc: 'pulse-pro-vrvp-poc',
  vrvpVa: 'pulse-pro-vrvp-va',
  aiSupport: 'pulse-pro-ai-support',
  aiResistance: 'pulse-pro-ai-resistance',
  aiMid: 'pulse-pro-ai-mid',
} as const;

export type PulseProStrategyStrip = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  stepKo: string;
  breakLevel: number | null;
  whaleBuyPct: number;
  whaleSellPct: number;
  whalePhaseKo: string;
  pocPrice: number | null;
  aiSupport: number | null;
  aiResistance: number | null;
  aiMidline: number | null;
  timelineKo: string;
};

function barSpan(candles: Candle[], lookback = 8): { t1: number; t2: number } {
  return lastBarSpan(candles, lookback);
}

function hLine(
  id: string,
  price: number,
  color: string,
  t1: number,
  t2: number,
  extra?: Partial<OverlayItem>
): OverlayItem {
  return {
    id,
    kind: 'keyLevel',
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: price,
    price2: price,
    confidence: 90,
    color,
    lineStrokeWidth: extra?.lineStrokeWidth ?? 2,
    lineDash: extra?.lineDash,
    category: 'scenario',
    labelTooltip: '',
    overlayZoneExtraClass: extra?.overlayZoneExtraClass,
  };
}

function primaryLeg(bundle: MonthDeskStrikeDeskBundle): MonthDeskStrikeLeg | null {
  if (bundle.primary === 'LONG' && bundle.long) return bundle.long;
  if (bundle.primary === 'SHORT' && bundle.short) return bundle.short;
  return bundle.long ?? bundle.short ?? null;
}

function buildInvalidationZone(
  leg: MonthDeskStrikeLeg,
  t1: number,
  t2: number
): OverlayItem {
  const isLong = leg.side === 'LONG';
  const sl = leg.stopLoss;
  const pad = Math.max(Math.abs(sl) * 0.004, Math.abs(leg.entry - sl) * 0.35);
  const top = isLong ? sl : sl + pad;
  const bot = isLong ? sl - pad : sl;
  return {
    id: PULSE_PRO_IDS.invalidZone,
    kind: isLong ? 'supplyZone' : 'demandZone',
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: Math.max(top, bot),
    price2: Math.min(top, bot),
    confidence: 92,
    color: 'rgba(239,68,68,0.2)',
    category: 'scenario',
    zoneFillPreserve: true,
    labelTooltip: '',
    overlayZoneExtraClass: 'overlay-zone--pulse-pro-invalid',
  };
}

function buildWhalePressureZone(
  candles: Candle[],
  buyPct: number,
  t1: number,
  t2: number
): OverlayItem | null {
  const close = Number(candles[candles.length - 1]?.close);
  if (!Number.isFinite(close)) return null;
  const band = Math.max(close * 0.006, 1);
  const bull = buyPct >= 55;
  return {
    id: PULSE_PRO_IDS.whalePressure,
    kind: bull ? 'demandZone' : 'supplyZone',
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: close + band * 0.55,
    price2: close - band * 0.55,
    confidence: Math.round(buyPct),
    color: bull ? 'rgba(34,197,94,0.14)' : 'rgba(248,113,113,0.16)',
    category: 'scenario',
    zoneFillPreserve: true,
    labelTooltip: '',
    overlayZoneExtraClass: 'overlay-zone--pulse-pro-whale',
  };
}

function buildVrvpLayers(
  candles: Candle[],
  t1: number,
  t2: number
): { overlays: OverlayItem[]; poc: number | null; priceLines: AtlasPulsePriceLine[] } {
  const tail = candles.slice(Math.max(0, candles.length - 72));
  const vp = computeCandleAnalysisVpLevelCenters(tail.length >= 12 ? tail : candles);
  if (!vp) return { overlays: [], poc: null, priceLines: [] };
  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const poc = vp.hvp.length ? vp.hvp[0]! : null;

  if (poc != null) {
    priceLines.push({
      price: poc,
      color: 'rgba(45,212,191,0.85)',
      title: 'POC',
      lineWidth: 1,
      lineStyle: 'dotted',
    });
    overlays.push(
      hLine(PULSE_PRO_IDS.vrvpPoc, poc, 'rgba(45,212,191,0.55)', t1, t2, {
        lineDash: '2 5',
        lineStrokeWidth: 1,
        overlayZoneExtraClass: 'overlay-line--pulse-pro-poc',
      })
    );
  }

  if (vp.hvp.length >= 2) {
    const top = vp.hvp[0]! + vp.halfBand;
    const bot = vp.hvp[Math.min(1, vp.hvp.length - 1)]! - vp.halfBand;
    overlays.push({
      id: PULSE_PRO_IDS.vrvpVa,
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: Math.max(top, bot),
      price2: Math.min(top, bot),
      confidence: 70,
      color: 'rgba(45,212,191,0.1)',
      category: 'scenario',
      zoneFillPreserve: true,
      labelTooltip: '',
      overlayZoneExtraClass: 'overlay-zone--pulse-pro-vrvp',
    });
  }

  return { overlays, poc, priceLines };
}

function buildAiSrLayers(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[],
  t1: number,
  t2: number
): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[]; support: number | null; resistance: number | null; mid: number | null } {
  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const sup = Number(analysis?.supportLevel?.price);
  const res = Number(analysis?.resistanceLevel?.price);
  const uniWatch = analysis?.aiUnifiedLongShort?.watch;
  const uniMid =
    uniWatch && Number.isFinite(uniWatch.low) && Number.isFinite(uniWatch.high)
      ? (uniWatch.low + uniWatch.high) / 2
      : NaN;
  const support = Number.isFinite(sup) && sup > 0 ? sup : null;
  const resistance = Number.isFinite(res) && res > 0 ? res : null;
  const mid =
    Number.isFinite(uniMid) && uniMid > 0
      ? uniMid
      : support != null && resistance != null
        ? (support + resistance) / 2
        : null;

  if (support != null) {
    priceLines.push({ price: support, color: 'rgba(74,222,128,0.9)', title: 'S', lineWidth: 1, lineStyle: 'dashed' });
    overlays.push(
      hLine(PULSE_PRO_IDS.aiSupport, support, 'rgba(74,222,128,0.75)', t1, t2, {
        lineDash: '6 4',
        lineStrokeWidth: 1,
      })
    );
  }
  if (resistance != null) {
    priceLines.push({ price: resistance, color: 'rgba(248,113,113,0.9)', title: 'R', lineWidth: 1, lineStyle: 'dashed' });
    overlays.push(
      hLine(PULSE_PRO_IDS.aiResistance, resistance, 'rgba(248,113,113,0.75)', t1, t2, {
        lineDash: '6 4',
        lineStrokeWidth: 1,
      })
    );
  }
  if (mid != null) {
    priceLines.push({ price: mid, color: 'rgba(148,163,184,0.85)', title: 'AI', lineWidth: 1, lineStyle: 'dotted' });
    overlays.push(
      hLine(PULSE_PRO_IDS.aiMid, mid, 'rgba(148,163,184,0.55)', t1, t2, {
        lineDash: '3 6',
        lineStrokeWidth: 1,
      })
    );
  }

  return { overlays, priceLines, support, resistance, mid };
}

function buildStructureTimelineMarkers(
  candles: Candle[],
  fusion: MonthDeskBandFusionContext | null
): AtlasPulseMarker[] {
  const lastT = lastBarTime(candles);
  if (lastT == null || !fusion?.structureByTime) return [];
  const st = fusion.structureByTime.get(lastT);
  if (!st) return [];

  if (st.phase === 'failed') {
    return [
      {
        time: lastT as UTCTimestamp,
        position: st.bias === 'bullish' ? 'belowBar' : 'aboveBar',
        shape: 'square',
        color: '#F87171',
        text: '✕',
        size: 1,
        id: `pulse-pro-struct-fail-${lastT}`,
      },
    ];
  }
  if (st.phase === 'breakout') {
    return [
      {
        time: lastT as UTCTimestamp,
        position: st.bias === 'bullish' ? 'belowBar' : 'aboveBar',
        shape: 'circle',
        color: '#FACC15',
        text: '◈',
        size: 1,
        id: `pulse-pro-struct-bos-${lastT}`,
      },
    ];
  }
  if (st.phase === 'confirmed') {
    return [
      {
        time: lastT as UTCTimestamp,
        position: st.bias === 'bullish' ? 'belowBar' : 'aboveBar',
        shape: 'circle',
        color: '#A78BFA',
        text: '⟡',
        size: 1,
        id: `pulse-pro-struct-choch-${lastT}`,
      },
    ];
  }
  return [];
}

function buildPullbackMarkers(
  candles: Candle[],
  bundle: MonthDeskStrikeDeskBundle,
  probePack: OverlayItem[],
  timeframe: string,
  analysis: AnalyzeResponse | null | undefined
): AtlasPulseMarker[] {
  const n = candles.length;
  if (n < 16) return [];
  const tail = candles.slice(Math.max(0, n - 120));
  const snap = pickBestSettleSnapshot(tail, probePack, { timeframe, analysis });
  if (!snap || snap.breakIdx < 0) return [];

  const leg = primaryLeg(bundle);
  if (!leg) return [];

  const lastIdx = tail.length - 1;
  const c = tail[lastIdx]!;
  const low = Number(c.low);
  const high = Number(c.high);
  const close = Number(c.close);
  const open = Number(c.open);
  const isLong = leg.side === 'LONG';
  const inZone =
    isLong
      ? low <= leg.zoneTop && low >= leg.zoneBot - (leg.zoneTop - leg.zoneBot) * 0.15
      : high >= leg.zoneBot && high <= leg.zoneTop + (leg.zoneTop - leg.zoneBot) * 0.15;
  if (!inZone) return [];
  const reject =
    isLong ? close >= open && close >= leg.entry * 0.998 : close <= open && close <= leg.entry * 1.002;
  if (!reject) return [];

  const t = Number(c.time) as UTCTimestamp;
  return [
    {
      time: t,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: isLong ? '#2DD4BF' : '#FB923C',
      text: '↩',
      size: 2,
      id: `pulse-pro-pullback-${t}`,
    },
  ];
}

function buildTimelineKo(
  stepKo: string,
  structOnLast: boolean,
  pullbackOnLast: boolean
): string {
  const parts = [`마지막봉 · ${stepKo}`];
  if (structOnLast) parts.push('구조');
  if (pullbackOnLast) parts.push('되돌림');
  return parts.join(' · ');
}

export function buildMonthDeskPulseProLayers(params: {
  candles: Candle[];
  timeframe: string;
  bundle: MonthDeskStrikeDeskBundle;
  probePack: OverlayItem[];
  fusion: MonthDeskBandFusionContext | null;
  analysis?: AnalyzeResponse | null;
  stepKo: string;
  breakLevel: number | null;
}): {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
  priceLines: AtlasPulsePriceLine[];
  strategy: PulseProStrategyStrip;
} {
  const { candles, timeframe, bundle, probePack, fusion, analysis, stepKo, breakLevel } = params;
  const { t1, t2 } = barSpan(candles);
  const leg = primaryLeg(bundle);
  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const markers: AtlasPulseMarker[] = [];

  if (leg) {
    overlays.push(buildInvalidationZone(leg, t1, t2));
  }

  const whale = buildMonthDeskWhaleSnapshot(analysis ?? null, candles);
  const whaleZone = buildWhalePressureZone(candles, whale.buyPressure, t1, t2);
  if (whaleZone) overlays.push(whaleZone);

  const vrvp = buildVrvpLayers(candles, t1, t2);
  overlays.push(...vrvp.overlays);
  priceLines.push(...vrvp.priceLines);

  const aiSr = buildAiSrLayers(analysis, candles, t1, t2);
  overlays.push(...aiSr.overlays);
  priceLines.push(...aiSr.priceLines);

  const structMarkers = buildStructureTimelineMarkers(candles, fusion);
  const pullbackMarkers = buildPullbackMarkers(candles, bundle, probePack, timeframe, analysis);
  markers.push(...structMarkers, ...pullbackMarkers);

  const pri = leg;
  const strategy: PulseProStrategyStrip = {
    direction: bundle.primary,
    entry: pri?.entry ?? bundle.close,
    stopLoss: pri?.stopLoss ?? bundle.close,
    tp1: pri?.tp1 ?? bundle.close,
    tp2: pri?.tp2 ?? bundle.close,
    tp3: pri?.tp3 ?? bundle.close,
    stepKo,
    breakLevel,
    whaleBuyPct: whale.buyPressure,
    whaleSellPct: whale.sellPressure,
    whalePhaseKo: whale.headlineKo,
    pocPrice: vrvp.poc,
    aiSupport: aiSr.support,
    aiResistance: aiSr.resistance,
    aiMidline: aiSr.mid,
    timelineKo: buildTimelineKo(stepKo, structMarkers.length > 0, pullbackMarkers.length > 0),
  };

  return { overlays, markers, priceLines, strategy };
}

export function isPulseProPreservedChartMarker(m: { text?: string }): boolean {
  const tx = String(m.text ?? '').trim();
  return ['⚡', '◆', '★', '✕', '▲', '▼', '↩', '◈', '⟡'].includes(tx);
}
