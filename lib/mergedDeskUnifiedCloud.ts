/**
 * 통합구름 칩 — ChartPrime 트렌드 채널과 동일 기하.
 * 위=빨강 저항 밴드 · 아래=초록 지지 밴드 · 흰=경로 (참고·비보장).
 * SMC 작도와 무관 — 칩 ON일 때만 주입.
 * 미래 time/고스트 캔들 미사용 → 타임스케일 밀림(좌측 밀림) 방지.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import {
  computeChartPrimeTrendChannelOverlays,
  computeSuggestedChartPrimePivotLength,
} from '@/lib/chartPrimeTrendChannels';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';

const CP_CLOUD_ID_PREFIX = 'merged-cp-cloud';
const TOP_HEX = '#EF4444';
const BOTTOM_HEX = '#22C55E';
const CENTER_HEX = '#F8FAFC';

export function isMergedCpCloudOverlay(o: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass'>): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  return id.startsWith(CP_CLOUD_ID_PREFIX) || extra.includes('merged-cp-cloud');
}

function remapCpToCloudOverlay(o: OverlayItem): OverlayItem {
  const id = String(o.id || '').replace(/^cptc-/, `${CP_CLOUD_ID_PREFIX}-`);
  const kind = String(o.kind || '');
  const isTop =
    id.includes('-top') ||
    id.includes('fill-top') ||
    (kind === 'channelBand' && String(o.color || '').includes('239'));
  const isBot =
    id.includes('-bot') ||
    id.includes('fill-bot') ||
    (kind === 'channelBand' && String(o.color || '').includes('34,197'));
  const isCenter = id.includes('-center');

  return {
    ...o,
    id,
    category: 'mergedCpCloud',
    zoneFillPreserve: kind === 'channelBand' ? true : o.zoneFillPreserve,
    structureBias: isTop ? 'bearish' : isBot ? 'bullish' : o.structureBias,
    color: isCenter ? 'rgba(248,250,252,0.92)' : o.color,
    lineStrokeWidth: isCenter ? 2.5 : o.lineStrokeWidth,
    lineDash: isCenter ? undefined : o.lineDash,
    noProject: true,
    overlayZoneExtraClass: [
      'merged-cp-cloud',
      'merged-unified-cloud',
      isTop ? 'merged-unified-cloud--short' : '',
      isBot ? 'merged-unified-cloud--long' : '',
      isCenter ? 'merged-cp-cloud--path' : '',
      String(o.overlayZoneExtraClass || ''),
    ]
      .filter(Boolean)
      .join(' '),
    label: '',
    labelTooltip: isTop
      ? '통합구름 · 상단 저항(빨강) — CP밴드 참고'
      : isBot
        ? '통합구름 · 하단 지지(초록) — CP밴드 참고'
        : isCenter
          ? '통합구름 · 중심·경로 — 참고'
          : '통합구름 · CP밴드 — 참고',
  };
}

function nearestCandleIndex(candles: Candle[], t: number): number {
  const n = candles.length;
  if (n < 1) return 0;
  let lo = 0;
  let hi = n - 1;
  const target = Number(t);
  if (!Number.isFinite(target)) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(candles[mid]!.time) < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const a = Number(candles[lo - 1]!.time);
    const b = Number(candles[lo]!.time);
    if (Math.abs(a - target) <= Math.abs(b - target)) return lo - 1;
  }
  return lo;
}

function lerpPrice(t0: number, p0: number, t1: number, p1: number, t: number): number {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 === t0) return p1;
  const r = (t - t0) / (t1 - t0);
  return p0 + (p1 - p0) * r;
}

/**
 * 큰 구간이되 **기존 캔들 범위만** (미래 time 금지 → SMC 좌측 밀림 방지).
 * 시각은 봉 time에 스냅.
 */
