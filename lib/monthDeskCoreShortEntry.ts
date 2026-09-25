/**
 * 마감·안착 — **핵심 숏 저항·하락** 구간 1곳 선별 (핵심 롱과 대칭).
 */
import type { Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeFuturesScenario, InstitutionalSuperTrendCore } from '@/lib/institutionalSuperBand';
import {
  capZoneVerticalSpan,
  findRecentImpulseLeg,
  htfMaxPocketSpan,
  htfOtePocketBounds,
  isMonthDeskHtfTimeframe,
  monthDeskZoneLookbackBars,
} from '@/lib/monthDeskZonePrecision';
import type { MonthDeskUnifiedFusion } from '@/lib/monthDeskUnifiedTradeDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  tightenMonthDeskStopLossShort,
  widenMonthDeskReboundTargetsShort,
} from '@/lib/monthDeskStructuralStopPlan';

export type MonthDeskCoreShortEntry = {
  entry: number;
  zoneTop: number;
  zoneBot: number;
  stopLoss: number;
  dropTarget: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  strength: 'strong' | 'moderate' | 'watch';
  reasonsKo: string[];
  headlineKo: string;
};

type Candidate = { entry: number; zoneTop: number; zoneBot: number; tag: string };

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) {
    const last = candles[n - 1];
    return Math.max((last?.high ?? 0) - (last?.low ?? 0), (last?.close ?? 1) * 0.004);
  }
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / 14;
}

function scoreCandidate(params: {
  c: Candidate;
  close: number;
  atr: number;
  legHi: number;
  legLo: number;
  swingHi: number;
  swingLo: number;
  fusion: MonthDeskUnifiedFusion;
  stUpper: number | null;
  stTrend: number;
  oteTop: number | null;
  oteBot: number | null;
  bearishStructure: boolean;
  timeframe?: string;
}): { total: number; reasonsKo: string[]; stopLoss: number; tp1: number; tp2: number; tp3: number } {
  const { c, close, atr, legHi, legLo, swingHi, fusion, stUpper, stTrend, oteTop, oteBot, bearishStructure, timeframe } =
    params;
  const entry = c.entry;
  const reasonsKo: string[] = [];
  let resist = 0;
  let drop = 0;
  let conf = 0;

  const looseSl = [
    c.zoneTop + atr * 0.12,
    fusion.stopLoss,
    swingHi + atr * 0.08,
    stUpper != null && Number.isFinite(stUpper) ? stUpper + atr * 0.35 : c.zoneTop + atr * 0.25,
  ].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const stopLoss = tightenMonthDeskStopLossShort({
    entry,
    zoneBot: c.zoneBot,
    zoneTop: c.zoneTop,
    atr,
    legHi,
    timeframe,
    looseCandidates: looseSl,
  });

  const wide = widenMonthDeskReboundTargetsShort({
    entry,
    stopLoss,
    tp1: fusion.tp1,
    tp2: fusion.tp2,
    tp3: fusion.tp3,
    legLo,
    swingLo: params.swingLo,
    atr,
  });
  const tp1 = Math.min(wide.tp1, entry - atr * 0.5);
  const tp2 = Math.min(wide.tp2, tp1 - atr * 0.35);
  const tp3 = Math.min(wide.tp3, tp2 - atr * 0.35);

  const risk = Math.max(stopLoss - entry, atr * 0.35, entry * 1e-6);
  const reward = Math.max(entry - tp3, 0);
  const rr = reward / risk;

  if (entry < close * 0.94 && close > c.zoneTop) {
    return { total: 0, reasonsKo: [], stopLoss, tp1, tp2, tp3 };
  }

  if (entry >= fusion.zoneCoreBot && entry <= fusion.zoneCoreTop) {
    resist += 14;
    reasonsKo.push('연합 코어 존 겹침');
  } else if (entry >= fusion.zoneBot && entry <= fusion.zoneTop) {
    resist += 8;
    reasonsKo.push('연합 타점 존 안');
  }
  if (stUpper != null && Math.abs(entry - stUpper) <= atr * 0.55) {
    resist += 11;
    reasonsKo.push('ST 상단 저항 근접');
  }
  if (entry >= swingHi - atr * 0.45) {
    resist += 9;
    reasonsKo.push('스윙 고점·저항대');
  }
  if (oteTop != null && oteBot != null && entry <= oteTop + atr * 0.1 && entry >= oteBot - atr * 0.1) {
    resist += 10;
    reasonsKo.push('OTE 되돌림 구간');
  }
  if (close <= c.zoneTop && close >= c.zoneBot - atr * 0.35) {
    resist += 6;
    reasonsKo.push('종가가 저항 존 부근');
  }

  if (rr >= 2.4) {
    drop += 16;
    reasonsKo.push(`하락 여력 R≈${rr.toFixed(1)}`);
  } else if (rr >= 1.35) {
    drop += 10;
    reasonsKo.push(`하락 여력 R≈${rr.toFixed(1)}`);
  }

  conf += Math.min(14, fusion.scoreShort * 0.55);
  if (fusion.scoreShort > fusion.scoreLong + 2) {
    conf += 5;
    reasonsKo.push('연합 숏 가중');
  }
  if (fusion.direction === 'SHORT') conf += 4;
  if (stTrend === -1) conf += 4;
  if (bearishStructure) conf += 3;
  if (fusion.direction === 'LONG' && fusion.scoreLong > fusion.scoreShort + 10) conf -= 7;

  return { total: resist + drop + conf, reasonsKo: [...new Set(reasonsKo)].slice(0, 8), stopLoss, tp1, tp2, tp3 };
}

