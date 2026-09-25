/**
 * 통합·분석 — 매매용 롱/숏 zone · E/SL/TP · VRVP (차트 작도 + 우측 프로파일).
 * 조건부 참고용 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe, visibleLimit } from '@/lib/constants';
import { MERGED_VRVP_KO } from '@/lib/mergedAnalysisVrvpLabels';
import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import { buildMonthDeskStrikeDeskOverlays, MONTH_DESK_STRIKE_IDS } from '@/lib/monthDeskStrikeDesk';
import { mergedDeskLastCandleZoneTimes, mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import {
  buildMergedAresNumberedLevels,
  type MergedAresLevel,
} from '@/lib/mergedAnalysisAresVisual';
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';
import {
  buildMergedKeyZoneMarkers,
  buildMergedKeyZoneOverlays,
  detectMergedAnalysisKeyZones,
  type MergedKeyZone,
} from '@/lib/mergedAnalysisKeyZones';
import {
  buildMergedDirectionConfirmMarkers,
  detectMergedDirectionConfirms,
  type MergedDirectionConfirm,
} from '@/lib/mergedAnalysisDirectionConfirm';
import {
  buildMergedConfirmZoneOverlays,
} from '@/lib/mergedAnalysisVisualLayers';
import {
  buildMergedCriticalZoneOverlays,
  detectMergedCriticalZones,
  type MergedCriticalZone,
} from '@/lib/mergedAnalysisCriticalZones';
import {
  detectMergedBounceScenarios,
  type MergedBounceScenario,
} from '@/lib/mergedAnalysisBounceTargets';
import {
  detectMergedSmcLeadingContext,
  type MergedSmcLeadingContext,
} from '@/lib/mergedAnalysisSmcLeading';
import { filterMergedDeskChartOverlays } from '@/lib/mergedAnalysisOverlayIds';
import { buildMergedFusionStructureByTime } from '@/lib/mergedAnalysisDeskHud';
import { buildMergedDeskStructureScenarioOverlays } from '@/lib/mergedAnalysisStructureScenario';
import {
  pickMergedDeskCoreChartZones,
  pickMergedDeskCoreConfirmConfirms,
} from '@/lib/mergedAnalysisCoreChartZones';
import { buildMergedDeskSupportReboundAnalysis } from '@/lib/mergedDeskSupportReboundAnalysis';
import {
  MERGED_ARES_ZONE_CAPTION_CLASS,
  buildMergedZoneIndexById,
} from '@/lib/mergedAnalysisOverlayTimes';

export type {
  MergedAresLevel,
  MergedKeyZone,
  MergedDirectionConfirm,
  MergedCriticalZone,
  MergedBounceScenario,
  MergedSmcLeadingContext,
};

export type MergedTradeSignal = {
  primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  primaryLeg: MonthDeskStrikeLeg | null;
  longLeg: MonthDeskStrikeLeg | null;
  shortLeg: MonthDeskStrikeLeg | null;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationKo: string;
};

export type MergedVrvpBar = {
  price: number;
  ratio: number;
  isPoc: boolean;
};

export type MergedVrvpProfile = {
  bars: MergedVrvpBar[];
  poc: number | null;
  vaHigh: number | null;
  vaLow: number | null;
  /** POC 구간 거래량 / 전체 (%) */
  pocVolumePct: number | null;
  /** Value Area 70% 커버리지 (%) */
  vaCoveragePct: number | null;
  priceMin: number;
  priceMax: number;
  /** 차트 TF — visibleLimit와 동일 윈도우 */
  timeframe: string;
  candleCount: number;
};

/** 차트에 보이는 봉 수(분·시·일·주·월)와 동일 slice */
/** 통합·분석 ST 구름 — 융합 편향(Strike primary + analyze) + SMC structureByTime */
export function buildMergedAnalysisBandFusionContext(params: {
  timeframe: string;
  bundle: MonthDeskStrikeDeskBundle;
  analysis?: AnalyzeResponse | null;
  candles?: Candle[];
  smcLeading?: MergedSmcLeadingContext | null;
}): MonthDeskBandFusionContext {
  const av = params.analysis?.verdict;
  const analyzeVerdict =
    av === 'LONG' || av === 'SHORT' ? av : params.bundle.primary !== 'NEUTRAL' ? params.bundle.primary : null;
  const structureByTime = buildMergedFusionStructureByTime(
    params.candles,
    params.smcLeading,
    params.analysis
  );
  return {
    analyzeVerdict,
    closingScenarioBias: null,
    lastClosingVerdict: null,
    timeframe: normalizeChartTimeframe(params.timeframe),
    structureByTime: structureByTime.size > 0 ? structureByTime : null,
    rocketByBarTime: null,
    cpBiasScores: null,
    linRegBiasScores: null,
    hotZoneBiasScores: null,
    obFvgBiasScores: null,
  };
}

