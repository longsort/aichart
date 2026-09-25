/**
 * 통합·분석 Mirage TV zone — 형성 캔들(time1) → 마지막 봉 우측 픽셀 연장.
 * 확대·축소와 무관하게 **시리즈 logical 봉 좌표만** 사용 (빈 축 x=0 외삽 금지).
 */
import type { Candle, OverlayItem } from '@/types';
import type { IChartApi, ISeriesApi, Logical, UTCTimestamp } from 'lightweight-charts';
import { MismatchDirection } from 'lightweight-charts';

function candleIndexAtOrBefore(candles: Candle[], t: number): number {
  if (!candles.length) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Number(candles[mid]!.time) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function seriesBarCount(series: ISeriesApi<'Candlestick'>): number {
  try {
    if (!series.dataByIndex(0 as unknown as Logical, MismatchDirection.NearestLeft)) return 0;
    let lo = 0;
    let hi = 500_000;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (series.dataByIndex(mid as unknown as Logical, MismatchDirection.NearestLeft)) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  } catch {
    return 0;
  }
}

/** candles 배열 인덱스 → 차트 시리즈 logical 인덱스 (tail 슬라이스·전량 시리즈 정렬) */
function candleIdxToSeriesLogical(
  candles: Candle[],
  idx: number,
  series: ISeriesApi<'Candlestick'>
): number {
  const sc = seriesBarCount(series);
  const n = candles.length;
  const clamped = Math.max(0, Math.min(n - 1, idx));
  if (sc <= 0) return clamped;
  if (sc === n) return clamped;
  if (sc > n) return sc - n + clamped;
  return Math.min(clamped, sc - 1);
}

/** OB/존 id에서 형성 봉 시각 — `ob-ob3-bull-{unix}` · `smc-ob-bullish-{idx}` · time1 */
export function parseMirageZoneFormationTime(
  item: Pick<OverlayItem, 'id' | 'time1'> | null | undefined
): number | null {
  if (!item) return null;
  const id = String(item.id || '');
  const engulf = id.match(/merged-ares-mlsp-tv-ob-(?:ob\d+-)?(?:bull|bear)-(\d+)$/);
  if (engulf?.[1]) {
    const t = Number(engulf[1]);
    if (Number.isFinite(t) && t > 1e9) return t; // unix 초/ms
    if (Number.isFinite(t) && t > 0 && t < 1e7) {
      /* 인덱스형 id는 time1 사용 */
    } else if (Number.isFinite(t) && t > 0) return t;
  }
  const smc = id.match(/merged-ares-mlsp-tv-smc-ob-(?:bullish|bearish)-(\d+)$/);
  if (smc?.[1]) {
    /* smc id trailing = candle index — time1이 진실 */
  }
  const t1 = Number(item.time1);
  return Number.isFinite(t1) && t1 > 0 ? t1 : null;
}

export type MirageZoneFacePixelSpan = { xLeft: number; xRight: number };

function xAtCandleIdx(
  candles: Candle[],
  idx: number,
  ts: ReturnType<IChartApi['timeScale']>,
  series: ISeriesApi<'Candlestick'>,
  timeToX: (t: number) => number
): number {
  const clamped = Math.max(0, Math.min(candles.length - 1, idx));
  const logical = candleIdxToSeriesLogical(candles, clamped, series) as unknown as Logical;
  try {
    const x = ts.logicalToCoordinate(logical);
    if (x != null && Number.isFinite(Number(x))) return Number(x);
  } catch {
    /* ignore */
  }
  const t = Number(candles[clamped]!.time);
  try {
    const x = ts.timeToCoordinate(t as UTCTimestamp);
    if (x != null && Number.isFinite(Number(x))) return Number(x);
  } catch {
    /* ignore */
  }
  const mx = timeToX(t);
  if (Number.isFinite(mx)) return mx;
  try {
    const bar = series.dataByIndex(logical, MismatchDirection.NearestLeft);
    if (bar?.time != null) {
      const x = ts.timeToCoordinate(bar.time as UTCTimestamp);
      if (x != null && Number.isFinite(Number(x))) return Number(x);
    }
  } catch {
    /* ignore */
  }
  return NaN;
}

function resolveLastBarScreenX(
  candles: Candle[],
  ts: ReturnType<IChartApi['timeScale']>,
  series: ISeriesApi<'Candlestick'>,
  timeToX: (t: number) => number,
  safeXLastBar?: number
): number {
  if (Number.isFinite(safeXLastBar ?? NaN)) return Number(safeXLastBar);
  const sc = seriesBarCount(series);
  if (sc > 0) {
    try {
      const x = ts.logicalToCoordinate((sc - 1) as unknown as Logical);
      if (x != null && Number.isFinite(Number(x))) return Number(x);
    } catch {
      /* ignore */
    }
  }
  return xAtCandleIdx(candles, candles.length - 1, ts, series, timeToX);
}

function resolveFirstBarScreenX(
  candles: Candle[],
  ts: ReturnType<IChartApi['timeScale']>,
  series: ISeriesApi<'Candlestick'>,
  timeToX: (t: number) => number
): number {
  const sc = seriesBarCount(series);
  if (sc > 0) {
    try {
      const x = ts.logicalToCoordinate(0 as unknown as Logical);
      if (x != null && Number.isFinite(Number(x))) return Number(x);
    } catch {
      /* ignore */
    }
  }
  return xAtCandleIdx(candles, 0, ts, series, timeToX);
}

/**
 * 형성(분석) 캔들 → 마지막 봉. logical 좌표만 사용.
 * barsFromEnd×추정폭으로 x=0 강제하던 폴백 제거 → 축소 시 좌측 빈 축 밀림 방지.
 */
export function resolveMirageZoneFacePixels(params: {
  item: OverlayItem;
  candles: Candle[];
  timeframe: string;
  timeScale: ReturnType<IChartApi['timeScale']>;
  series: ISeriesApi<'Candlestick'>;
  timeToX: (t: number) => number;
  chartRightPx: number;
  safeXLastBar?: number;
}): MirageZoneFacePixelSpan | null {
  const { item, candles, timeScale: ts, series, timeToX, safeXLastBar } = params;
  void params.chartRightPx;
  const n = candles.length;
  if (n < 2) return null;

  let tForm = parseMirageZoneFormationTime(item);
  if (tForm == null) return null;

  let idxStart = Math.max(0, Math.min(n - 1, candleIndexAtOrBefore(candles, tForm)));
  const endExclusive = Math.max(1, n - 2);
  const lookback = Math.min(endExclusive, Math.max(24, Math.min(96, Math.floor(n * 0.2))));
  const from = Math.max(0, endExclusive - lookback);
  /** 형성봉이 마지막 1~2봉이거나 너무 왼쪽이면 → 최근 분석 스윙 */
  if (idxStart >= n - 2 || idxStart < from) {
    const hi = Math.max(Number(item.price1) || 0, Number(item.price2) || 0);
    const lo = Math.min(Number(item.price1) || 0, Number(item.price2) || 0);
    const lastClose = Number(candles[n - 1]!.close);
    const mid = (hi + lo) / 2;
    const supplyLike = Number.isFinite(lastClose) && Number.isFinite(mid) ? mid >= lastClose : true;
    let bestExt = -1;
    let bestExtVal = supplyLike ? -Infinity : Infinity;
    let lastOverlap = -1;
    if (hi > lo) {
      for (let i = endExclusive - 1; i >= from; i--) {
        const c = candles[i]!;
        if (c.high < lo || c.low > hi) continue;
        if (lastOverlap < 0) lastOverlap = i;
        if (supplyLike) {
          if (c.high >= bestExtVal) {
            bestExtVal = c.high;
            bestExt = i;
          }
        } else if (c.low <= bestExtVal) {
          bestExtVal = c.low;
          bestExt = i;
        }
      }
    }
    if (bestExt >= 0) idxStart = bestExt;
    else if (lastOverlap >= 0) idxStart = lastOverlap;
    else idxStart = Math.max(from, endExclusive - 12);
  }
  const idxEnd = n - 1;

  const formX = xAtCandleIdx(candles, idxStart, ts, series, timeToX);
  const anchorRight = resolveLastBarScreenX(candles, ts, series, timeToX, safeXLastBar);

  if (!Number.isFinite(formX) || !Number.isFinite(anchorRight)) return null;

  const barW = Math.max(
    4,
    (() => {
      if (idxEnd <= 0) return 8;
      const a = xAtCandleIdx(candles, idxEnd, ts, series, timeToX);
      const b = xAtCandleIdx(candles, Math.max(0, idxEnd - 1), ts, series, timeToX);
      const d = Math.abs(a - b);
      return Number.isFinite(d) && d > 1 ? d : 8;
    })()
  );

  /** 좌 = 이 존의 분석/형성 봉. 첫 봉·화면 좌끝으로 늘리지 않음 */
  let xLeft = formX - barW * 0.48;
  let xRight = Number.isFinite(anchorRight) ? anchorRight + barW * 0.48 : NaN;
  if (!Number.isFinite(xRight)) return null;

  const minW = Math.max(10, barW * 2);
  if (xRight - xLeft < minW) {
    xLeft = xRight - minW;
    if (xRight - xLeft < minW) xRight = xLeft + minW;
  }
  if (!Number.isFinite(xLeft) || !Number.isFinite(xRight) || xRight <= xLeft) {
    return null;
  }
  return { xLeft, xRight };
}

/** screenOverlays 파이프라인용 래퍼 */
export function resolveMirageZoneScreenSpan(params: {
  item: OverlayItem;
  candleSeries: Candle[];
  timeframe: string;
  timeScale: ReturnType<IChartApi['timeScale']>;
  series: ISeriesApi<'Candlestick'>;
  timeToX: (t: number) => number;
  safeXLastBar: number;
  chartRightPx: number;
}): MirageZoneFacePixelSpan | null {
  const span = resolveMirageZoneFacePixels({
    item: params.item,
    candles: params.candleSeries,
    timeframe: params.timeframe,
    timeScale: params.timeScale,
    series: params.series,
    timeToX: params.timeToX,
    chartRightPx: params.chartRightPx,
    safeXLastBar: params.safeXLastBar,
  });
  if (!span) return null;
  /** 우측 = 마지막 생신 캔들 X (화면 우끝으로 늘리지 않음 · 패닝 시 음수/폭초과 허용) */
  return { xLeft: span.xLeft, xRight: Math.max(span.xLeft + 8, span.xRight) };
}