function stretchCpCloudToWideSpan(
  overlays: OverlayItem[],
  candles: Candle[],
  opts?: { spanFrac?: number; widthBoost?: number }
): OverlayItem[] {
  const n = candles.length;
  if (n < 8 || !overlays.length) return overlays;
  const spanFrac = Math.max(0.55, Math.min(0.92, opts?.spanFrac ?? 0.82));
  const widthBoost = Math.max(1, Math.min(2.2, opts?.widthBoost ?? 1.55));
  const startIdx = Math.max(0, Math.floor(n * (1 - spanFrac)));
  const endIdx = n - 1;
  const tStart = Number(candles[startIdx]!.time);
  const tEnd = Number(candles[endIdx]!.time);
  if (![tStart, tEnd].every(Number.isFinite) || tEnd <= tStart) return overlays;

  const mid = (Number(candles[endIdx]!.high) + Number(candles[endIdx]!.low)) / 2;

  return overlays.map((o) => {
    const kind = String(o.kind || '');
    if (kind === 'channelBand' && o.channelBand) {
      const cb = o.channelBand;
      const t0 = Number(cb.time1);
      const t1 = Number(cb.time2);
      const hi0 = lerpPrice(t0, cb.priceHigh1, t1, cb.priceHigh2, tStart);
      const hi1 = lerpPrice(t0, cb.priceHigh1, t1, cb.priceHigh2, tEnd);
      const lo0 = lerpPrice(t0, cb.priceLow1, t1, cb.priceLow2, tStart);
      const lo1 = lerpPrice(t0, cb.priceLow1, t1, cb.priceLow2, tEnd);
      const expand = (hi: number, lo: number) => {
        const c = (hi + lo) / 2;
        const half = (Math.abs(hi - lo) / 2) * widthBoost;
        return { hi: c + half, lo: c - half };
      };
      const a = expand(hi0, lo0);
      const b = expand(hi1, lo1);
      return {
        ...o,
        time1: tStart,
        time2: tEnd,
        price1: a.hi,
        price2: b.lo,
        channelBand: {
          time1: tStart,
          time2: tEnd,
          priceHigh1: a.hi,
          priceHigh2: b.hi,
          priceLow1: a.lo,
          priceLow2: b.lo,
        },
        noProject: true,
      };
    }
    if (kind === 'trendLine' || kind === 'keyLevel') {
      const id = String(o.id || '');
      if (id.includes('future-path')) return o;
      const t0 = Number(o.time1);
      const t1 = Number(o.time2);
      const p0 = Number(o.price1);
      const p1 = Number(o.price2);
      if (![t0, t1, p0, p1].every(Number.isFinite)) return o;
      let np0 = lerpPrice(t0, p0, t1, p1, tStart);
      let np1 = lerpPrice(t0, p0, t1, p1, tEnd);
      if (id.includes('-top') && !id.includes('mid') && !id.includes('zone')) {
        const lift = Math.abs(np0 - mid) * (widthBoost - 1) * 0.28;
        np0 += lift;
        np1 += lift;
      } else if (id.includes('-bot') && !id.includes('mid') && !id.includes('zone')) {
        const drop = Math.abs(np0 - mid) * (widthBoost - 1) * 0.28;
        np0 -= drop;
        np1 -= drop;
      }
      return {
        ...o,
        time1: tStart,
        time2: tEnd,
        price1: np0,
        price2: np1,
        lineStrokeWidth: Math.max(2, Number(o.lineStrokeWidth) || 2),
        noProject: true,
      };
    }
    return o;
  });
}

function snapCloudOverlaysToCandles(overlays: OverlayItem[], candles: Candle[]): OverlayItem[] {
  if (candles.length < 2) return overlays;
  return overlays.map((o) => {
    const id = String(o.id || '');
    if (id.includes('future-path')) return o;
    const next: OverlayItem = { ...o };
    if (typeof next.time1 === 'number') {
      next.time1 = Number(candles[nearestCandleIndex(candles, next.time1)]!.time);
    }
    if (typeof next.time2 === 'number') {
      next.time2 = Number(candles[nearestCandleIndex(candles, next.time2)]!.time);
    }
    if (next.channelBand) {
      const cb = next.channelBand;
      const t1 = Number(candles[nearestCandleIndex(candles, cb.time1)]!.time);
      const t2 = Number(candles[nearestCandleIndex(candles, cb.time2)]!.time);
      next.channelBand = { ...cb, time1: t1, time2: t2 };
      next.time1 = t1;
      next.time2 = t2;
    }
    next.noProject = true;
    return next;
  });
}

/** 흰 경로 — 기존 캔들 종가에만 스냅 (미래 time 없음) */
function buildWhitePathOverlays(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined
): OverlayItem[] {
  if (candles.length < 8) return [];
  const n = candles.length;
  const start = Math.max(0, n - Math.min(48, Math.max(16, Math.floor(n * 0.22))));
  const pts: { time: number; price: number }[] = [];
  for (let i = start; i < n; i++) {
    const c = candles[i]!;
    pts.push({ time: Number(c.time), price: Number(c.close) });
  }

  const pathA = analysis?.futurePaths?.find((p) => p.path === 'A') ?? analysis?.futurePaths?.[0];
  const target = pathA?.targets?.[pathA.targets.length - 1] ?? pathA?.targets?.[0];
  if (target != null && Number.isFinite(target) && pts.length >= 2) {
    const last = pts[pts.length - 1]!;
    pts[pts.length - 1] = {
      time: last.time,
      price: last.price + (Number(target) - last.price) * 0.12,
    };
  }

  const out: OverlayItem[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (![a.time, a.price, b.time, b.price].every(Number.isFinite)) continue;
    if (a.time === b.time) continue;
    out.push({
      id: `${CP_CLOUD_ID_PREFIX}-future-path-${i}`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: a.time,
      time2: b.time,
      price1: a.price,
      price2: b.price,
      confidence: 55,
      color: 'rgba(248,250,252,0.9)',
      lineStrokeWidth: 2.35,
      noProject: true,
      category: 'mergedCpCloud',
      overlayZoneExtraClass: 'merged-cp-cloud merged-cp-cloud--path merged-unified-cloud',
      labelTooltip: '통합구름 · 경로(흰선) — 캔들 종가 기준 참고·비보장',
    });
  }
  return out;
}