export function computeMonthDeskCoreShortEntry(params: {
  candles: Candle[];
  timeframe?: string;
  swingPivot: number;
  fusion: MonthDeskUnifiedFusion;
  legHi: number;
  legLo: number;
  pocketTop: number;
  pocketBot: number;
  swingHigh: number;
  swingLow: number;
  stCore: InstitutionalSuperTrendCore | null;
  scenario?: ClosingEnvelopeFuturesScenario | null;
  enabled?: boolean;
}): MonthDeskCoreShortEntry | null {
  if (params.enabled === false) return null;
  const candles = params.candles;
  const n = candles.length;
  if (n < 12) return null;

  const chartTf = normalizeChartTimeframe(params.timeframe ?? '4h');
  const L = Math.max(2, Math.min(4, Math.floor(Number(params.swingPivot) || 2)));
  const end = n - 1;
  const lookback = monthDeskZoneLookbackBars(chartTf, Math.min(200, Math.max(32, n - L - 2)));
  const start = Math.max(L, n - lookback);
  const atr = atr14(candles);
  const close = Number(candles[end]?.close);
  if (!Number.isFinite(close) || close <= 0) return null;

  const fusion = params.fusion;
  const stUpper = params.stCore?.finalUpper?.[end] ?? null;
  const stTrend = params.stCore?.trend?.[end] ?? 0;
  const candidates: Candidate[] = [];

  if (fusion.zoneCoreTop > fusion.zoneCoreBot + 1e-9) {
    const entry = (fusion.zoneCoreTop + fusion.zoneCoreBot) / 2;
    candidates.push({ entry, zoneTop: fusion.zoneCoreTop, zoneBot: fusion.zoneCoreBot, tag: 'fusion-core' });
  }

  const impulse = findRecentImpulseLeg(candles, L, start, end, 'SHORT');
  let legHi = params.legHi;
  let legLo = params.legLo;
  let oteTop: number | null = null;
  let oteBot: number | null = null;
  if (impulse) {
    legHi = impulse.legHi;
    legLo = impulse.legLo;
    const ote = htfOtePocketBounds(legHi, legLo, 'SHORT');
    if (ote) {
      oteTop = ote.pocketTop;
      oteBot = ote.pocketBot;
      candidates.push({
        entry: (ote.pocketTop + ote.pocketBot) / 2,
        zoneTop: ote.pocketTop,
        zoneBot: ote.pocketBot,
        tag: 'ote',
      });
    }
  }

  if (stUpper != null && Number.isFinite(stUpper) && stUpper > close * 0.95) {
    const half = atr * 0.28;
    candidates.push({ entry: stUpper, zoneTop: stUpper + half, zoneBot: stUpper - half, tag: 'st' });
  }

  const swHi = params.swingHigh;
  if (Number.isFinite(swHi) && swHi > close) {
    candidates.push({
      entry: swHi - atr * 0.06,
      zoneTop: swHi + atr * 0.14,
      zoneBot: swHi - atr * 0.22,
      tag: 'swing',
    });
  }

  const pTop = params.pocketTop;
  const pBot = params.pocketBot;
  if (pTop > pBot + 1e-9) {
    const span = pTop - pBot;
    candidates.push({
      entry: pBot + span * 0.68,
      zoneTop: pBot + span,
      zoneBot: pBot + span * 0.48,
      tag: 'pocket',
    });
  }

  if (Number.isFinite(fusion.entry) && fusion.entry > close * 0.96) {
    const half = Math.max(atr * 0.22, (fusion.zoneCoreTop - fusion.zoneCoreBot) * 0.35);
    candidates.push({ entry: fusion.entry, zoneTop: fusion.entry + half, zoneBot: fusion.entry - half, tag: 'fusion-entry' });
  }

  let best: {
    c: Candidate;
    total: number;
    reasonsKo: string[];
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
  } | null = null;

  for (const c of candidates) {
    if (!Number.isFinite(c.entry) || c.entry <= 0) continue;
    const scored = scoreCandidate({
      c,
      close,
      atr,
      legHi,
      legLo,
      swingHi: params.swingHigh,
      swingLo: params.swingLow,
      fusion,
      stUpper,
      stTrend,
      oteTop,
      oteBot,
      bearishStructure: params.scenario?.bias === 'SHORT',
      timeframe: chartTf,
    });
    if (scored.total < 44) continue;
    if (!best || scored.total > best.total) best = { c, ...scored };
  }

  if (!best) return null;

  const htf = isMonthDeskHtfTimeframe(chartTf);
  let coreHalf = Math.min(atr * (htf ? 0.38 : 0.48), (legHi - legLo) * (htf ? 0.022 : 0.032));
  if (htf) {
    const maxSpan = htfMaxPocketSpan({ legHi, legLo, atr, refPrice: close, timeframe: chartTf });
    const capped = capZoneVerticalSpan(best.c.zoneTop, best.c.zoneBot, best.c.entry, Math.min(maxSpan * 0.42, atr * 1.1));
    coreHalf = Math.min(coreHalf, (capped.top - capped.bot) * 0.48);
  }
  const entry = best.c.entry;
  let zoneTop = entry + coreHalf;
  let zoneBot = entry - coreHalf;
  if (zoneTop <= zoneBot) {
    zoneTop = entry + atr * 0.2;
    zoneBot = entry - atr * 0.2;
  }

  const score = Math.min(100, Math.round(best.total * 1.05));
  const strength: MonthDeskCoreShortEntry['strength'] =
    score >= 78 ? 'strong' : score >= 58 ? 'moderate' : 'watch';
  const headlineKo =
    strength === 'strong'
      ? `★ 핵심 숏타점 — 저항·하락 우선(점수 ${score})`
      : strength === 'moderate'
        ? `핵심 숏 후보 — 저항·하락 참고(${score})`
        : `숏 저항 관찰 구간(${score})`;

  return {
    entry,
    zoneTop,
    zoneBot,
    stopLoss: best.stopLoss,
    dropTarget: best.tp3,
    tp1: best.tp1,
    tp2: best.tp2,
    tp3: best.tp3,
    score,
    strength,
    reasonsKo: best.reasonsKo,
    headlineKo,
  };
}

