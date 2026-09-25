/**
 * 통합·분석 — 지지(저항) 후 반등(되돌림) 목표 구간.
 * "지지 후 어디까지 반등할 수 있는지" — 피보·스윙·VRVP·저항 합류, 조건부 참고.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import {
  mergedDeskAnalysisZoneTimes,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
} from '@/lib/mergedAnalysisOverlayTimes';
import { mergedDevelopingBar } from '@/lib/mergedAnalysisLeadingBar';

export type MergedBounceDirection = 'up' | 'down';

export type MergedBounceTarget = {
  id: string;
  label: 'T1' | 'T2' | 'T3' | 'Tmax';
  price: number;
  pctFromAnchor: number;
  sourceKo: string;
  hit: boolean;
};

export type MergedBounceScenario = {
  id: string;
  direction: MergedBounceDirection;
  anchorPrice: number;
  anchorTop: number;
  anchorBot: number;
  anchorTime: number;
  legHigh: number;
  legLow: number;
  currentPrice: number;
  progressPct: number;
  targets: MergedBounceTarget[];
  labelKo: string;
  summaryKo: string;
  statusKo: string;
  active: boolean;
};

function sourceCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedWorkCandles(candles, timeframe);
}

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(0);
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
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

function findSwingHighBefore(candles: Candle[], endIdx: number, lookback: number): number {
  let hi = -Infinity;
  const start = Math.max(0, endIdx - lookback);
  for (let i = start; i <= endIdx; i++) hi = Math.max(hi, candles[i]!.high);
  return Number.isFinite(hi) ? hi : candles[endIdx]?.high ?? 0;
}

function findSwingLowBefore(candles: Candle[], endIdx: number, lookback: number): number {
  let lo = Infinity;
  const start = Math.max(0, endIdx - lookback);
  for (let i = start; i <= endIdx; i++) lo = Math.min(lo, candles[i]!.low);
  return Number.isFinite(lo) ? lo : candles[endIdx]?.low ?? 0;
}

function nearestSwingHighAbove(candles: Candle[], fromIdx: number, minPrice: number, maxPrice: number): number | null {
  let best: number | null = null;
  for (let i = fromIdx; i < candles.length; i++) {
    const h = candles[i]!.high;
    if (h > minPrice && h <= maxPrice) {
      if (best == null || h < best) best = h;
    }
  }
  return best;
}

type AnchorPick = {
  direction: MergedBounceDirection;
  price: number;
  top: number;
  bot: number;
  time: number;
  labelKo: string;
};

function pickBounceAnchor(params: {
  candles: Candle[];
  timeframe: string;
  close: number;
  atr: number;
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  smcLeading?: MergedSmcLeadingContext | null;
}): AnchorPick | null {
  const { candles, timeframe, close, atr, keyZones, criticalZones, smcLeading } = params;
  const tf = normalizeChartTimeframe(timeframe);
  const n = candles.length;
  const tol = atr * (tf === '1d' || tf === '1w' || tf === '1M' ? 1.2 : 0.85);

  const hint = smcLeading?.bounceHint;
  if (smcLeading?.active && hint) {
    if (hint.direction === 'up' && close >= hint.anchorBot - tol) {
      return {
        direction: 'up',
        price: hint.anchorPrice,
        top: hint.anchorTop,
        bot: hint.anchorBot,
        time: hint.anchorTime,
        labelKo: 'CHoCH·반등',
      };
    }
    if (hint.direction === 'down' && close <= hint.anchorTop + tol) {
      return {
        direction: 'down',
        price: hint.anchorPrice,
        top: hint.anchorTop,
        bot: hint.anchorBot,
        time: hint.anchorTime,
        labelKo: 'CHoCH·되돌림',
      };
    }
  }

  const last = candles[n - 1];
  if (last) {
    const dev = mergedDevelopingBar(last);
    const tail = 55; // 4h 참조 — 전 TF 동일
    let minLow = Infinity;
    let minIdx = Math.max(0, n - 2);
    for (let i = Math.max(0, n - tail); i < n - 1; i++) {
      if (candles[i]!.low < minLow) {
        minLow = candles[i]!.low;
        minIdx = i;
      }
    }
    if (Number.isFinite(minLow) && dev.low <= minLow + atr * 0.35 && close >= minLow - tol) {
      return {
        direction: 'up',
        price: minLow,
        top: minLow + atr * 0.5,
        bot: minLow - atr * 0.25,
        time: Number(candles[minIdx]!.time),
        labelKo: '선행저점·반등',
      };
    }
    let maxHigh = -Infinity;
    let maxIdx = Math.max(0, n - 2);
    for (let i = Math.max(0, n - tail); i < n - 1; i++) {
      if (candles[i]!.high > maxHigh) {
        maxHigh = candles[i]!.high;
        maxIdx = i;
      }
    }
    if (Number.isFinite(maxHigh) && dev.high >= maxHigh - atr * 0.35 && close <= maxHigh + tol) {
      return {
        direction: 'down',
        price: maxHigh,
        top: maxHigh + atr * 0.25,
        bot: maxHigh - atr * 0.5,
        time: Number(candles[maxIdx]!.time),
        labelKo: '선행고점·되돌림',
      };
    }
  }

  const demandPatterns = new Set(['decline_bounce', 'support_bounce', 'double_support']);
  const supplyPatterns = new Set(['rally_reject', 'resist_reject', 'double_resist']);

  for (const z of keyZones) {
    if (z.kind === 'demand' && demandPatterns.has(z.pattern)) {
      if (close >= z.bot - tol && close <= z.top + atr * 2.5) {
        return {
          direction: 'up',
          price: z.price,
          top: z.top,
          bot: z.bot,
          time: z.time2,
          labelKo: z.labelKo,
        };
      }
    }
    if (z.kind === 'supply' && supplyPatterns.has(z.pattern)) {
      if (close <= z.top + tol && close >= z.bot - atr * 2.5) {
        return {
          direction: 'down',
          price: z.price,
          top: z.top,
          bot: z.bot,
          time: z.time2,
          labelKo: z.labelKo,
        };
      }
    }
  }

  for (const z of criticalZones) {
    if (z.scenario === 'if_decline' && close >= z.bot - tol && close <= z.top + atr * 2) {
      return {
        direction: 'up',
        price: z.price,
        top: z.top,
        bot: z.bot,
        time: z.time1,
        labelKo: '선행지지',
      };
    }
    if (z.scenario === 'if_rally' && close <= z.top + tol && close >= z.bot - atr * 2) {
      return {
        direction: 'down',
        price: z.price,
        top: z.top,
        bot: z.bot,
        time: z.time1,
        labelKo: '선행저항',
      };
    }
  }

  const tail = 55; // 4h 참조 — 전 TF 동일
  const start = Math.max(5, n - tail);
  let minIdx = start;
  let minLow = Infinity;
  for (let i = start; i < n; i++) {
    if (candles[i]!.low < minLow) {
      minLow = candles[i]!.low;
      minIdx = i;
    }
  }
  if (Number.isFinite(minLow) && minIdx < n - 1 && close > minLow && close - minLow <= atr * 4) {
    let bounced = false;
    for (let j = minIdx; j < n; j++) {
      if (candles[j]!.close > minLow + atr * 0.35) bounced = true;
    }
    if (bounced) {
      return {
        direction: 'up',
        price: minLow,
        top: minLow + atr * 0.45,
        bot: minLow - atr * 0.25,
        time: Number(candles[minIdx]!.time),
        labelKo: '최근저점반등',
      };
    }
  }

  let maxIdx = start;
  let maxHigh = -Infinity;
  for (let i = start; i < n - 1; i++) {
    if (candles[i]!.high > maxHigh) {
      maxHigh = candles[i]!.high;
      maxIdx = i;
    }
  }
  if (Number.isFinite(maxHigh) && maxIdx < n - 1 && close < maxHigh && maxHigh - close <= atr * 4) {
    let dropped = false;
    for (let j = maxIdx; j < n; j++) {
      if (candles[j]!.close < maxHigh - atr * 0.35) dropped = true;
    }
    if (dropped) {
      return {
        direction: 'down',
        price: maxHigh,
        top: maxHigh + atr * 0.25,
        bot: maxHigh - atr * 0.45,
        time: Number(candles[maxIdx]!.time),
        labelKo: '최근고점되돌림',
      };
    }
  }

  return null;
}

function buildUpTargets(params: {
  anchor: AnchorPick;
  legHigh: number;
  legLow: number;
  close: number;
  candles: Candle[];
  anchorIdx: number;
  vrvp: MergedVrvpProfile | null;
  analysis: AnalyzeResponse | null | undefined;
  bundle: MonthDeskStrikeDeskBundle | null | undefined;
}): MergedBounceTarget[] {
  const { anchor, legHigh, legLow, close, candles, anchorIdx, vrvp, analysis, bundle } = params;
  const range = Math.max(legHigh - legLow, (anchor.top - anchor.bot) * 2);
  const fib382 = anchor.price + range * 0.382;
  const fib500 = anchor.price + range * 0.5;
  const fib618 = anchor.price + range * 0.618;
  const tMax = legHigh;

  const swingT1 = nearestSwingHighAbove(candles, anchorIdx, anchor.price + range * 0.12, legHigh);
  const resist = analysis?.resistanceLevel?.price;
  const vah = vrvp?.vaHigh;
  const poc = vrvp?.poc;
  const shortTp1 = bundle?.short?.tp1;

  const pick = (fallback: number, ...candidates: (number | null | undefined)[]): number => {
    const valid = candidates.filter((x): x is number => x != null && Number.isFinite(x) && x > anchor.price);
    if (!valid.length) return fallback;
    valid.sort((a, b) => Math.abs(a - fallback) - Math.abs(b - fallback));
    return valid[0]!;
  };

  const t1Price = pick(fib382, swingT1, poc && poc > anchor.price ? poc : null);
  const t2Price = pick(fib500, vah, shortTp1);
  const t3Price = pick(fib618, resist, legHigh * 0.98);

  const mk = (label: MergedBounceTarget['label'], price: number, src: string): MergedBounceTarget => ({
    id: `merged-ares-bounce-up-${label}-${Math.round(price)}`,
    label,
    price,
    pctFromAnchor: ((price - anchor.price) / Math.max(anchor.price, 1e-9)) * 100,
    sourceKo: src,
    hit: close >= price,
  });

  return [
    mk('T1', t1Price, '0.382·스윙'),
    mk('T2', t2Price, '0.5·VRVP'),
    mk('T3', t3Price, '0.618·저항'),
    mk('Tmax', tMax, '전고점'),
  ].sort((a, b) => a.price - b.price);
}

function buildDownTargets(params: {
  anchor: AnchorPick;
  legHigh: number;
  legLow: number;
  close: number;
  analysis: AnalyzeResponse | null | undefined;
  bundle: MonthDeskStrikeDeskBundle | null | undefined;
  vrvp: MergedVrvpProfile | null;
}): MergedBounceTarget[] {
  const { anchor, legHigh, legLow, close, analysis, bundle, vrvp } = params;
  const range = Math.max(legHigh - legLow, (anchor.top - anchor.bot) * 2);
  const fib382 = anchor.price - range * 0.382;
  const fib500 = anchor.price - range * 0.5;
  const fib618 = anchor.price - range * 0.618;
  const tMax = legLow;

  const support = analysis?.supportLevel?.price;
  const val = vrvp?.vaLow;
  const longTp1 = bundle?.long?.tp1;

  const pick = (fallback: number, ...candidates: (number | null | undefined)[]): number => {
    const valid = candidates.filter((x): x is number => x != null && Number.isFinite(x) && x < anchor.price);
    if (!valid.length) return fallback;
    valid.sort((a, b) => Math.abs(a - fallback) - Math.abs(b - fallback));
    return valid[0]!;
  };

  const t1Price = pick(fib382, val, longTp1);
  const t2Price = pick(fib500, support);
  const t3Price = pick(fib618, legLow * 1.02);

  const mk = (label: MergedBounceTarget['label'], price: number, src: string): MergedBounceTarget => ({
    id: `merged-ares-bounce-down-${label}-${Math.round(price)}`,
    label,
    price,
    pctFromAnchor: ((anchor.price - price) / Math.max(anchor.price, 1e-9)) * 100,
    sourceKo: src,
    hit: close <= price,
  });

  return [
    mk('T1', t1Price, '0.382·VRVP'),
    mk('T2', t2Price, '0.5·지지'),
    mk('T3', t3Price, '0.618·전저'),
    mk('Tmax', tMax, '전저점'),
  ].sort((a, b) => b.price - a.price);
}

export function detectMergedBounceScenarios(params: {
  candles: Candle[];
  timeframe: string;
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  vrvp?: MergedVrvpProfile | null;
  analysis?: AnalyzeResponse | null;
  bundle?: MonthDeskStrikeDeskBundle | null;
  smcLeading?: MergedSmcLeadingContext | null;
}): MergedBounceScenario[] {
  const { candles, timeframe, keyZones, criticalZones, vrvp, analysis, bundle, smcLeading } = params;
  const source = sourceCandles(candles, timeframe);
  if (source.length < 20) return [];

  const n = source.length;
  const close = source[n - 1]!.close;
  const atr = estimateAtr(source, n - 1);
  const lookback = normalizeChartTimeframe(timeframe) === '1d' ? 90 : 60;

  const anchor = pickBounceAnchor({
    candles: source,
    timeframe,
    close,
    atr,
    keyZones,
    criticalZones,
    smcLeading,
  });
  if (!anchor) return [];

  let anchorIdx = n - 1;
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(source[i]!.low - anchor.price) <= atr * 0.6 || Math.abs(source[i]!.high - anchor.price) <= atr * 0.6) {
      anchorIdx = i;
      break;
    }
  }

  if (anchor.direction === 'up') {
    const legLow = anchor.price;
    const legHigh =
      smcLeading?.bounceHint?.direction === 'up'
        ? smcLeading.bounceHint.legHigh
        : findSwingHighBefore(source, Math.max(0, anchorIdx - 1), lookback);
    if (!(legHigh > legLow + atr * 0.4)) return [];

    const smcHint = smcLeading?.bounceHint?.direction === 'up' ? smcLeading.bounceHint : null;
    const targets = smcHint
      ? [
          {
            id: `merged-ares-bounce-up-T1-${Math.round(smcHint.t1)}`,
            label: 'T1' as const,
            price: smcHint.t1,
            pctFromAnchor: ((smcHint.t1 - legLow) / Math.max(legLow, 1e-9)) * 100,
            sourceKo: 'CHoCH돌파',
            hit: close >= smcHint.t1,
          },
          {
            id: `merged-ares-bounce-up-T2-${Math.round(smcHint.t2)}`,
            label: 'T2' as const,
            price: smcHint.t2,
            pctFromAnchor: ((smcHint.t2 - legLow) / Math.max(legLow, 1e-9)) * 100,
            sourceKo: smcHint.bosCount >= 4 ? 'OB·얕은반등' : 'OB·중간반등',
            hit: close >= smcHint.t2,
          },
          {
            id: `merged-ares-bounce-up-T3-${Math.round(smcHint.tmax * 0.92)}`,
            label: 'T3' as const,
            price: smcHint.tmax * 0.92,
            pctFromAnchor: ((smcHint.tmax * 0.92 - legLow) / Math.max(legLow, 1e-9)) * 100,
            sourceKo: '구조',
            hit: close >= smcHint.tmax * 0.92,
          },
          {
            id: `merged-ares-bounce-up-Tmax-${Math.round(smcHint.tmax)}`,
            label: 'Tmax' as const,
            price: smcHint.tmax,
            pctFromAnchor: ((smcHint.tmax - legLow) / Math.max(legLow, 1e-9)) * 100,
            sourceKo: smcHint.bosCount <= 1 ? '깊은반등' : 'BOS연동',
            hit: close >= smcHint.tmax,
          },
        ]
      : buildUpTargets({
          anchor,
          legHigh,
          legLow,
          close,
          candles: source,
          anchorIdx,
          vrvp: vrvp ?? null,
          analysis,
          bundle,
        });
    const next = targets.find((t) => !t.hit) ?? targets[targets.length - 1]!;
    const progressPct = Math.min(100, Math.max(0, ((close - legLow) / Math.max(legHigh - legLow, 1e-9)) * 100));
    const hitCount = targets.filter((t) => t.hit).length;

    return [
      {
        id: `merged-ares-bounce-up-${Math.round(legLow)}`,
        direction: 'up',
        anchorPrice: legLow,
        anchorTop: anchor.top,
        anchorBot: anchor.bot,
        anchorTime: anchor.time,
        legHigh,
        legLow,
        currentPrice: close,
        progressPct,
        targets,
        labelKo: `${anchor.labelKo} · 반등목표`,
        summaryKo: targets.map((t) => `${t.label} ${fmtPx(t.price)}${t.hit ? '✓' : ''}`).join(' · '),
        statusKo: smcHint
          ? `${smcHint.strengthKo} · 다음 ${next.label} ${fmtPx(next.price)} · ${hitCount}/${targets.length} 도달`
          : `지지 ${fmtPx(legLow)} → 다음 ${next.label} ${fmtPx(next.price)} (${next.sourceKo}) · ${hitCount}/${targets.length} 도달`,
        active: close >= anchor.bot - atr * 0.3,
      },
    ];
  }

  const legHigh = anchor.price;
  const legLow = findSwingLowBefore(source, Math.max(0, anchorIdx - 1), lookback);
  if (!(legHigh > legLow + atr * 0.4)) return [];

  const targets = buildDownTargets({
    anchor,
    legHigh,
    legLow,
    close,
    analysis,
    bundle,
    vrvp: vrvp ?? null,
  });
  const next = targets.find((t) => !t.hit) ?? targets[targets.length - 1]!;
  const progressPct = Math.min(100, Math.max(0, ((legHigh - close) / Math.max(legHigh - legLow, 1e-9)) * 100));
  const hitCount = targets.filter((t) => t.hit).length;

  return [
    {
      id: `merged-ares-bounce-down-${Math.round(legHigh)}`,
      direction: 'down',
      anchorPrice: legHigh,
      anchorTop: anchor.top,
      anchorBot: anchor.bot,
      anchorTime: anchor.time,
      legHigh,
      legLow,
      currentPrice: close,
      progressPct,
      targets,
      labelKo: `${anchor.labelKo} · 되돌림목표`,
      summaryKo: targets.map((t) => `${t.label} ${fmtPx(t.price)}${t.hit ? '✓' : ''}`).join(' · '),
      statusKo: `저항 ${fmtPx(legHigh)} → 다음 ${next.label} ${fmtPx(next.price)} (${next.sourceKo}) · ${hitCount}/${targets.length} 도달`,
      active: close <= anchor.top + atr * 0.3,
    },
  ];
}

function mergedBounceOverlayTimes(
  candles: Candle[],
  timeframe: string,
  scenario?: MergedBounceScenario | null
): { t1: UTCTimestamp; t2: UTCTimestamp } {
  const tf = normalizeChartTimeframe(timeframe);
  const work = mergedWorkCandles(candles, tf);
  if (scenario) {
    return mergedDeskAnalysisZoneTimes(work, tf, {
      anchorTime: scenario.anchorTime,
      legHigh: scenario.legHigh,
      legLow: scenario.legLow,
      direction: scenario.direction,
    });
  }
  return mergedDeskAnalysisZoneTimes(work, tf, null);
}

export function buildMergedBounceTargetOverlays(
  candles: Candle[],
  scenarios: MergedBounceScenario[],
  timeframe?: string
): OverlayItem[] {
  if (!scenarios.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const work = mergedWorkCandles(candles, tf);
  const out: OverlayItem[] = [];

  for (const sc of scenarios) {
    if (!sc.active) continue;
    const { t1, t2 } = mergedBounceOverlayTimes(work, tf, sc);
    const up = sc.direction === 'up';
    for (const t of sc.targets) {
      out.push({
        id: t.id,
        kind: 'keyLevel',
        label: `${t.label} ${fmtPx(t.price)}`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: t2,
        price1: t.price,
        price2: t.price,
        confidence: t.hit ? 78 : t.label === 'Tmax' ? 92 : 88,
        color: up
          ? t.hit
            ? '#34d399'
            : t.label === 'Tmax'
              ? '#22c55e'
              : '#2dd4bf'
          : t.hit
            ? '#f87171'
            : t.label === 'Tmax'
              ? '#ef4444'
              : '#fb923c',
        category: 'structure',
        lineDash: t.label === 'Tmax' ? '4 4' : '10 6',
        lineStrokeWidth: t.label === 'Tmax' ? 2.2 : t.label === 'T1' ? 2 : 1.5,
        overlayZoneExtraClass: [
          'merged-ares-bounce-line',
          up ? 'merged-ares-bounce-line--up' : 'merged-ares-bounce-line--down',
          t.hit ? 'merged-ares-bounce-line--hit' : '',
          `merged-ares-bounce-line--${t.label.toLowerCase()}`,
        ]
          .filter(Boolean)
          .join(' '),
        labelTooltip: `${t.label} ${fmtPx(t.price)}${t.hit ? ' ✓' : ''} · ${t.sourceKo}`,
      });
    }

    out.push({
      id: `${sc.id}-path-band`,
      kind: up ? 'demandZone' : 'supplyZone',
      label: sc.labelKo,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: up ? sc.legHigh : sc.anchorTop,
      price2: up ? sc.anchorBot : sc.legLow,
      confidence: 72,
      color: up ? 'rgba(45,212,191,0.08)' : 'rgba(251,146,60,0.08)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-bounce-path',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        up ? 'merged-ares-bounce-path--up' : 'merged-ares-bounce-path--down',
      ].join(' '),
      labelTooltip: `${sc.statusKo} · 조건부 참고`,
    });
  }

  return out;
}

export function summarizeMergedBounceScenariosKo(scenarios: MergedBounceScenario[]): string {
  const sc = scenarios.find((s) => s.active) ?? scenarios[0];
  if (!sc) return '반등·되돌림 목표 — 지지/저항 반응 대기';
  return sc.statusKo;
}

export function summarizeMergedBounceTargetsDetailKo(scenarios: MergedBounceScenario[]): string {
  const sc = scenarios.find((s) => s.active) ?? scenarios[0];
  if (!sc) return '—';
  const dir = sc.direction === 'up' ? '반등' : '되돌림';
  return `${dir} ${Math.round(sc.progressPct)}% · ${sc.summaryKo}`;
}