/** 통합분석 — 4h 작업창 캔들만 (visibleLimit 재슬라이스 금지) */
export function mergedVrvpSourceCandles(candles: Candle[], timeframe: string): Candle[] {
  if (isMergedDeskChartTimeframe(timeframe)) {
    return mergedWorkCandles(candles, timeframe);
  }
  const lim = visibleLimit(timeframe);
  return candles.slice(Math.max(0, candles.length - lim));
}

function mergedVrvpBinCount(timeframe: string): number {
  if (isMergedDeskChartTimeframe(timeframe)) return 56; // 4h
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1M' || tf === '1w') return 64;
  if (tf === '1d' || tf === '4h') return 56;
  if (tf === '1h' || tf === '15m') return 48;
  return 40;
}

export function extractMergedTradeSignal(bundle: MonthDeskStrikeDeskBundle): MergedTradeSignal {
  const pri =
    bundle.primary === 'LONG'
      ? bundle.long
      : bundle.primary === 'SHORT'
        ? bundle.short
        : bundle.long ?? bundle.short;
  return {
    primary: bundle.primary,
    primaryLeg: pri,
    longLeg: bundle.long,
    shortLeg: bundle.short,
    entry: pri?.entry ?? bundle.close,
    stopLoss: pri?.stopLoss ?? bundle.close,
    tp1: pri?.tp1 ?? bundle.close,
    tp2: pri?.tp2 ?? bundle.close,
    tp3: pri?.tp3 ?? bundle.close,
    invalidationKo: pri
      ? `${pri.side === 'LONG' ? '롱' : '숏'} SL ${pri.stopLoss.toFixed(2)} 이탈 시 무효`
      : '관망 — 진입 조건 미충족',
  };
}

/** 통합·분석 차트 — atlas·잡음 zone 제거, Strike·AI선·밴드만 */
export function filterUnifiedOverlaysForMergedTrade(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    if (id.startsWith('pulse-pro-ai-') || id.startsWith('atlas-pulse-settle')) return kind === 'keyLevel';
    if (id.startsWith('pulse-pro-ai-')) return true;
    if (kind === 'keyLevel' && (id.startsWith('key-mustHold-') || id.startsWith('key-invalidation-'))) {
      return true;
    }
    if (id.startsWith('atlas-pulse') || id.startsWith('pulse-pro-invalid') || id.startsWith('pulse-pro-whale')) {
      return false;
    }
    if (id.startsWith('pulse-pro-vrvp') || id.startsWith('merged-ribbon') || id.startsWith('merged-advanced')) {
      return false;
    }
    if (kind === 'demandZone' || kind === 'supplyZone' || kind === 'zone') return false;
    if (id.startsWith('month-desk-strike-')) return false;
    return kind === 'keyLevel' || kind === 'label';
  });
}

