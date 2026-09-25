/**
 * 마감·안착 Strike Desk — 핵심 롱·숏 타점·손절·수익을 한 화면에 통합.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeFuturesScenario, InstitutionalSuperTrendCore } from '@/lib/institutionalSuperBand';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  computeMonthDeskCoreLongEntry,
  type MonthDeskCoreLongEntry,
} from '@/lib/monthDeskCoreLongEntry';
import {
  computeMonthDeskCoreShortEntry,
  type MonthDeskCoreShortEntry,
} from '@/lib/monthDeskCoreShortEntry';
import type { MonthDeskUnifiedFusion } from '@/lib/monthDeskUnifiedTradeDesk';
import { mergedDeskLastCandleZoneTimes } from '@/lib/mergedAnalysisOverlayTimes';
import { resolveMonthDeskTypeomFusionContext } from '@/lib/monthDeskTypeomFusionContext';
import type { MonthDeskConfirmedInput } from '@/lib/monthDeskZoneSignalPalette';
import type { MonthDeskAnalysisFusionInput } from '@/lib/monthDeskUnifiedTradeDesk';
import {
  tightenMonthDeskStopLossLong,
  tightenMonthDeskStopLossShort,
  widenMonthDeskReboundTargetsLong,
  widenMonthDeskReboundTargetsShort,
} from '@/lib/monthDeskStructuralStopPlan';
import {
  enrichStrikeDeskWithAi,
  type StrikeAiDeskMeta,
} from '@/lib/monthDeskStrikeAiSignal';

export type StrikeLegStrength = 'strong' | 'moderate' | 'watch';

export type MonthDeskStrikeLeg = {
  side: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  zoneTop: number;
  zoneBot: number;
  score: number;
  strength: StrikeLegStrength;
  rr1: number;
  rr3: number;
  riskPct: number;
  rewardPct: number;
  headlineKo: string;
  statusKo: string;
  reasonsKo: string[];
};

export type MonthDeskStrikeDeskBundle = {
  long: MonthDeskStrikeLeg | null;
  short: MonthDeskStrikeLeg | null;
  primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  primaryKo: string;
  fusion: MonthDeskUnifiedFusion;
  close: number;
  timeframe: string;
  ai?: StrikeAiDeskMeta;
};

export const MONTH_DESK_STRIKE_IDS = {
  longZone: 'month-desk-strike-long-zone',
  longEntry: 'month-desk-strike-long-entry',
  longSl: 'month-desk-strike-long-sl',
  longTp1: 'month-desk-strike-long-tp1',
  longTp2: 'month-desk-strike-long-tp2',
  longTp3: 'month-desk-strike-long-tp3',
  shortZone: 'month-desk-strike-short-zone',
  shortEntry: 'month-desk-strike-short-entry',
  shortSl: 'month-desk-strike-short-sl',
  shortTp1: 'month-desk-strike-short-tp1',
  shortTp2: 'month-desk-strike-short-tp2',
  shortTp3: 'month-desk-strike-short-tp3',
  longBeam: 'month-desk-strike-ai-long-beam',
  shortBeam: 'month-desk-strike-ai-short-beam',
  longPin: 'month-desk-strike-ai-long-pin',
  shortPin: 'month-desk-strike-ai-short-pin',
} as const;

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

function rr(entry: number, sl: number, tp: number, side: 'LONG' | 'SHORT'): number {
  const risk = side === 'LONG' ? Math.max(entry - sl, 1e-9) : Math.max(sl - entry, 1e-9);
  const reward = side === 'LONG' ? Math.max(tp - entry, 0) : Math.max(entry - tp, 0);
  return reward / risk;
}

function legFromLong(core: MonthDeskCoreLongEntry, close: number): MonthDeskStrikeLeg {
  const wide = widenMonthDeskReboundTargetsLong({
    entry: core.entry,
    stopLoss: core.stopLoss,
    tp1: core.bounceTarget * 0.55 + core.entry * 0.45,
    tp2: core.bounceTarget * 0.78 + core.entry * 0.22,
    tp3: core.bounceTarget,
    legHi: core.zoneTop,
    swingHi: core.zoneTop,
    atr: Math.max(core.zoneTop - core.zoneBot, core.entry * 0.003),
  });
  const tp1 = wide.tp1;
  const tp2 = wide.tp2;
  const tp3 = wide.tp3;
  const dist = Math.abs(close - core.entry) / Math.max(close, 1e-9);
  const statusKo =
    dist <= 0.012
      ? '가격 근접'
      : close > core.entry
        ? '지지 위'
        : close < core.stopLoss
          ? '손절 아래'
          : '대기';
  return {
    side: 'LONG',
    entry: core.entry,
    stopLoss: core.stopLoss,
    tp1,
    tp2,
    tp3,
    zoneTop: core.zoneTop,
    zoneBot: core.zoneBot,
    score: core.score,
    strength: core.strength,
    rr1: rr(core.entry, core.stopLoss, tp1, 'LONG'),
    rr3: rr(core.entry, core.stopLoss, tp3, 'LONG'),
    riskPct: ((core.entry - core.stopLoss) / core.entry) * 100,
    rewardPct: ((tp3 - core.entry) / core.entry) * 100,
    headlineKo: core.headlineKo,
    statusKo,
    reasonsKo: core.reasonsKo,
  };
}

function legFromShort(core: MonthDeskCoreShortEntry, close: number): MonthDeskStrikeLeg {
  const dist = Math.abs(close - core.entry) / Math.max(close, 1e-9);
  const statusKo =
    dist <= 0.012
      ? '가격 근접'
      : close < core.entry
        ? '저항 아래'
        : close > core.stopLoss
          ? '손절 위'
          : '대기';
  return {
    side: 'SHORT',
    entry: core.entry,
    stopLoss: core.stopLoss,
    tp1: core.tp1,
    tp2: core.tp2,
    tp3: core.tp3,
    zoneTop: core.zoneTop,
    zoneBot: core.zoneBot,
    score: core.score,
    strength: core.strength,
    rr1: rr(core.entry, core.stopLoss, core.tp1, 'SHORT'),
    rr3: rr(core.entry, core.stopLoss, core.tp3, 'SHORT'),
    riskPct: ((core.stopLoss - core.entry) / core.entry) * 100,
    rewardPct: ((core.entry - core.tp3) / core.entry) * 100,
    headlineKo: core.headlineKo,
    statusKo,
    reasonsKo: core.reasonsKo,
  };
}

function fallbackLongLeg(fusion: MonthDeskUnifiedFusion, candles: Candle[], atr: number): MonthDeskStrikeLeg | null {
  if (fusion.direction === 'WAIT' && fusion.scoreLong < fusion.scoreShort + 4) return null;
  const close = Number(candles[candles.length - 1]?.close);
  if (!Number.isFinite(close)) return null;
  const entry = fusion.zoneCoreBot + (fusion.zoneCoreTop - fusion.zoneCoreBot) * 0.42;
  const sl = tightenMonthDeskStopLossLong({
    entry,
    zoneBot: fusion.zoneCoreBot,
    zoneTop: fusion.zoneCoreTop,
    atr,
    legLo: fusion.zoneBot,
    looseCandidates: [fusion.stopLoss, fusion.zoneBot],
  });
  const tps = widenMonthDeskReboundTargetsLong({
    entry,
    stopLoss: sl,
    tp1: fusion.tp1,
    tp2: fusion.tp2,
    tp3: fusion.tp3,
    legHi: fusion.zoneTop,
    atr,
  });
  return {
    side: 'LONG',
    entry,
    stopLoss: sl,
    tp1: tps.tp1,
    tp2: tps.tp2,
    tp3: tps.tp3,
    zoneTop: fusion.zoneCoreTop,
    zoneBot: fusion.zoneCoreBot,
    score: Math.round(fusion.scoreLong * 8),
    strength: fusion.scoreLong >= 9 ? 'moderate' : 'watch',
    rr1: rr(entry, sl, tps.tp1, 'LONG'),
    rr3: rr(entry, sl, tps.tp3, 'LONG'),
    riskPct: ((entry - sl) / entry) * 100,
    rewardPct: ((tps.tp3 - entry) / entry) * 100,
    headlineKo: `연합 롱 타점 (점수 ${fusion.scoreLong.toFixed(1)})`,
    statusKo: '연합 참고',
    reasonsKo: fusion.reasonsKo.slice(0, 4),
  };
}

function fallbackShortLeg(fusion: MonthDeskUnifiedFusion, candles: Candle[], atr: number): MonthDeskStrikeLeg | null {
  if (fusion.direction === 'WAIT' && fusion.scoreShort < fusion.scoreLong + 4) return null;
  const close = Number(candles[candles.length - 1]?.close);
  if (!Number.isFinite(close)) return null;
  const entry = fusion.zoneCoreBot + (fusion.zoneCoreTop - fusion.zoneCoreBot) * 0.58;
  const sl = tightenMonthDeskStopLossShort({
    entry,
    zoneBot: fusion.zoneCoreBot,
    zoneTop: fusion.zoneCoreTop,
    atr,
    legHi: fusion.zoneTop,
    looseCandidates: [fusion.stopLoss, fusion.zoneTop],
  });
  const tps = widenMonthDeskReboundTargetsShort({
    entry,
    stopLoss: sl,
    tp1: fusion.tp1,
    tp2: fusion.tp2,
    tp3: fusion.tp3,
    legLo: fusion.zoneBot,
    atr,
  });
  return {
    side: 'SHORT',
    entry,
    stopLoss: sl,
    tp1: tps.tp1,
    tp2: tps.tp2,
    tp3: tps.tp3,
    zoneTop: fusion.zoneCoreTop,
    zoneBot: fusion.zoneCoreBot,
    score: Math.round(fusion.scoreShort * 8),
    strength: fusion.scoreShort >= 9 ? 'moderate' : 'watch',
    rr1: rr(entry, sl, tps.tp1, 'SHORT'),
    rr3: rr(entry, sl, tps.tp3, 'SHORT'),
    riskPct: ((sl - entry) / entry) * 100,
    rewardPct: ((entry - tps.tp3) / entry) * 100,
    headlineKo: `연합 숏 타점 (점수 ${fusion.scoreShort.toFixed(1)})`,
    statusKo: '연합 참고',
    reasonsKo: fusion.reasonsKo.slice(0, 4),
  };
}

export function buildMonthDeskStrikeDeskBundle(params: {
  candles: Candle[];
  timeframe?: string;
  swingPivot: number;
  scenario: ClosingEnvelopeFuturesScenario | null;
  stCore: InstitutionalSuperTrendCore | null;
  confirmedSignal?: MonthDeskConfirmedInput | null;
  analyzeVerdict?: 'LONG' | 'SHORT' | null;
  analyzeFusion?: MonthDeskAnalysisFusionInput | null;
  coreLongEnabled?: boolean;
  coreShortEnabled?: boolean;
  analysis?: AnalyzeResponse | null;
}): MonthDeskStrikeDeskBundle | null {
  const ctx = resolveMonthDeskTypeomFusionContext(params);
  if (!ctx) return null;
  const { fusion, legHi, legLo, pocketTop, pocketBot, swingHigh, swingLow, tZoneStart, t2, chartTf, L } = ctx;
  const candles = params.candles;
  const close = Number(candles[candles.length - 1]?.close);
  if (!Number.isFinite(close)) return null;

  const coreLong = computeMonthDeskCoreLongEntry({
    candles,
    timeframe: chartTf,
    swingPivot: L,
    fusion,
    legHi,
    legLo,
    pocketTop,
    pocketBot,
    swingHigh,
    swingLow,
    stCore: params.stCore,
    scenario: params.scenario,
    enabled: params.coreLongEnabled !== false,
  });

  const coreShort = computeMonthDeskCoreShortEntry({
    candles,
    timeframe: chartTf,
    swingPivot: L,
    fusion,
    legHi,
    legLo,
    pocketTop,
    pocketBot,
    swingHigh,
    swingLow,
    stCore: params.stCore,
    scenario: params.scenario,
    enabled: params.coreShortEnabled !== false,
  });

  const atr = Math.max(pocketTop - pocketBot, close * 0.004);
  const long = coreLong ? legFromLong(coreLong, close) : fallbackLongLeg(fusion, candles, atr);
  const short = coreShort ? legFromShort(coreShort, close) : fallbackShortLeg(fusion, candles, atr);

  let primary: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  const lScore = long?.score ?? 0;
  const sScore = short?.score ?? 0;
  if (lScore > sScore + 8) primary = 'LONG';
  else if (sScore > lScore + 8) primary = 'SHORT';
  else if (fusion.direction === 'LONG') primary = 'LONG';
  else if (fusion.direction === 'SHORT') primary = 'SHORT';
  else if (lScore >= sScore) primary = long ? 'LONG' : 'NEUTRAL';
  else primary = short ? 'SHORT' : 'NEUTRAL';

  const primaryKo =
    primary === 'LONG'
      ? `우선 롱 · ${long?.strength === 'strong' ? '★' : ''}점수 ${lScore}`
      : primary === 'SHORT'
        ? `우선 숏 · ${short?.strength === 'strong' ? '★' : ''}점수 ${sScore}`
        : '양방향 관망';

  const base: MonthDeskStrikeDeskBundle = {
    long,
    short,
    primary,
    primaryKo,
    fusion,
    close,
    timeframe: normalizeChartTimeframe(params.timeframe ?? chartTf),
  };
  return enrichStrikeDeskWithAi(base, candles, params.analysis ?? null);
}

function strikeLine(
  id: string,
  label: string,
  price: number,
  color: string,
  t1: number,
  t2: number,
  tip: string,
  extra?: Partial<OverlayItem>
): OverlayItem {
  return {
    id,
    kind: 'keyLevel',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: price,
    price2: price,
    confidence: 96,
    color,
    lineStrokeWidth: 2.5,
    category: 'scenario',
    labelTooltip: tip,
    ...extra,
  };
}

function legOverlays(
  leg: MonthDeskStrikeLeg,
  t1: number,
  t2: number,
  aiMeta?: StrikeAiDeskMeta | null,
  close?: number
): OverlayItem[] {
  const ids = MONTH_DESK_STRIKE_IDS;
  const isLong = leg.side === 'LONG';
  const zoneId = isLong ? ids.longZone : ids.shortZone;
  const legAi = isLong ? aiMeta?.long : aiMeta?.short;
  const hot = legAi?.phase === 'hot';
  const align = legAi?.phase === 'align' || hot;
  const conf = legAi?.confluence ?? leg.score;

  const tip = [
    legAi?.tagKo ?? (isLong ? 'Strike 롱' : 'Strike 숏'),
    `AI confluence ${conf} · ${legAi?.phase ?? 'scan'}`,
    leg.headlineKo,
    `E ${fmtPx(leg.entry)} · SL ${fmtPx(leg.stopLoss)} · TP1~3 ${fmtPx(leg.tp1)} / ${fmtPx(leg.tp2)} / ${fmtPx(leg.tp3)}`,
    `R1≈${leg.rr1.toFixed(1)} · R3≈${leg.rr3.toFixed(1)} · ${leg.statusKo}`,
    leg.reasonsKo.join(' · '),
    'AI Zone·Line 참고 — 확정·수익 보장 아님.',
  ].join('\n');

  const zoneColor = isLong
    ? hot
      ? 'rgba(250,204,21,0.48)'
      : leg.strength === 'strong'
        ? 'rgba(34,197,94,0.34)'
        : 'rgba(34,197,94,0.24)'
    : hot
      ? 'rgba(251,146,60,0.46)'
      : leg.strength === 'strong'
        ? 'rgba(248,113,113,0.36)'
        : 'rgba(251,146,60,0.24)';

  const zoneLabel = hot
    ? isLong
      ? '⚡ AI 롱 HOT'
      : '⚡ AI 숏 HOT'
    : align
      ? isLong
        ? '◆ AI 롱 Zone'
        : '◆ AI 숏 Zone'
      : isLong
        ? '◎ Strike 롱'
        : '◎ Strike 숏';

  const out: OverlayItem[] = [
    {
      id: zoneId,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: zoneLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: leg.zoneTop,
      price2: leg.zoneBot,
      confidence: hot ? 99 : 98,
      color: zoneColor,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      zonePulse: hot || leg.strength === 'strong',
      overlayZoneExtraClass: [
        `overlay-zone--monthdesk-strike-${isLong ? 'long' : 'short'}`,
        `overlay-zone--strike-ai-${isLong ? 'long' : 'short'}`,
        hot ? 'overlay-zone--strike-ai-hot' : align ? 'overlay-zone--strike-ai-align' : '',
        'overlay-zone--core-pulse',
      ]
        .filter(Boolean)
        .join(' '),
      lineLabelColor: isLong ? '#fde047' : '#fecaca',
      labelBackgroundColor: hot
        ? 'rgba(88,28,135,0.92)'
        : isLong
          ? 'rgba(22,101,52,0.94)'
          : 'rgba(127,29,29,0.94)',
      labelTextColor: '#fffbeb',
    },
    strikeLine(
      isLong ? ids.longEntry : ids.shortEntry,
      hot ? `⚡ E ${conf}` : isLong ? `롱 E` : `숏 E`,
      leg.entry,
      hot
        ? 'rgba(253,224,71,1)'
        : isLong
          ? 'rgba(250,204,21,0.98)'
          : 'rgba(251,146,60,0.98)',
      t1,
      t2,
      tip,
      {
        lineLabelColor: isLong ? '#fde047' : '#fdba74',
        lineStrokeWidth: hot ? 3.5 : 3,
        labelBackgroundColor: hot ? 'rgba(88,28,135,0.9)' : undefined,
      }
    ),
    strikeLine(
      isLong ? ids.longSl : ids.shortSl,
      '손절 SL',
      leg.stopLoss,
      'rgba(248,113,113,0.95)',
      t1,
      t2,
      tip,
      { lineDash: '5 4', lineLabelColor: '#fecaca' }
    ),
    strikeLine(
      isLong ? ids.longTp1 : ids.shortTp1,
      '수익 TP1',
      leg.tp1,
      'rgba(134,239,172,0.92)',
      t1,
      t2,
      tip,
      { lineDash: '8 5', lineLabelColor: '#bbf7d0' }
    ),
    strikeLine(
      isLong ? ids.longTp2 : ids.shortTp2,
      '수익 TP2',
      leg.tp2,
      'rgba(125,211,252,0.9)',
      t1,
      t2,
      tip,
      { lineDash: '8 6', lineLabelColor: '#7dd3fc' }
    ),
    strikeLine(
      isLong ? ids.longTp3 : ids.shortTp3,
      '수익 TP3',
      leg.tp3,
      'rgba(167,139,250,0.88)',
      t1,
      t2,
      tip,
      { lineDash: '6 8', lineLabelColor: '#ddd6fe' }
    ),
  ];

  if (close != null && Number.isFinite(close) && align) {
    const midT = Math.round(t1 + (t2 - t1) * 0.72);
    out.push({
      id: isLong ? ids.longBeam : ids.shortBeam,
      kind: 'trendLine',
      label: hot ? 'AI beam' : '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: midT,
      time2: t2,
      price1: leg.entry,
      price2: close,
      confidence: hot ? 97 : 88,
      color: hot
        ? isLong
          ? 'rgba(250,204,21,0.55)'
          : 'rgba(251,146,60,0.55)'
        : 'rgba(148,163,184,0.35)',
      lineDash: hot ? '2 6' : '4 8',
      lineStrokeWidth: hot ? 2.2 : 1.4,
      noProject: true,
      labelTooltip: tip,
    });
  }

  return out;
}

export function buildMonthDeskStrikeDeskOverlays(
  bundle: MonthDeskStrikeDeskBundle,
  candles: Candle[]
): OverlayItem[] {
  if (candles.length < 2) return [];
  const tf = bundle.timeframe ?? '4h';
  const { t1, t2 } = mergedDeskLastCandleZoneTimes(candles, tf);
  const t1n = Number(t1);
  const t2n = Number(t2);
  if (!Number.isFinite(t1n) || !Number.isFinite(t2n)) return [];
  const out: OverlayItem[] = [];
  const ai = bundle.ai;
  const close = bundle.close;
  if (bundle.long) out.push(...legOverlays(bundle.long, t1n, t2n, ai, close));
  if (bundle.short) out.push(...legOverlays(bundle.short, t1n, t2n, ai, close));
  return out;
}

/** 보드·HUD용 — analyze 없이 overlay pack에서 복원 (차트 전용 폴백) */
export function strikeDeskFromAnalyze(
  analysis: AnalyzeResponse | null,
  candles: Candle[] | null,
  symbol: string,
  timeframe: string,
  swingPivot: number
): MonthDeskStrikeDeskBundle | null {
  if (!analysis || !candles || candles.length < 12) return null;
  const safe = candles;
  return buildMonthDeskStrikeDeskBundle({
    candles: safe,
    timeframe,
    swingPivot,
    scenario: (analysis as { closingEnvelopeScenario?: ClosingEnvelopeFuturesScenario | null })
      .closingEnvelopeScenario ?? null,
    stCore: null,
    analyzeVerdict: analysis.verdict === 'LONG' || analysis.verdict === 'SHORT' ? analysis.verdict : null,
    analyzeFusion: {
      currentPrice: analysis.currentPrice,
      atr: analysis.indicators?.atr?.[analysis.indicators.atr.length - 1],
      longScore: analysis.longScore,
      shortScore: analysis.shortScore,
      verdict: analysis.verdict,
    },
    analysis,
  });
}

export { buildStrikeAiChartMarkers } from '@/lib/monthDeskStrikeAiSignal';
