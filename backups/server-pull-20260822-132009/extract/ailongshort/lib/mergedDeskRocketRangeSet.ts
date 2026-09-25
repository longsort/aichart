/**
 * 로켓(🚀)/하락(📉) 신호 — 상승·하락 가능 세트.
 * 전폭 가격선(E·무효·T1·T2·Tmax) + 신호봉→우측+20 가능존.
 * 확정 경로·승률 아님. 한 봉 1방향.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { buildMergedDeskStructureRocketsForChart } from '@/lib/mergedAnalysisDeskMarkers';
import { mergedDeskRocketAnchorPrice } from '@/lib/mergedDeskRocketAnchor';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';

export type MergedDeskRocketRangeSet = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
};

function atr14(candles: Candle[], end: number): number {
  const start = Math.max(1, end - 13);
  let s = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    s += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n += 1;
  }
  return n > 0 ? s / n : Math.abs(candles[end]?.close ?? 1) * 0.008;
}

function barIndexAt(candles: Candle[], t: number): number {
  let best = candles.length - 1;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i]!.time) - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pickNear(base: number, minGap: number, dir: 1 | -1, cands: number[]): number {
  const ok = cands.filter((p) => Number.isFinite(p) && (dir === 1 ? p > base + minGap : p < base - minGap));
  if (!ok.length) return base + dir * minGap * 3;
  ok.sort((a, b) => Math.abs(a - (base + dir * minGap * 4)) - Math.abs(b - (base + dir * minGap * 4)));
  return ok[0]!;
}

function uniqSorted(prices: number[], minGap: number, asc: boolean): number[] {
  const sorted = [...prices].filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => (asc ? a - b : b - a));
  const out: number[] = [];
  for (const p of sorted) {
    if (out.some((x) => Math.abs(x - p) < minGap)) continue;
    out.push(p);
  }
  return out;
}

export function buildMergedDeskRocketRangeSet(params: {
  candles: Candle[];
  timeframe: string;
  structureRockets?: ReadonlyArray<{ time?: number; direction?: 'LONG' | 'SHORT' }> | null;
  bounceScenarios?: MergedBounceScenario[] | null;
  geoms?: MergedDeskChannelGeom[] | null;
  hotBelow?: MergedDeskHotZoneEntry | null;
  hotAbove?: MergedDeskHotZoneEntry | null;
  analysis?: AnalyzeResponse | null;
}): MergedDeskRocketRangeSet {
  const empty: MergedDeskRocketRangeSet = { overlays: [], priceLines: [], summaryKo: '' };
  const tf = normalizeChartTimeframe(params.timeframe);
  const candles = mergedWorkCandles(params.candles, tf);
  const n = candles.length;
  if (n < 12) return empty;

  const srcCandles =
    Array.isArray((params.analysis as { candles?: Candle[] } | null | undefined)?.candles) &&
    ((params.analysis as { candles?: Candle[] }).candles?.length ?? 0) >= 8
      ? ((params.analysis as { candles?: Candle[] }).candles as Candle[])
      : candles;
  const rockets = buildMergedDeskStructureRocketsForChart({
    structureRockets: params.structureRockets ?? [],
    chartCandles: candles,
    sourceCandles: srcCandles,
    timeframe: tf,
  });
  if (!rockets.length) return empty;

  const winFrom = Number(candles[Math.max(0, n - 80)]!.time);
  const latest = [...rockets].filter((r) => r.time >= winFrom).sort((a, b) => a.time - b.time).pop();
  if (!latest) return empty;

  const idx = barIndexAt(candles, latest.time);
  const bar = candles[idx]!;
  const dir = latest.direction;
  const isLong = dir === 'LONG';
  const e = mergedDeskRocketAnchorPrice(bar, dir);
  if (!(e > 0)) return empty;

  const atr = atr14(candles, n - 1);
  const minGap = Math.max(atr * 0.22, e * 0.0012);
  const inv = isLong ? e - Math.max(atr * 0.18, e * 0.0009) : e + Math.max(atr * 0.18, e * 0.0009);

  const g = params.geoms?.find((x) => x.primary) ?? params.geoms?.[0] ?? null;
  const bounce = (params.bounceScenarios ?? []).find(
    (s) => s.direction === (isLong ? 'up' : 'down') && (s.active || s.targets?.length)
  );
  const bouncePx = (lab: 'T1' | 'T2' | 'Tmax') =>
    bounce?.targets?.find((t) => t.label === lab)?.price ?? NaN;

  let lookHi = -Infinity;
  let lookLo = Infinity;
  const from = Math.max(0, idx - 36);
  for (let i = from; i < n; i++) {
    lookHi = Math.max(lookHi, Number(candles[i]!.high));
    lookLo = Math.min(lookLo, Number(candles[i]!.low));
  }

  let t1: number;
  let t2: number;
  let tmax: number;
  if (isLong) {
    const cands1 = [bouncePx('T1'), params.hotAbove?.bot, params.hotAbove?.mid, g?.tipMid, params.analysis?.resistanceLevel?.price];
    const cands2 = [bouncePx('T2'), g?.tipUpper, params.hotAbove?.top, params.analysis?.resistanceLevel?.price];
    const candsM = [bouncePx('Tmax'), lookHi, g?.tipUpper];
    t1 = pickNear(e, minGap, 1, cands1.filter((x): x is number => Number.isFinite(x) && x > 0));
    t2 = pickNear(e, minGap * 2, 1, cands2.filter((x): x is number => Number.isFinite(x) && x > 0));
    tmax = pickNear(e, minGap * 3, 1, candsM.filter((x): x is number => Number.isFinite(x) && x > 0));
    const ordered = uniqSorted([t1, t2, tmax], minGap * 0.7, true);
    t1 = ordered[0] ?? e + minGap * 3;
    t2 = ordered[1] ?? t1 + minGap * 2;
    tmax = ordered[2] ?? Math.max(lookHi, t2 + minGap * 2);
    if (tmax < t2) tmax = t2 + minGap;
    if (t2 < t1) t2 = t1 + minGap;
  } else {
    const cands1 = [bouncePx('T1'), params.hotBelow?.top, params.hotBelow?.mid, g?.tipMid, params.analysis?.supportLevel?.price];
    const cands2 = [bouncePx('T2'), g?.tipLower, params.hotBelow?.bot, params.analysis?.supportLevel?.price];
    const candsM = [bouncePx('Tmax'), lookLo, g?.tipLower];
    t1 = pickNear(e, minGap, -1, cands1.filter((x): x is number => Number.isFinite(x) && x > 0));
    t2 = pickNear(e, minGap * 2, -1, cands2.filter((x): x is number => Number.isFinite(x) && x > 0));
    tmax = pickNear(e, minGap * 3, -1, candsM.filter((x): x is number => Number.isFinite(x) && x > 0));
    const ordered = uniqSorted([t1, t2, tmax], minGap * 0.7, false);
    t1 = ordered[0] ?? e - minGap * 3;
    t2 = ordered[1] ?? t1 - minGap * 2;
    tmax = ordered[2] ?? Math.min(lookLo, t2 - minGap * 2);
    if (tmax > t2) tmax = t2 - minGap;
    if (t2 > t1) t2 = t1 - minGap;
  }

  const tForm = Number(bar.time);
  const t2z = mergedDeskRbFutureTime2(candles, Number(candles[n - 1]!.time), n - 1, MERGED_DESK_RIGHT_FUTURE_BARS);
  const zoneLo = isLong ? e : t2;
  const zoneHi = isLong ? t2 : e;
  const conf =
    (g && ((isLong && Math.abs(t1 - g.tipUpper) < atr * 0.55) || (!isLong && Math.abs(t1 - g.tipLower) < atr * 0.55))) ||
    (isLong && params.hotAbove && Math.abs(t1 - params.hotAbove.mid) < atr * 0.55) ||
    (!isLong && params.hotBelow && Math.abs(t1 - params.hotBelow.mid) < atr * 0.55);

  const sideKo = isLong ? '롱' : '숏';
  const faceBase = isLong ? '상승가능' : '하락가능';
  const overlays: OverlayItem[] = [
    {
      id: `merged-desk-rocket-range-zone-${dir}-${tForm}`,
      kind: isLong ? 'demandZone' : 'supplyZone',
      category: 'chartPrimeTrendChannels',
      label: isLong ? '🚀세트 · T1~T2' : '📉세트 · T1~T2',
      zoneFaceBase: isLong ? '🚀세트' : '📉세트',
      zoneFaceSignal: 'T1~T2',
      zoneFaceDetailKo: [
        `로켓 ${sideKo} 가능 세트`,
        `E ${e.toFixed(e >= 100 ? 0 : 1)} → T2 ${t2.toFixed(t2 >= 100 ? 0 : 1)} · Tmax ${tmax.toFixed(tmax >= 100 ? 0 : 1)}`,
        '조건부 참고 · 확정·승률 아님',
      ].join('\n'),
      zoneFaceLang: 'ko',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tForm as UTCTimestamp,
      time2: t2z as UTCTimestamp,
      price1: zoneHi,
      price2: zoneLo,
      confidence: 82,
      color: isLong ? 'rgba(74,222,128,0.16)' : 'rgba(248,113,113,0.16)',
      zoneFillPreserve: true,
      zoneSpanOnly: false,
      structureBias: isLong ? 'bullish' : 'bearish',
      overlayZoneExtraClass: [
        'merged-desk-rocket-range-zone',
        isLong ? 'merged-desk-rocket-range--long' : 'merged-desk-rocket-range--short',
        conf ? 'merged-desk-rocket-range--confluence' : '',
        'merged-desk-rb-channel-keep',
      ]
        .filter(Boolean)
        .join(' '),
      labelTooltip: `로켓 ${sideKo} 가능존 · 무효 ${inv.toFixed(inv >= 100 ? 0 : 1)} · 확정 아님`,
      labelBackgroundColor: isLong ? 'rgba(20,83,45,0.94)' : 'rgba(127,29,29,0.94)',
      labelTextColor: '#f8fafc',
      noProject: true,
    },
  ];

  const line = (
    price: number,
    title: string,
    color: string,
    style: AtlasPulsePriceLine['lineStyle'],
    width: AtlasPulsePriceLine['lineWidth']
  ): AtlasPulsePriceLine => ({
    price,
    title,
    color,
    lineStyle: style,
    lineWidth: width,
    axisLabel: true,
  });

  const priceLines: AtlasPulsePriceLine[] = isLong
    ? [
        line(inv, '🚀무효', 'rgba(148,163,184,0.85)', 'dashed', 1),
        line(e, '🚀E', '#4ADE80', 'solid', 2),
        line(t1, '🚀T1', '#86EFAC', 'solid', 2),
        line(t2, '🚀T2', '#2DD4BF', 'solid', 2),
        line(tmax, '🚀Tmax', '#A7F3D0', 'dotted', 2),
      ]
    : [
        line(inv, '📉무효', 'rgba(148,163,184,0.85)', 'dashed', 1),
        line(e, '📉E', '#FB923C', 'solid', 2),
        line(t1, '📉T1', '#F87171', 'solid', 2),
        line(t2, '📉T2', '#FB7185', 'solid', 2),
        line(tmax, '📉Tmax', '#FECACA', 'dotted', 2),
      ];

  return {
    overlays,
    priceLines,
    summaryKo: `로켓${sideKo} 가능 · T1 ${t1.toFixed(t1 >= 100 ? 0 : 1)} · Tmax ${tmax.toFixed(tmax >= 100 ? 0 : 1)}`,
  };
}
