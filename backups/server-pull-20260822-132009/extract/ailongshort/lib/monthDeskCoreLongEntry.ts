/**
 * 마감·안착 — 여러 존·타점 중 **핵심 롱 지지·반등** 구간 1곳 선별(교육·참고).
 * 기존 zone은 유지하고 `month-desk-core-long-*` 오버레이로만 강조.
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
import { rangeFromPivots } from '@/lib/smcDeskOverlay';
import {
  tightenMonthDeskStopLossLong,
  widenMonthDeskReboundTargetsLong,
} from '@/lib/monthDeskStructuralStopPlan';

export type MonthDeskCoreLongEntry = {
  entry: number;
  zoneTop: number;
  zoneBot: number;
  stopLoss: number;
  bounceTarget: number;
  score: number;
  strength: 'strong' | 'moderate' | 'watch';
  reasonsKo: string[];
  headlineKo: string;
};

export type MonthDeskCoreLongHudLine = {
  entry: number;
  bounceTarget: number;
  stopLoss: number;
  score: number;
  strength: MonthDeskCoreLongEntry['strength'];
  headlineKo: string;
};

type Candidate = {
  entry: number;
  zoneTop: number;
  zoneBot: number;
  tag: string;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) {
    const last = candles[n - 1];
    return Math.max((last?.high ?? 0) - (last?.low ?? 0), (last?.close ?? 1) * 0.004);
  }
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    sum += tr;
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
  stLower: number | null;
  stTrend: number;
  oteTop: number | null;
  oteBot: number | null;
  bullishStructure: boolean;
  timeframe?: string;
}): { total: number; reasonsKo: string[]; stopLoss: number; bounceTarget: number } {
  const { c, close, atr, legHi, legLo, swingHi, swingLo, fusion, stLower, stTrend, oteTop, oteBot, bullishStructure, timeframe } =
    params;
  const entry = c.entry;
  const reasonsKo: string[] = [];
  let support = 0;
  let bounce = 0;
  let conf = 0;

  const looseSlCandidates = [
    c.zoneBot - atr * 0.12,
    fusion.stopLoss,
    swingLo - atr * 0.08,
    stLower != null && Number.isFinite(stLower) ? stLower - atr * 0.35 : c.zoneBot - atr * 0.25,
  ].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const stopLoss = tightenMonthDeskStopLossLong({
    entry,
    zoneBot: c.zoneBot,
    zoneTop: c.zoneTop,
    atr,
    legLo,
    timeframe,
    looseCandidates: looseSlCandidates,
  });

  const wideTp = widenMonthDeskReboundTargetsLong({
    entry,
    stopLoss,
    tp1: fusion.tp1,
    tp2: fusion.tp2,
    tp3: fusion.tp3,
    legHi,
    swingHi,
    atr,
  });
  const bounceTarget = Math.max(wideTp.tp3, wideTp.tp2, wideTp.tp1, legHi, entry + atr * 2.5);
  const risk = Math.max(entry - stopLoss, atr * 0.35, entry * 1e-6);
  const reward = Math.max(bounceTarget - entry, 0);
  const rr = reward / risk;

  if (entry > close * 1.06 && close < c.zoneBot) {
    return { total: 0, reasonsKo: [], stopLoss, bounceTarget };
  }

  if (entry >= fusion.zoneCoreBot && entry <= fusion.zoneCoreTop) {
    support += 14;
    reasonsKo.push('연합 코어 존 겹침');
  } else if (entry >= fusion.zoneBot && entry <= fusion.zoneTop) {
    support += 8;
    reasonsKo.push('연합 타점 존 안');
  }

  if (stLower != null && Number.isFinite(stLower) && Math.abs(entry - stLower) <= atr * 0.55) {
    support += 11;
    reasonsKo.push('ST 하단 지지 근접');
  }
  if (entry <= swingLo + atr * 0.45) {
    support += 9;
    reasonsKo.push('스윙 저점·지지대');
  }
  if (oteTop != null && oteBot != null && entry <= oteTop + atr * 0.1 && entry >= oteBot - atr * 0.1) {
    support += 10;
    reasonsKo.push('OTE(61.8~78.6%) 구간');
  }
  if (close >= c.zoneBot && close <= c.zoneTop + atr * 0.35) {
    support += 6;
    reasonsKo.push('종가가 지지 존 부근');
  } else if (close > entry && close <= entry + atr * 2.2) {
    support += 5;
    reasonsKo.push('지지 위 눌림(되돌림) 구간');
  }

  if (rr >= 2.4) {
    bounce += 16;
    reasonsKo.push(`반등 여력 R≈${rr.toFixed(1)}`);
  } else if (rr >= 1.35) {
    bounce += 10;
    reasonsKo.push(`반등 여력 R≈${rr.toFixed(1)}`);
  }
  const upPct = (reward / Math.max(entry, 1e-9)) * 100;
  bounce += Math.min(18, upPct * 0.85);
  if (upPct >= 8) reasonsKo.push(`상방 여지 약 ${upPct.toFixed(1)}%`);

  conf += Math.min(14, fusion.scoreLong * 0.55);
  if (fusion.scoreLong > fusion.scoreShort + 2) {
    conf += 5;
    reasonsKo.push('연합 롱 가중');
  }
  if (fusion.direction === 'LONG') conf += 4;
  if (stTrend === 1) conf += 4;
  if (bullishStructure) conf += 3;
  if (fusion.direction === 'SHORT' && fusion.scoreShort > fusion.scoreLong + 10) {
    conf -= 7;
  }

  const total = support + bounce + conf;
  return { total, reasonsKo: [...new Set(reasonsKo)].slice(0, 8), stopLoss, bounceTarget };
}

export function computeMonthDeskCoreLongEntry(params: {
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
}): MonthDeskCoreLongEntry | null {
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
  const stLower = params.stCore?.finalLower?.[end] ?? null;
  const stTrend = params.stCore?.trend?.[end] ?? 0;

  const candidates: Candidate[] = [];

  if (fusion.zoneCoreTop > fusion.zoneCoreBot + 1e-9) {
    const entry = (fusion.zoneCoreTop + fusion.zoneCoreBot) / 2;
    candidates.push({
      entry,
      zoneTop: fusion.zoneCoreTop,
      zoneBot: fusion.zoneCoreBot,
      tag: 'fusion-core',
    });
  }

  const impulse = findRecentImpulseLeg(candles, L, start, end, 'LONG');
  let legHi = params.legHi;
  let legLo = params.legLo;
  let oteTop: number | null = null;
  let oteBot: number | null = null;
  if (impulse) {
    legHi = impulse.legHi;
    legLo = impulse.legLo;
    const ote = htfOtePocketBounds(legHi, legLo, 'LONG');
    if (ote) {
      oteTop = ote.pocketTop;
      oteBot = ote.pocketBot;
      const entry = (ote.pocketTop + ote.pocketBot) / 2;
      candidates.push({ entry, zoneTop: ote.pocketTop, zoneBot: ote.pocketBot, tag: 'ote' });
    }
  }

  if (stLower != null && Number.isFinite(stLower) && stLower > 0 && stLower < close * 1.05) {
    const half = atr * 0.28;
    candidates.push({
      entry: stLower,
      zoneTop: stLower + half,
      zoneBot: stLower - half,
      tag: 'st',
    });
  }

  const swLo = params.swingLow;
  if (Number.isFinite(swLo) && swLo > 0 && swLo < close) {
    candidates.push({
      entry: swLo + atr * 0.06,
      zoneTop: swLo + atr * 0.22,
      zoneBot: swLo - atr * 0.14,
      tag: 'swing',
    });
  }

  const pTop = params.pocketTop;
  const pBot = params.pocketBot;
  if (pTop > pBot + 1e-9) {
    const span = pTop - pBot;
    const entry = pBot + span * 0.32;
    candidates.push({
      entry,
      zoneTop: pBot + span * 0.52,
      zoneBot: pBot,
      tag: 'pocket',
    });
  }

  if (Number.isFinite(fusion.entry) && fusion.entry < close * 1.04) {
    const half = Math.max(atr * 0.22, (fusion.zoneCoreTop - fusion.zoneCoreBot) * 0.35);
    candidates.push({
      entry: fusion.entry,
      zoneTop: fusion.entry + half,
      zoneBot: fusion.entry - half,
      tag: 'fusion-entry',
    });
  }

  let best: {
    c: Candidate;
    total: number;
    reasonsKo: string[];
    stopLoss: number;
    bounceTarget: number;
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
      stLower,
      stTrend,
      oteTop,
      oteBot,
      bullishStructure: params.scenario?.bias === 'LONG',
      timeframe: chartTf,
    });
    if (scored.total < 44) continue;
    if (!best || scored.total > best.total) {
      best = { c, ...scored };
    }
  }

  if (!best) return null;

  const leg = Math.max(legHi - legLo, atr);
  const htf = isMonthDeskHtfTimeframe(chartTf);
  let coreHalf = Math.min(atr * (htf ? 0.38 : 0.48), leg * (htf ? 0.022 : 0.032));
  if (htf) {
    const maxSpan = htfMaxPocketSpan({
      legHi,
      legLo,
      atr,
      refPrice: close,
      timeframe: chartTf,
    });
    const capped = capZoneVerticalSpan(
      best.c.zoneTop,
      best.c.zoneBot,
      best.c.entry,
      Math.min(maxSpan * 0.42, atr * 1.1)
    );
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
  const strength: MonthDeskCoreLongEntry['strength'] =
    score >= 78 ? 'strong' : score >= 58 ? 'moderate' : 'watch';

  const headlineKo =
    strength === 'strong'
      ? `★ 핵심 롱타점 — 지지·반등 우선(점수 ${score})`
      : strength === 'moderate'
        ? `핵심 롱 후보 — 지지·반등 참고(${score})`
        : `롱 지지 관찰 구간(${score})`;

  return {
    entry,
    zoneTop,
    zoneBot,
    stopLoss: best.stopLoss,
    bounceTarget: best.bounceTarget,
    score,
    strength,
    reasonsKo: best.reasonsKo,
    headlineKo,
  };
}

export function buildMonthDeskCoreLongEntryOverlays(
  core: MonthDeskCoreLongEntry,
  timeStart: number,
  timeEnd: number
): OverlayItem[] {
  const t1 = Math.min(timeStart, timeEnd);
  const t2 = Math.max(timeStart, timeEnd);
  const tip = [
    core.headlineKo,
    `진입 참고 ${core.entry.toPrecision(6)} · SL ${core.stopLoss.toPrecision(6)} · 반등 목표 ${core.bounceTarget.toPrecision(6)}`,
    core.reasonsKo.join(' · '),
    '확정 신호·수익 보장 아님 — 상위 TF·체결 확인 후 참고.',
  ].join('\n');

  const zoneColor =
    core.strength === 'strong'
      ? 'rgba(250,204,21,0.32)'
      : core.strength === 'moderate'
        ? 'rgba(52,211,153,0.26)'
        : 'rgba(148,163,184,0.22)';

  return [
    {
      id: 'month-desk-core-long-spot',
      kind: 'demandZone',
      label: '★ 핵심 롱타점',
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
      lineLabelColor: '#fde047',
      labelBackgroundColor: 'rgba(120,53,15,0.94)',
      labelTextColor: '#fffbeb',
      overlayZoneExtraClass:
        'overlay-zone--monthdesk-core-long overlay-zone--core-pulse overlay-zone--monthdesk-tier--confirmed',
    },
    {
      id: 'month-desk-core-long-entry',
      kind: 'entry',
      label: '핵심 E',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: core.entry,
      price2: core.entry,
      confidence: 90,
      color: 'rgba(250,204,21,0.95)',
      lineLabelColor: '#fde047',
      labelBackgroundColor: 'rgba(120,53,15,0.92)',
      labelTextColor: '#fffbeb',
      category: 'scenario',
      labelTooltip: tip,
    },
    {
      id: 'month-desk-core-long-bounce',
      kind: 'target',
      label: '반등 목표',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: core.bounceTarget,
      price2: core.bounceTarget,
      confidence: 85,
      color: 'rgba(74,222,128,0.75)',
      lineLabelColor: '#86efac',
      lineDash: '10 6',
      category: 'scenario',
      labelTooltip: `레그·연합 TP 기준 반등 여력 참고 — ${core.bounceTarget.toPrecision(6)}`,
    },
    {
      id: 'month-desk-core-long-sl',
      kind: 'stop',
      label: '핵심 SL',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: core.stopLoss,
      price2: core.stopLoss,
      confidence: 88,
      color: 'rgba(251,113,133,0.82)',
      lineLabelColor: '#fda4af',
      lineDash: '6 5',
      category: 'scenario',
      labelTooltip: `지지 이탈·무효 참고 — ${core.stopLoss.toPrecision(6)}`,
    },
  ];
}

export function monthDeskCoreLongHudFromOverlays(items: OverlayItem[]): MonthDeskCoreLongHudLine | null {
  const zone = items.find((o) => o.id === 'month-desk-core-long-spot');
  const entryLine = items.find((o) => o.id === 'month-desk-core-long-entry');
  const bounceLine = items.find((o) => o.id === 'month-desk-core-long-bounce');
  const slLine = items.find((o) => o.id === 'month-desk-core-long-sl');
  if (!zone || entryLine?.price1 == null) return null;
  const entry = Number(entryLine.price1);
  const bounceTarget = Number(bounceLine?.price1 ?? zone.price1);
  const stopLoss = Number(slLine?.price1 ?? zone.price2);
  if (!Number.isFinite(entry)) return null;
  const tip = String(zone.labelTooltip ?? '');
  const scoreMatch = tip.match(/점수\s*(\d+)|\((\d+)\)/);
  const score = scoreMatch ? Number(scoreMatch[1] ?? scoreMatch[2]) : 0;
  const strength: MonthDeskCoreLongEntry['strength'] =
    score >= 78 ? 'strong' : score >= 58 ? 'moderate' : 'watch';
  return {
    entry,
    bounceTarget,
    stopLoss,
    score,
    strength,
    headlineKo: String(zone.label ?? '★ 핵심 롱타점'),
  };
}