/** Strike overlay — primary E/SL/TP + 롱·숏 zone (양방향 참고), 빔·핀 제거 */
export function buildMergedStrikeTradeOverlays(
  bundle: MonthDeskStrikeDeskBundle,
  candles: Candle[]
): OverlayItem[] {
  const raw = buildMonthDeskStrikeDeskOverlays(bundle, candles);
  const pri = bundle.primary;
  const ids = MONTH_DESK_STRIKE_IDS;

  const keep = raw.filter((o) => {
    const id = String(o.id || '');
    if (id.includes('beam') || id.includes('pin')) return false;
    const isLong = id.includes('long');
    const isShort = id.includes('short');
    const isLevel = id.includes('entry') || id.includes('-sl') || id.includes('-tp');
    if (id.includes('zone')) {
      if (pri === 'LONG' && isShort) return false;
      if (pri === 'SHORT' && isLong) return false;
      return true;
    }
    if (isLevel) {
      if (pri === 'LONG' && isLong) return true;
      if (pri === 'SHORT' && isShort) return true;
      if (pri === 'NEUTRAL') return true;
      return false;
    }
    if (pri === 'LONG' && isLong) return true;
    if (pri === 'SHORT' && isShort) return true;
    if (pri === 'NEUTRAL') return true;
    return false;
  });

  const zoneTimes = mergedDeskLastCandleZoneTimes(
    candles,
    normalizeChartTimeframe(bundle.timeframe ?? '4h')
  );
  if (!zoneTimes) return keep;
  const { t1, t2 } = zoneTimes;
  const lastT = Number(candles[candles.length - 1]?.time) as UTCTimestamp;
  const out: OverlayItem[] = keep.map((o) => {
    const id = String(o.id || '');
    const isZone = id.includes('zone');
    return {
      ...o,
      time1: isZone ? t1 : o.time1,
      time2: isZone ? t2 : o.time2,
      label:
        id === ids.longZone
          ? '▲ LONG · 수요존'
          : id === ids.shortZone
            ? '▼ SHORT · 공급존'
            : o.label,
      overlayZoneExtraClass: [
        o.overlayZoneExtraClass,
        'merged-ares-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        id === ids.longZone ? 'merged-trade-long-zone' : '',
        id === ids.shortZone ? 'merged-trade-short-zone' : '',
        pri === 'LONG' && id === ids.longZone ? 'merged-trade-zone-active' : '',
        pri === 'SHORT' && id === ids.shortZone ? 'merged-trade-zone-active' : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  });

  if (bundle.long && Number.isFinite(lastT)) {
    out.push({
      id: 'merged-trade-long-signal-label',
      kind: 'label',
      label: pri === 'LONG' ? '▲ LONG' : 'LONG',
      x1: 1,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: lastT,
      time2: lastT,
      price1: bundle.long.entry,
      confidence: bundle.long.score,
      color: pri === 'LONG' ? '#22c55e' : '#64748b',
      category: 'scenario',
      labelTooltip: bundle.long.headlineKo,
      labelBackgroundColor: pri === 'LONG' ? 'rgba(22,101,52,0.92)' : 'rgba(30,41,59,0.75)',
      labelTextColor: '#ecfdf5',
      overlayZoneExtraClass: 'merged-trade-signal-label',
    });
  }
  if (bundle.short && Number.isFinite(lastT)) {
    out.push({
      id: 'merged-trade-short-signal-label',
      kind: 'label',
      label: pri === 'SHORT' ? '▼ SHORT' : 'SHORT',
      x1: 1,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: lastT,
      time2: lastT,
      price1: bundle.short.entry,
      confidence: bundle.short.score,
      color: pri === 'SHORT' ? '#ef4444' : '#64748b',
      category: 'scenario',
      labelTooltip: bundle.short.headlineKo,
      labelBackgroundColor: pri === 'SHORT' ? 'rgba(127,29,29,0.92)' : 'rgba(30,41,59,0.75)',
      labelTextColor: '#fff1f2',
      overlayZoneExtraClass: 'merged-trade-signal-label',
    });
  }

  return out;
}

/** VRVP — visibleLimit(TF) 캔들 구간 거래량 프로파일 + 70% Value Area */
function computeValueAreaFromBins(
  bins: number[],
  pMin: number,
  step: number,
  targetPct = 0.7
): { poc: number; pocIdx: number; vaLow: number; vaHigh: number; vaCoveragePct: number; pocVolumePct: number } {
  const total = bins.reduce((a, b) => a + b, 0) || 1;
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i]! > bins[pocIdx]!) pocIdx = i;
  }
  const poc = pMin + (pocIdx + 0.5) * step;
  let lo = pocIdx;
  let hi = pocIdx;
  let covered = bins[pocIdx]!;
  while (covered / total < targetPct && (lo > 0 || hi < bins.length - 1)) {
    const below = lo > 0 ? bins[lo - 1]! : -1;
    const above = hi < bins.length - 1 ? bins[hi + 1]! : -1;
    if (below >= above && lo > 0) {
      lo--;
      covered += bins[lo]!;
    } else if (hi < bins.length - 1) {
      hi++;
      covered += bins[hi]!;
    } else if (lo > 0) {
      lo--;
      covered += bins[lo]!;
    } else break;
  }
  return {
    poc,
    pocIdx,
    vaLow: pMin + lo * step,
    vaHigh: pMin + (hi + 1) * step,
    vaCoveragePct: (covered / total) * 100,
    pocVolumePct: (bins[pocIdx]! / total) * 100,
  };
}