/**
 * 통합구름 팩 — CP 밴드(큰 구간·봉 스냅) + 흰 경로.
 * projectedCandles 비움 — 타임스케일/SMC 위치 영향 없음.
 */
export function buildMergedDeskUnifiedCloudPack(params: {
  candles: Candle[];
  timeframe: string;
  fusion?: unknown;
  masterFutures?: unknown;
  swingMid?: unknown;
  analyzeVerdict?: 'LONG' | 'SHORT' | null;
  analysis?: AnalyzeResponse | null;
}): {
  overlays: OverlayItem[];
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  enter: boolean;
  summaryKo: string;
  projectedCandles: Candle[];
} {
  const safe = sanitizeChartCandlesForSeries(
    mergedWorkCandles(params.candles, params.timeframe),
    params.timeframe
  );
  if (safe.length < 24) {
    return {
      overlays: [],
      bias: 'NEUTRAL',
      enter: false,
      summaryKo: '통합구름 — 캔들 부족',
      projectedCandles: [],
    };
  }

  let min = Infinity;
  let max = -Infinity;
  for (const c of safe) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return {
      overlays: [],
      bias: 'NEUTRAL',
      enter: false,
      summaryKo: '통합구름 — 가격 범위 없음',
      projectedCandles: [],
    };
  }

  const visIdx = (arr: Candle[], i: number) => Math.max(0, Math.min(arr.length - 1, Math.floor(i)));
  const visTime = (arr: Candle[], i: number) =>
    Number(arr[visIdx(arr, i)]?.time ?? arr[arr.length - 1]?.time ?? 0);

  const suggested = computeSuggestedChartPrimePivotLength(safe, params.timeframe);
  const length = Math.max(suggested, Math.min(30, Math.max(18, Math.floor(safe.length / 14))));
  const cp = computeChartPrimeTrendChannelOverlays(safe, min, max, visTime, visIdx, {
    length,
    wait: true,
    extend: true,
    show: true,
    showFills: true,
    enableLiquid: false,
    channelWidthScale: 1.35,
    topColor: TOP_HEX,
    bottomColor: BOTTOM_HEX,
    centerColor: CENTER_HEX,
  });

  const bandOverlays = snapCloudOverlaysToCandles(
    stretchCpCloudToWideSpan((cp.overlays ?? []).map(remapCpToCloudOverlay), safe, {
      spanFrac: 0.82,
      widthBoost: 1.55,
    }),
    safe
  );
  const pathOverlays = buildWhitePathOverlays(safe, params.analysis ?? null);

  const bias =
    params.analyzeVerdict === 'LONG' || params.analyzeVerdict === 'SHORT'
      ? params.analyzeVerdict
      : 'NEUTRAL';

  return {
    overlays: [...bandOverlays, ...pathOverlays],
    bias,
    enter: false,
    summaryKo: '통합구름 · CP큰구간(봉스냅) · 흰경로 — 참고',
    projectedCandles: [],
  };
}

export function filterOverlaysForUnifiedCloud(overlays: OverlayItem[]): OverlayItem[] {
  return overlays.filter((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    if (isMergedCpCloudOverlay(o)) return true;
    if (id.startsWith('merged-ares-ribbon')) return false;
    /** 파란·빨간 평행채널 · ST 구름은 통합구름 필터에서 유지 */
    if (
      id.startsWith('merged-desk-rb-') ||
      id.startsWith('merged-ares-st-cloud') ||
      extra.includes('merged-desk-rb-channel') ||
      extra.includes('merged-ares-st-cloud')
    ) {
      return true;
    }
    if (id.includes('merged-swing-channel-band')) return false;
    if (o.kind === 'channelBand' && o.category === 'chartPrimeTrendChannels') return false;
    if (id.startsWith('cptc-')) return false;
    return true;
  });
}
