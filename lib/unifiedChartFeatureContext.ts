/**
 * 통합·분석 — 차트 zone · 롱/숏 확정 · FVG · line · 추세 · 밴드 신호 집계.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedAnalysisDeskHud } from '@/lib/mergedAnalysisDeskEngine';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';

export type UnifiedChartFeatureKey = 'zone' | 'confirm' | 'fvg' | 'line' | 'trend' | 'band';

export type UnifiedChartFeatureChip = {
  key: UnifiedChartFeatureKey;
  labelKo: string;
  active: boolean;
  aligned: boolean;
  detailKo: string;
  score: number;
};

export type UnifiedChartFvgRef = {
  top: number;
  bot: number;
  bias: 'bullish' | 'bearish';
  labelKo: string;
};

export type UnifiedChartTradeHints = {
  entryHint: number | null;
  slHint: number | null;
  tpHints: number[];
  invalidationKo: string | null;
};

export type UnifiedChartFeatureContext = {
  chips: UnifiedChartFeatureChip[];
  zoneScore: number;
  confirmScore: number;
  fvgScore: number;
  lineScore: number;
  trendScore: number;
  bandScore: number;
  compositeScore: number;
  summaryKo: string;
  nearestDemand: MergedKeyZone | null;
  nearestSupply: MergedKeyZone | null;
  lastConfirm: MergedDirectionConfirm | null;
  activeFvg: UnifiedChartFvgRef | null;
  trendKo: string | null;
  bandKo: string | null;
  tradeHints: UnifiedChartTradeHints;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parsePx(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function zoneMid(z: { top: number; bot: number; price?: number }): number {
  if (Number.isFinite(z.price) && (z.price ?? 0) > 0) return z.price!;
  return (z.top + z.bot) / 2;
}

function distPct(a: number, b: number): number {
  if (!a || !b) return Infinity;
  return (Math.abs(a - b) / a) * 100;
}

function nearestZone(
  zones: MergedKeyZone[],
  kind: 'demand' | 'supply',
  price: number
): MergedKeyZone | null {
  const filtered = zones.filter((z) => z.kind === kind);
  if (!filtered.length || !Number.isFinite(price)) return null;
  return filtered.reduce((best, z) => {
    const d = Math.abs(zoneMid(z) - price);
    const bd = best ? Math.abs(zoneMid(best) - price) : Infinity;
    return d < bd ? z : best;
  }, null as MergedKeyZone | null);
}

function detectNearestFvg(
  candles: Candle[],
  price: number,
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
): UnifiedChartFvgRef | null {
  if (candles.length < 4 || !Number.isFinite(price)) return null;
  const start = Math.max(0, candles.length - 120);
  const fvgs: UnifiedChartFvgRef[] = [];
  for (let i = Math.max(start + 2, 2); i < candles.length; i++) {
    const c0 = candles[i - 2]!;
    const c2 = candles[i]!;
    if (c2.low > c0.high) {
      fvgs.push({
        top: c2.low,
        bot: c0.high,
        bias: 'bullish',
        labelKo: '상승 FVG',
      });
    } else if (c2.high < c0.low) {
      fvgs.push({
        top: c0.low,
        bot: c2.high,
        bias: 'bearish',
        labelKo: '하락 FVG',
      });
    }
  }
  const recent = fvgs.slice(-4);
  if (!recent.length) return null;
  const prefer =
    direction === 'LONG'
      ? recent.filter((f) => f.bias === 'bullish')
      : direction === 'SHORT'
        ? recent.filter((f) => f.bias === 'bearish')
        : recent;
  const pool = prefer.length ? prefer : recent;
  return pool.reduce((best, f) => {
    const mid = (f.top + f.bot) / 2;
    const d = Math.abs(mid - price);
    const bd = best ? Math.abs((best.top + best.bot) / 2 - price) : Infinity;
    return d < bd ? f : best;
  }, null as UnifiedChartFvgRef | null);
}

function bounceTpHints(
  scenarios: MergedBounceScenario[],
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
): number[] {
  const dir = direction === 'LONG' ? 'up' : direction === 'SHORT' ? 'down' : null;
  const active = scenarios.filter((s) => s.active && (!dir || s.direction === dir));
  const sc = active[0] ?? scenarios.find((s) => s.active) ?? scenarios[0];
  if (!sc) return [];
  return sc.targets.filter((t) => !t.hit).map((t) => t.price).slice(0, 3);
}

function buildTradeHints(params: {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  price: number;
  demand: MergedKeyZone | null;
  supply: MergedKeyZone | null;
  fvg: UnifiedChartFvgRef | null;
  bounceTps: number[];
  tradeEntry?: number | null;
  tradeSl?: number | null;
  criticalZones: MergedCriticalZone[];
}): UnifiedChartTradeHints {
  const { direction, price, demand, supply, fvg, bounceTps, criticalZones } = params;
  let entryHint: number | null = params.tradeEntry ?? null;
  let slHint: number | null = params.tradeSl ?? null;
  let invalidationKo: string | null = null;

  if (direction === 'LONG') {
    if (demand) {
      const mid = zoneMid(demand);
      if (!entryHint || distPct(price, mid) < 1.2) entryHint = mid;
      const zoneSl = demand.bot * 0.999;
      slHint = slHint != null ? Math.max(slHint, zoneSl) : zoneSl;
      invalidationKo = `${demand.labelKo} 하단 ${demand.bot.toFixed(0)} 이탈 시 재검토`;
    }
    if (fvg?.bias === 'bullish') {
      const fvgSl = fvg.bot * 0.999;
      slHint = slHint != null ? Math.max(slHint, fvgSl) : fvgSl;
      invalidationKo = invalidationKo ?? `FVG ${fvg.bot.toFixed(0)} 이탈 시 재검토`;
    }
  } else if (direction === 'SHORT') {
    if (supply) {
      const mid = zoneMid(supply);
      if (!entryHint || distPct(price, mid) < 1.2) entryHint = mid;
      const zoneSl = supply.top * 1.001;
      slHint = slHint != null ? Math.min(slHint, zoneSl) : zoneSl;
      invalidationKo = `${supply.labelKo} 상단 ${supply.top.toFixed(0)} 이탈 시 재검토`;
    }
    if (fvg?.bias === 'bearish') {
      const fvgSl = fvg.top * 1.001;
      slHint = slHint != null ? Math.min(slHint, fvgSl) : fvgSl;
      invalidationKo = invalidationKo ?? `FVG ${fvg.top.toFixed(0)} 이탈 시 재검토`;
    }
  }

  const crit = criticalZones.find((z) =>
    direction === 'LONG'
      ? z.scenario === 'if_rally'
      : direction === 'SHORT'
        ? z.scenario === 'if_decline'
        : z.isPrimary
  );
  if (crit && direction === 'LONG' && slHint == null) slHint = crit.price * 0.998;
  if (crit && direction === 'SHORT' && slHint == null) slHint = crit.price * 1.002;

  const tpHints = bounceTps.length ? bounceTps : [];
  return { entryHint, slHint, tpHints, invalidationKo };
}

export function buildUnifiedChartFeatureContext(params: {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  currentPrice?: number | null;
  candles?: Candle[] | null;
  keyZones?: MergedKeyZone[] | null;
  directionConfirms?: MergedDirectionConfirm[] | null;
  criticalZones?: MergedCriticalZone[] | null;
  bounceScenarios?: MergedBounceScenario[] | null;
  smcLeading?: MergedSmcLeadingContext | null;
  vrvp?: MergedVrvpProfile | null;
  deskHud?: MergedAnalysisDeskHud | null;
  analysis?: AnalyzeResponse | null;
  tradeEntry?: number | null;
  tradeSl?: number | null;
  tradeTp1?: number | null;
}): UnifiedChartFeatureContext | null {
  const price = params.currentPrice ?? params.analysis?.currentPrice ?? null;
  if (!Number.isFinite(price) || !price) return null;

  const direction = params.direction;
  const keyZones = params.keyZones ?? [];
  const confirms = params.directionConfirms ?? [];
  const criticalZones = params.criticalZones ?? [];
  const bounceScenarios = params.bounceScenarios ?? [];
  const smc = params.smcLeading;
  const vrvp = params.vrvp;
  const candles = params.candles ?? [];

  const demand = nearestZone(keyZones, 'demand', price);
  const supply = nearestZone(keyZones, 'supply', price);
  const lastConfirm =
    confirms.find((c) => c.tier === 'confirmed') ??
    confirms.find((c) => c.tier === 'strong') ??
    confirms[confirms.length - 1] ??
    null;

  const cs = params.analysis?.confirmedSignal;
  const fvgFromAnalyze = cs?.fvgZone === true;
  const activeFvg =
    detectNearestFvg(candles, price, direction) ??
    (fvgFromAnalyze && params.analysis?.zoneBiasCard
      ? {
          top: params.analysis.zoneBiasCard.high ?? price,
          bot: params.analysis.zoneBiasCard.low ?? price,
          bias: (direction === 'SHORT' ? 'bearish' : 'bullish') as 'bullish' | 'bearish',
          labelKo: direction === 'SHORT' ? '하락 FVG·공급' : '상승 FVG·수요',
        }
      : null);

  const zoneAligned =
    direction === 'LONG'
      ? !!demand && price >= demand.bot * 0.995
      : direction === 'SHORT'
        ? !!supply && price <= supply.top * 1.005
        : !!(demand || supply);
  const zoneScore = clamp(
    (demand || supply ? 38 : 8) +
      (zoneAligned ? 28 : 10) +
      Math.min(24, keyZones.length * 4) +
      (criticalZones.length ? 10 : 0),
    0,
    100
  );

  const confirmAligned =
    !!lastConfirm &&
    (lastConfirm.direction === direction ||
      direction === 'NEUTRAL' ||
      lastConfirm.tier === 'building');
  const confirmScore = clamp(
    (lastConfirm ? (lastConfirm.tier === 'confirmed' ? 72 : lastConfirm.tier === 'strong' ? 58 : 40) : 12) +
      (confirmAligned ? 18 : 0) +
      (lastConfirm ? lastConfirm.gatesPassCount * 2 : 0) +
      (cs?.confirmed ? 10 : 0),
    0,
    100
  );

  const fvgAligned =
    !!activeFvg &&
    (direction === 'LONG'
      ? activeFvg.bias === 'bullish'
      : direction === 'SHORT'
        ? activeFvg.bias === 'bearish'
        : true);
  const fvgScore = clamp(
    (activeFvg ? 42 : fvgFromAnalyze ? 32 : 10) + (fvgAligned ? 32 : 8) + (cs?.fvgZone ? 16 : 0),
    0,
    100
  );

  const hasLines =
    (params.tradeEntry ?? 0) > 0 ||
    (params.tradeSl ?? 0) > 0 ||
    (params.tradeTp1 ?? 0) > 0 ||
    parseNum(params.analysis?.entry) != null;
  const lineScore = clamp(
    (hasLines ? 55 : 15) +
      ((params.tradeEntry ?? 0) > 0 && (params.tradeSl ?? 0) > 0 ? 30 : 0) +
      ((params.tradeTp1 ?? 0) > 0 ? 15 : 0),
    0,
    100
  );

  const trendKo = smc?.summaryKo ?? smc?.lastChoch?.tag ?? null;
  const trendAligned =
    !!smc?.active &&
    (direction === 'LONG'
      ? smc.legDirection === 'up' || smc.lastChoch?.bias === 'bullish'
      : direction === 'SHORT'
        ? smc.legDirection === 'down' || smc.lastChoch?.bias === 'bearish'
        : true);
  const trendScore = clamp(
    (smc?.active ? 40 : 12) +
      (trendAligned ? 28 : 8) +
      (bounceScenarios.some((s) => s.active) ? 18 : 0) +
      (smc?.lastChoch?.phase === 'confirmed' ? 14 : 0),
    0,
    100
  );

  const bandKo = params.deskHud?.stCloudKo ?? null;
  const inVa =
    vrvp?.vaLow != null &&
    vrvp.vaHigh != null &&
    price >= vrvp.vaLow &&
    price <= vrvp.vaHigh;
  const bandScore = clamp(
    (vrvp?.poc ? 28 : 10) + (inVa ? 32 : 14) + (bandKo ? 20 : 0) + (params.deskHud?.vrvpConfluenceKo ? 16 : 0),
    0,
    100
  );

  const bounceTps = bounceTpHints(bounceScenarios, direction);
  const tradeHints = buildTradeHints({
    direction,
    price,
    demand,
    supply,
    fvg: activeFvg,
    bounceTps,
    tradeEntry: params.tradeEntry,
    tradeSl: params.tradeSl,
    criticalZones,
  });

  const chips: UnifiedChartFeatureChip[] = [
    {
      key: 'zone',
      labelKo: 'ZONE',
      active: keyZones.length > 0 || criticalZones.length > 0,
      aligned: zoneAligned,
      detailKo: demand
        ? `${demand.labelKo} ${zoneMid(demand).toFixed(0)}`
        : supply
          ? `${supply.labelKo} ${zoneMid(supply).toFixed(0)}`
          : '—',
      score: Math.round(zoneScore),
    },
    {
      key: 'confirm',
      labelKo: '롱·숏 확정',
      active: !!lastConfirm || !!cs?.confirmed,
      aligned: confirmAligned,
      detailKo: lastConfirm?.labelKo ?? (cs?.confirmed ? 'AI 5게이트' : '—'),
      score: Math.round(confirmScore),
    },
    {
      key: 'fvg',
      labelKo: 'FVG',
      active: !!activeFvg || fvgFromAnalyze,
      aligned: fvgAligned,
      detailKo: activeFvg ? `${activeFvg.labelKo} ${activeFvg.bot.toFixed(0)}~${activeFvg.top.toFixed(0)}` : '—',
      score: Math.round(fvgScore),
    },
    {
      key: 'line',
      labelKo: 'LINE E/SL/TP',
      active: hasLines,
      aligned: hasLines && (params.tradeSl ?? 0) > 0,
      detailKo: hasLines
        ? `E ${(params.tradeEntry ?? parseNum(params.analysis?.entry) ?? 0).toFixed(0)}`
        : '대기',
      score: Math.round(lineScore),
    },
    {
      key: 'trend',
      labelKo: '추세·구조',
      active: !!smc?.active || bounceScenarios.length > 0,
      aligned: trendAligned,
      detailKo: trendKo?.slice(0, 28) ?? '—',
      score: Math.round(trendScore),
    },
    {
      key: 'band',
      labelKo: '밴드·VRVP',
      active: !!(vrvp?.poc || bandKo),
      aligned: inVa || !!params.deskHud?.mtfAligned,
      detailKo: vrvp?.poc ? `POC ${vrvp.poc.toFixed(0)}${inVa ? ' · VA내' : ''}` : bandKo?.slice(0, 24) ?? '—',
      score: Math.round(bandScore),
    },
  ];

  const compositeScore = Math.round(
    chips.reduce((s, c) => s + c.score, 0) / Math.max(chips.length, 1)
  );

  const alignedCount = chips.filter((c) => c.active && c.aligned).length;
  const activeCount = chips.filter((c) => c.active).length;
  const summaryKo = `차트 ${activeCount}/6 · 정렬 ${alignedCount} · zone·확정·FVG·line·추세·밴드`;

  return {
    chips,
    zoneScore,
    confirmScore,
    fvgScore,
    lineScore,
    trendScore,
    bandScore,
    compositeScore,
    summaryKo,
    nearestDemand: demand,
    nearestSupply: supply,
    lastConfirm,
    activeFvg,
    trendKo,
    bandKo,
    tradeHints,
  };
}

function parseNum(v: unknown): number | null {
  return parsePx(v);
}

export type MergedDeskChartFeatureInput = {
  keyZones?: MergedKeyZone[] | null;
  directionConfirms?: MergedDirectionConfirm[] | null;
  criticalZones?: MergedCriticalZone[] | null;
  bounceScenarios?: MergedBounceScenario[] | null;
  smcLeading?: MergedSmcLeadingContext | null;
  vrvp?: MergedVrvpProfile | null;
};