export function buildMergedVrvpVaOverlay(
  profile: MergedVrvpProfile,
  candles: Candle[]
): OverlayItem | null {
  if (profile.vaHigh == null || profile.vaLow == null || !candles.length) return null;
  const n = candles.length;
  const zoneTimes = mergedDeskLastCandleZoneTimes(
    candles,
    normalizeChartTimeframe(profile.timeframe)
  );
  if (!zoneTimes) return null;
  const { t1, t2 } = zoneTimes;
  const t1n = Number(t1);
  const t2n = Number(t2);
  if (!Number.isFinite(t1n) || !Number.isFinite(t2n)) return null;
  const top = Math.max(profile.vaHigh, profile.vaLow);
  const bot = Math.min(profile.vaHigh, profile.vaLow);
  return {
    id: 'merged-ares-va-band',
    kind: 'demandZone',
    label: `${MERGED_VRVP_KO.vaBand} · ${profile.timeframe}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1n as UTCTimestamp,
    time2: t2n as UTCTimestamp,
    price1: top,
    price2: bot,
    confidence: profile.vaCoveragePct ?? 70,
    color: '#FDE047',
    category: 'scenario',
    overlayZoneExtraClass: [
      'merged-ares-va-band',
      'merged-ares-zone',
      MERGED_ARES_ZONE_CAPTION_CLASS,
    ].join(' '),
    labelTooltip: `${MERGED_VRVP_KO.poc} ${profile.poc?.toFixed(0) ?? '—'} · ${MERGED_VRVP_KO.vaRange} ${bot.toFixed(0)}~${top.toFixed(0)} · ${profile.candleCount}봉`,
    labelBackgroundColor: 'rgba(120,53,15,0.55)',
    labelTextColor: '#fef9c3',
  };
}

/** VRVP — visibleLimit(TF) 캔들 구간 거래량 프로파일 */
export function computeMergedVrvpProfile(candles: Candle[], timeframe: string): MergedVrvpProfile | null {
  const source = mergedVrvpSourceCandles(candles, timeframe);
  if (source.length < 8) return null;

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of source) {
    pMin = Math.min(pMin, c.low);
    pMax = Math.max(pMax, c.high);
  }
  if (!(pMax > pMin)) return null;

  const numBins = mergedVrvpBinCount(timeframe);
  const step = (pMax - pMin) / numBins;
  const bins = new Array<number>(numBins).fill(0);
  for (const c of source) {
    const v = c.volume > 0 ? c.volume : 1;
    let i0 = Math.floor((c.low - pMin) / step);
    let i1 = Math.floor((c.high - pMin) / step);
    i0 = Math.max(0, Math.min(numBins - 1, i0));
    i1 = Math.max(0, Math.min(numBins - 1, i1));
    if (i0 > i1) [i0, i1] = [i1, i0];
    const add = v / (i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) bins[i] += add;
  }
  const maxV = Math.max(...bins, 1e-9);
  const va = computeValueAreaFromBins(bins, pMin, step, 0.7);
  const poc = va.poc;
  const bars: MergedVrvpBar[] = bins.map((v, i) => {
    const price = pMin + (i + 0.5) * step;
    return {
      price,
      ratio: v / maxV,
      isPoc: i === va.pocIdx,
    };
  });

  return {
    bars,
    poc,
    vaHigh: va.vaHigh,
    vaLow: va.vaLow,
    pocVolumePct: va.pocVolumePct,
    vaCoveragePct: va.vaCoveragePct,
    priceMin: pMin,
    priceMax: pMax,
    timeframe: normalizeChartTimeframe(timeframe),
    candleCount: source.length,
  };
}

export function buildMergedTradeOverlayPack(params: {
  bundle: MonthDeskStrikeDeskBundle;
  candles: Candle[];
  timeframe: string;
  fusion?: MonthDeskBandFusionContext | null;
  unifiedOverlays: OverlayItem[];
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): {
  overlays: OverlayItem[];
  swingChartMarkers: [];
  signal: MergedTradeSignal;
  vrvp: MergedVrvpProfile | null;
  aresLevels: MergedAresLevel[];
  keyZones: MergedKeyZone[];
  keyZoneMarkers: ReturnType<typeof buildMergedKeyZoneMarkers>;
  directionConfirms: MergedDirectionConfirm[];
  directionConfirmMarkers: ReturnType<typeof buildMergedDirectionConfirmMarkers>;
  criticalZones: MergedCriticalZone[];
  bounceScenarios: MergedBounceScenario[];
  smcLeading: MergedSmcLeadingContext;
  supportReboundKo: string;
  supportReboundDetailKo: string;
  projectedDownsideKo: string;
  projectedUpsideKo: string;
} {
  const leg =
    params.bundle.primary === 'LONG'
      ? params.bundle.long
      : params.bundle.primary === 'SHORT'
        ? params.bundle.short
        : params.bundle.long ?? params.bundle.short;
  const aresLevels = leg ? buildMergedAresNumberedLevels(leg, params.candles) : [];
  const keyZonesAll = detectMergedAnalysisKeyZones(params.candles, params.timeframe);
  const vrvp = computeMergedVrvpProfile(params.candles, params.timeframe);
  const criticalZonesAll = detectMergedCriticalZones({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
    vrvp,
    bundle: params.bundle,
    keyZones: keyZonesAll,
    whaleMemoryZones: params.whaleMemoryZones,
  });
  const { keyZones, criticalZones } = pickMergedDeskCoreChartZones(
    keyZonesAll,
    criticalZonesAll,
    params.candles
  );
  const zoneIndexById = buildMergedZoneIndexById([
    ...keyZones.map((z) => ({ id: z.id, price: z.price })),
    ...criticalZones.map((z) => ({ id: z.id, price: z.price })),
  ]);
  const keyZoneOverlays = buildMergedKeyZoneOverlays(
    params.candles,
    params.timeframe,
    keyZones,
    zoneIndexById
  );
  const keyZoneMarkers = buildMergedKeyZoneMarkers(params.candles, params.timeframe, keyZones);
  const directionConfirmsAll = detectMergedDirectionConfirms({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: keyZonesAll,
    bundle: params.bundle,
    analysis: params.analysis,
  });
  const chartConfirms = pickMergedDeskCoreConfirmConfirms(directionConfirmsAll);
  const directionConfirmMarkers = buildMergedDirectionConfirmMarkers(chartConfirms);
  const criticalZoneOverlays = buildMergedCriticalZoneOverlays(
    params.candles,
    criticalZones,
    params.timeframe,
    zoneIndexById
  );
  const smcLeading = detectMergedSmcLeadingContext({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
  });
  const bounceScenarios = detectMergedBounceScenarios({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: keyZonesAll,
    criticalZones: criticalZonesAll,
    vrvp,
    analysis: params.analysis,
    bundle: params.bundle,
    smcLeading,
  });
  const confirmZones = buildMergedConfirmZoneOverlays(chartConfirms, params.candles, params.timeframe);
  const structureScenarios = buildMergedDeskStructureScenarioOverlays({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
    smcLeading,
    bounceScenarios,
  });
  const supportRebound = buildMergedDeskSupportReboundAnalysis({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: keyZonesAll,
    bounceScenarios,
    smcLeading,
    criticalZones: criticalZonesAll,
    vrvp,
    analysis: params.analysis,
    whaleMemoryZones: params.whaleMemoryZones,
  });
  /** 차트 — 참조 ZONE + 구조·안착·반등/하락 시나리오 + 캔들 추세선·지지반등 */
  const overlays = filterMergedDeskChartOverlays(
    dedupeOverlays([
      ...criticalZoneOverlays,
      ...keyZoneOverlays,
      ...confirmZones,
      ...structureScenarios,
      ...supportRebound.overlays,
    ])
  );
  return {
    overlays,
    swingChartMarkers: [],
    signal: extractMergedTradeSignal(params.bundle),
    vrvp,
    aresLevels,
    keyZones: keyZonesAll,
    keyZoneMarkers,
    directionConfirms: directionConfirmsAll,
    directionConfirmMarkers,
    criticalZones: criticalZonesAll,
    bounceScenarios,
    smcLeading,
    supportReboundKo: supportRebound.summaryKo,
    supportReboundDetailKo: supportRebound.detailKo,
    projectedDownsideKo: supportRebound.projectedDownsideKo,
    projectedUpsideKo: supportRebound.projectedUpsideKo,
  };
}

function dedupeOverlays(items: OverlayItem[]): OverlayItem[] {
  const seen = new Set<string>();
  const out: OverlayItem[] = [];
  for (const o of items) {
    const key = String(o.id || `${o.kind}-${o.price1}-${o.time1}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}