export function buildMonthDeskCoreShortEntryOverlays(
  core: MonthDeskCoreShortEntry,
  timeStart: number,
  timeEnd: number
): OverlayItem[] {
  const t1 = Math.min(timeStart, timeEnd);
  const t2 = Math.max(timeStart, timeEnd);
  const tip = [
    core.headlineKo,
    `진입 ${core.entry.toPrecision(6)} · SL ${core.stopLoss.toPrecision(6)} · TP3 ${core.tp3.toPrecision(6)}`,
    core.reasonsKo.join(' · '),
    '참고용 — 확정·수익 보장 아님.',
  ].join('\n');

  const zoneColor =
    core.strength === 'strong'
      ? 'rgba(248,113,113,0.34)'
      : core.strength === 'moderate'
        ? 'rgba(251,146,60,0.28)'
        : 'rgba(148,163,184,0.22)';

  const line = (id: string, label: string, price: number, color: string, dash?: string): OverlayItem => ({
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
    confidence: 90,
    color,
    lineLabelColor: '#fecaca',
    labelBackgroundColor: 'rgba(127,29,29,0.92)',
    labelTextColor: '#fff1f2',
    lineStrokeWidth: 2,
    lineDash: dash,
    category: 'scenario',
    labelTooltip: tip,
  });

  return [
    {
      id: 'month-desk-core-short-spot',
      kind: 'supplyZone',
      label: '★ 핵심 숏타점',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: core.zoneTop,
      price2: core.zoneBot,
      confidence: 92,
      color: zoneColor,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      zonePulse: true,
      overlayZoneExtraClass:
        'overlay-zone--monthdesk-core-short overlay-zone--core-pulse overlay-zone--monthdesk-tier--confirmed',
    },
    line('month-desk-core-short-entry', '핵심 S·E', core.entry, 'rgba(251,146,60,0.95)'),
    line('month-desk-core-short-sl', '핵심 S·SL', core.stopLoss, 'rgba(248,113,113,0.95)', '5 4'),
    line('month-desk-core-short-tp1', '핵심 S·TP1', core.tp1, 'rgba(134,239,172,0.88)', '8 5'),
    line('month-desk-core-short-tp2', '핵심 S·TP2', core.tp2, 'rgba(125,211,252,0.85)', '8 6'),
    line('month-desk-core-short-tp3', '핵심 S·TP3', core.tp3, 'rgba(167,139,250,0.82)', '6 8'),
  ];
}
