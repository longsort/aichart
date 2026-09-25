/**
 * 통합·분석 zone — 가시 봉 slice + time1~time2 (1d·1w coarse TF 가로 폭 보장).
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  isMergedDeskLastCandleAnchorOverlay,
  isMergedDeskMirageTvZoneOverlay,
  isMergedDeskAnalyzedCandleSpanOverlay,
  isMergedDeskRbDrawOverlay,
  isMergedDeskRbCompactFaceOverlay,
} from '@/lib/mergedAnalysisOverlayIds';
import {
  isMergedDeskChartTimeframe,
  isMergedDeskHtfChartTf,
  mergedDesk4hReferenceCandles,
} from '@/lib/mergedDesk4hReference';
import { parseMirageZoneFormationTime } from '@/lib/mergedDeskMirageZoneScreen';
import { monthDeskTailLabelAnchorTime, monthDeskTailLabelAnchorXNorm } from '@/lib/monthDeskChartTailSpacing';

export { isMergedDeskChartTimeframe, isMergedDeskHtfChartTf };

export function fmtMergedZonePrice(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(3);
}

/** TV 참조형 — `0 / 1503.4` 우측 zone 라벨 */
export function mergedZoneNumberedLabel(index: number, price: number): string {
  return `${index} / ${fmtMergedZonePrice(price)}`;
}

export function buildMergedZoneIndexById(
  zones: ReadonlyArray<{ id: string; price: number }>
): Map<string, number> {
  const sorted = [...zones].sort((a, b) => a.price - b.price);
  const map = new Map<string, number>();
  sorted.forEach((z, i) => map.set(z.id, i));
  return map;
}

/**
 * 차트(마켓)·analyze 중 최신 마지막 봉 기준 선택.
 * 단, 두 시리즈가 서로 다른 TF(예: 1h 마켓 vs 15m 분석)이면 항상 live(마켓) 우선 —
 * 마지막 시각만 비교하면 15m가 이겨 재버킷·뛰엄뛰엄 캔들이 된다.
 */
export function mergedDeskChartAlignCandles(
  live: Candle[],
  fallback: Candle[],
  _timeframe?: string
): Candle[] {
  const liveOk = live.length >= 2;
  const fbOk = fallback.length >= 2;
  if (liveOk && fbOk) {
    // 동일 시리즈(참조 동일·길이·말단 시각 근접)일 때만 fallback 경합 허용
    if (live === fallback) return live;
    const liveLast = Number(live[live.length - 1]!.time);
    const fbLast = Number(fallback[fallback.length - 1]!.time);
    const liveStep =
      live.length >= 2
        ? Math.abs(Number(live[live.length - 1]!.time) - Number(live[live.length - 2]!.time))
        : 0;
    const fbStep =
      fallback.length >= 2
        ? Math.abs(Number(fallback[fallback.length - 1]!.time) - Number(fallback[fallback.length - 2]!.time))
        : 0;
    // 봉 간격이 크게 다르면(≥1.5배) TF 불일치로 보고 마켓(live) 고정
    if (liveStep > 0 && fbStep > 0) {
      const ratio = Math.max(liveStep, fbStep) / Math.min(liveStep, fbStep);
      if (ratio >= 1.5) return live;
    }
    if (Number.isFinite(liveLast) && Number.isFinite(fbLast)) {
      return liveLast >= fbLast ? live : fallback;
    }
    return live;
  }
  if (liveOk) return live;
  if (fbOk) return fallback;
  return live.length ? live : fallback;
}

/** 통합·분석 work 윈도 = 차트 setData와 동일 tail (visibleLimit 재슬라이스 금지) */
export function mergedWorkCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedDesk4hReferenceCandles(candles, timeframe);
}

/** 통합·분석 — 마켓·analyze 정렬 후 4h 참조 cap (차트 setData·엔진·오버레이 단일 소스) */
export function resolveMergedDeskCanonicalCandles(
  live: Candle[],
  fallback: Candle[],
  timeframe: string
): Candle[] {
  const aligned = mergedDeskChartAlignCandles(live, fallback, timeframe);
  return mergedDesk4hReferenceCandles(aligned, timeframe);
}

/** 통합·분석 엔진 work 윈도 — 차트 setData와 동일 tail cap */
export function mergedDeskEngineCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedDesk4hReferenceCandles(candles, timeframe);
}

export function mergedAresOverlayTimes(
  candles: Candle[],
  timeframe: string,
  _zoneTime1?: number
): { t1: UTCTimestamp; t2: UTCTimestamp } | null {
  return mergedDeskLastCandleZoneTimes(candles, timeframe);
}

export function mergedAnalysisChartZoneTimes(
  candles: Candle[],
  timeframe: string
): { t1: UTCTimestamp; t2: UTCTimestamp } | null {
  return mergedDeskLastCandleZoneTimes(candles, timeframe);
}

/** overlay time → 차트 캔들 time 축에 스냅 (Bitget 1d 16:00 UTC 등) */
export function snapMergedOverlayTimeToCandles(t: number, candles: Candle[]): UTCTimestamp {
  if (!candles.length || !Number.isFinite(t)) return t as UTCTimestamp;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Number(candles[mid]!.time) <= t) lo = mid;
    else hi = mid - 1;
  }
  const atOrBefore = Number(candles[lo]!.time);
  if (lo < candles.length - 1) {
    const next = Number(candles[lo + 1]!.time);
    if (Number.isFinite(next) && Math.abs(next - t) < Math.abs(atOrBefore - t)) {
      return next as UTCTimestamp;
    }
  }
  return atOrBefore as UTCTimestamp;
}

/** 통합·분석 — zone·라벨 가로 폭(마지막 봉 기준 N봉). HTF lookback 80+는 좌측 과거에 zone이 붙음 */
/** 통합·분석 구조 로켓 — 마지막 봉 근처만 표시(HTF 과거 전구간 로켓 제거) */
export function mergedDeskRocketVisibleBars(timeframe: string): number {
  const base = mergedDeskLastCandleZoneBars(timeframe);
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1M') return Math.max(base, 16);
  if (tf === '1w') return Math.max(base, 24);
  if (tf === '1d') return Math.max(base, 36);
  return Math.max(base, 48);
}

export function filterMergedDeskTailRocketRows<T extends { time: number }>(
  rows: ReadonlyArray<T>,
  candles: Candle[],
  timeframe: string
): T[] {
  if (!rows.length || candles.length < 2) return [...rows];
  const tf = normalizeChartTimeframe(timeframe);
  const tEnd = Number(candles[candles.length - 1]!.time);
  const width = mergedDeskRocketVisibleBars(tf);
  const tStart = Number(candles[Math.max(0, candles.length - width)]!.time);
  if (!Number.isFinite(tEnd) || !Number.isFinite(tStart)) return [...rows];
  return rows.filter((r) => {
    const t = Number(r.time);
    if (!Number.isFinite(t)) return false;
    return t >= tStart && t <= tEnd;
  });
}

/** 구조·스윙·펄스 마커 — 마지막 봉 근처만 */
export function filterMergedDeskTailMarkers<T extends { time: number | UTCTimestamp }>(
  markers: ReadonlyArray<T>,
  candles: Candle[],
  timeframe: string
): T[] {
  return filterMergedDeskTailRocketRows(
    markers.map((m) => ({ ...m, time: Number(m.time) })),
    candles,
    timeframe
  );
}

/** 통합·분석 — 차트 가시 구간(첫 봉~마지막 봉) 신호만. tail 잘라내기 대신 정상 분석 윈도 */
export function filterMergedDeskSignalsToChartWindow<T extends { time: number | UTCTimestamp }>(
  rows: ReadonlyArray<T>,
  candles: Candle[]
): T[] {
  if (!rows.length || candles.length < 2) return [...rows];
  const tMin = Number(candles[0]!.time);
  const tMax = Number(candles[candles.length - 1]!.time);
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return [...rows];
  return rows.filter((r) => {
    const t = Number(r.time);
    return Number.isFinite(t) && t >= tMin && t <= tMax;
  });
}

/**
 * analyze·desk 엔진 time → 차트 캔들 time.
 * **절대시각(wall-clock) 스냅만** 사용.
 * 끝에서부터 인덱스 remap은 분석TF≠차트TF일 때 zone을 첫 봉(좌측)으로 밀어
 * 확대·축소 시 분석 캔들에서 떨어져 보이게 하므로 금지.
 */
export function remapMergedDeskSignalTimeToChart(
  t: number,
  chartCandles: Candle[],
  _sourceCandles?: Candle[]
): number {
  if (!chartCandles.length || !Number.isFinite(t)) return t;
  return Number(snapMergedOverlayTimeToCandles(t, chartCandles));
}

/**
 * 구조 로켓·마커 — 차트 캔들 **절대시각 스냅만**.
 * 끝 인덱스 remap 금지: 1d/1w/1M 전량 setData vs 엔진 480봉·analyze 슬라이스 길이 차이로
 * 라벨이 과거 한 봉에 몰리거나 마지막 봉 우측(빈 축)에 복제됨.
 */
export function remapStructureRocketsToChart<T extends { time: number }>(
  rows: ReadonlyArray<T>,
  chartCandles: Candle[],
  _sourceCandles?: Candle[]
): T[] {
  if (!rows.length || !chartCandles.length) return [...rows];
  const tMin = Number(chartCandles[0]!.time);
  const tMax = Number(chartCandles[chartCandles.length - 1]!.time);
  return rows.map((r) => {
    const t = Number(r.time);
    if (!Number.isFinite(t)) return r;
    let chartT = Number(snapMergedOverlayTimeToCandles(t, chartCandles));
    if (!Number.isFinite(chartT)) return r;
    if (Number.isFinite(tMin) && chartT < tMin) chartT = tMin;
    if (Number.isFinite(tMax) && chartT > tMax) chartT = tMax;
    return chartT === t ? r : ({ ...r, time: chartT } as T);
  });
}

export function dedupeMergedDeskRocketsOnePerBar<T extends { time: number; direction: 'LONG' | 'SHORT'; tier?: string }>(
  rows: ReadonlyArray<T>,
  chartBias?: 'LONG' | 'SHORT' | null,
  chartCandles?: Candle[]
): T[] {
  const byBar = new Map<number, T>();
  for (const r of rows) {
    const t = Number(r.time);
    if (!Number.isFinite(t)) continue;
    const barT =
      chartCandles && chartCandles.length
        ? Number(snapMergedOverlayTimeToCandles(t, chartCandles))
        : t;
    if (!Number.isFinite(barT)) continue;
    const next = (barT === t ? r : ({ ...r, time: barT } as T));
    const prev = byBar.get(barT);
    if (!prev) {
      byBar.set(barT, next);
      continue;
    }
    const prevTier = String(prev.tier || '');
    const nextTier = String(next.tier || '');
    if (nextTier === 'structure' && prevTier !== 'structure') {
      byBar.set(barT, next);
      continue;
    }
    if (prevTier === 'structure' && nextTier !== 'structure') continue;
    if (prev.direction === next.direction) continue;
    const pick = chartBias ?? prev.direction;
    byBar.set(barT, next.direction === pick ? next : prev);
  }
  return [...byBar.values()].sort((a, b) => a.time - b.time);
}

export function remapMergedDeskMarkerTimesToChart<T extends { time: number | UTCTimestamp }>(
  rows: ReadonlyArray<T>,
  chartCandles: Candle[],
  sourceCandles?: Candle[]
): T[] {
  return rows.map((r) => {
    const t = Number(r.time);
    if (!Number.isFinite(t)) return r;
    return {
      ...r,
      time: remapMergedDeskSignalTimeToChart(t, chartCandles, sourceCandles) as T['time'],
    };
  });
}

/**
 * zone 형성봉 시각 — 가격대(top~bot)를 **처음 터치한 캔들**.
 * preferredTime1이 있고 마지막 3봉이 아니면 그걸 형성봉으로 사용.
 * last-N 강제·마지막 봉 단독 앵커 금지.
 */
export function findMergedDeskZoneFormationBarTime(
  candles: Candle[],
  top: number,
  bot: number,
  preferredTime1?: number | null
): number {
  const n = candles.length;
  if (n < 1) return Math.floor(Date.now() / 1000);
  if (n === 1) return Number(candles[0]!.time);
  const hi = Math.max(Number(top) || 0, Number(bot) || 0);
  const lo = Math.min(Number(top) || 0, Number(bot) || 0);
  const endExclusive = Math.max(1, n - 2);

  const closestIdx = (t: number): number => {
    const s = Number(snapMergedOverlayTimeToCandles(t, candles));
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(Number(candles[i]!.time) - s);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const firstTouchIdx = (): number => {
    if (hi > lo) {
      for (let i = 0; i < endExclusive; i++) {
        const c = candles[i]!;
        if (c.high >= lo && c.low <= hi) return i;
      }
      const mid = (hi + lo) / 2;
      let best = Math.max(0, Math.floor(n * 0.35));
      let bestD = Infinity;
      for (let i = 0; i < endExclusive; i++) {
        const c = candles[i]!;
        const d = Math.min(
          Math.abs(c.high - mid),
          Math.abs(c.low - mid),
          Math.abs(((c.high + c.low) / 2) - mid)
        );
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }
    return Math.max(0, Math.floor(n * 0.35));
  };

  const pref = Number(preferredTime1);
  if (Number.isFinite(pref) && pref > 0) {
    const pi = closestIdx(pref);
    /** 마지막 2봉에 붙어 있으면 형성봉이 아님 → 첫 터치 재탐색 */
    if (pi < n - 2) return Number(candles[pi]!.time);
  }
  return Number(candles[firstTouchIdx()]!.time);
}

/**
 * zone 면 좌·우 — **분석 시작 캔들(time1)** ~ **마지막 생신 캔들(time2)**.
 * 절대시각을 현재 차트 TF 캔들에 스냅. 차트에 없는 과거는 첫 봉으로만 클램프.
 * 1m·15m·1h·4h·1d·1w·1M 전부 동일 규칙 (공유 분석 앵커 TF=15m).
 */

/** AI면·핵심돌파 — 좌 time1 허그. 우측 라벨은 ChartView에서 마지막봉+20봉 여백. */
export function mergedDeskRbCompactFaceScreenSpan(
  candles: Candle[],
  raw: Pick<OverlayItem, 'id' | 'kind' | 'time1' | 'time2' | 'overlayZoneExtraClass'> | null | undefined,
  timeToX: (t: number) => number,
  xLastBar: number
): { xLeft: number; xRight: number } | null {
  if (!isMergedDeskRbCompactFaceOverlay(raw) || candles.length < 2) return null;
  const n = candles.length;
  const tLast = Number(candles[n - 1]!.time);
  let t1 = Number(raw?.time1);
  let t2 = Number(raw?.time2);
  if (!Number.isFinite(t1) || t1 <= 0) t1 = Number(candles[Math.max(0, n - 6)]!.time);
  if (!Number.isFinite(t2) || t2 <= 0 || t2 > tLast) t2 = tLast;
  t1 = Number(snapMergedOverlayTimeToCandles(t1, candles));
  t2 = Number(snapMergedOverlayTimeToCandles(t2, candles));
  if (!(t1 > 0) || !(t2 > 0)) return null;
  if (t1 > t2) t1 = t2;
  let xLeft = timeToX(t1);
  let xRight = timeToX(t2);
  if (!Number.isFinite(xRight) && Number.isFinite(xLastBar)) xRight = xLastBar;
  if (!Number.isFinite(xLeft) || !Number.isFinite(xRight)) return null;
  if (xRight < xLeft) {
    const tmp = xLeft;
    xLeft = xRight;
    xRight = tmp;
  }
  if (xRight - xLeft < 14) xLeft = xRight - 14;
  return { xLeft, xRight };
}

export function mergedDeskAnalyzedZoneSpanTimes(
  candles: Candle[],
  raw: Pick<OverlayItem, 'id' | 'time1' | 'price1' | 'price2'> | null | undefined
): { t1: UTCTimestamp; t2: UTCTimestamp } | null {
  const n = candles.length;
  if (n < 2) return null;
  const tFirst = Number(candles[0]!.time);
  const tLast = Number(snapMergedOverlayTimeToCandles(Number(candles[n - 1]!.time), candles));
  if (!Number.isFinite(tFirst) || !Number.isFinite(tLast)) return null;

  let tStart =
    parseMirageZoneFormationTime(raw) ??
    (raw && typeof raw.time1 === 'number' ? Number(raw.time1) : NaN);

  const p1 = raw && typeof raw.price1 === 'number' ? Number(raw.price1) : NaN;
  const p2 = raw && typeof raw.price2 === 'number' ? Number(raw.price2) : NaN;

  const isNearLastBar = (t: number): boolean => {
    if (!Number.isFinite(t) || t <= 0) return true;
    const snapped = Number(snapMergedOverlayTimeToCandles(t, candles));
    let best = n - 1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(Number(candles[i]!.time) - snapped);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= n - 2;
  };

  /** time1 없거나 마지막 봉에 붙으면 가격대 첫 터치로 재앵커 (last-only 작도 금지) */
  if (!Number.isFinite(tStart) || tStart <= 0 || isNearLastBar(tStart)) {
    if (Number.isFinite(p1) && Number.isFinite(p2) && p1 !== p2) {
      tStart = findMergedDeskZoneFormationBarTime(candles, p1, p2, tStart);
    } else if (!Number.isFinite(tStart) || tStart <= 0 || isNearLastBar(tStart)) {
      tStart = Number(candles[Math.max(0, Math.floor((n - 1) * 0.35))]!.time);
    }
  }

  tStart = Number(snapMergedOverlayTimeToCandles(tStart, candles));
  if (!Number.isFinite(tStart) || tStart <= 0) tStart = tFirst;
  if (tStart < tFirst) tStart = tFirst;
  if (tStart > tLast) tStart = tLast;
  return { t1: tStart as UTCTimestamp, t2: tLast as UTCTimestamp };
}

/** @deprecated — mergedDeskAnalyzedZoneSpanTimes 사용. 마지막 N봉 강제 폭은 분석 캔들에서 떼어냄 */
export const MERGED_DESK_ZONE_SPAN_BARS = 64;

/** @deprecated */
export function mergedDeskZoneSpanTimes(
  candles: Candle[]
): { t1: UTCTimestamp; t2: UTCTimestamp; startIdx: number; endIdx: number } | null {
  const n = candles.length;
  if (n < 2) return null;
  const endIdx = n - 1;
  const startIdx = Math.max(0, endIdx - MERGED_DESK_ZONE_SPAN_BARS);
  const t2 = Number(candles[endIdx]!.time);
  const t1 = Number(candles[startIdx]!.time);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return { t1: t1 as UTCTimestamp, t2: t2 as UTCTimestamp, startIdx, endIdx };
}

/** 통합·분석 zone tail 폭 — TF별 (우측 N봉, 단축 아님·위치만 마지막 봉) */
export function mergedDeskLastCandleZoneBars(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1M') return 8;
  if (tf === '1w') return 12;
  if (tf === '1d') return 20;
  if (tf === '4h') return 28;
  if (tf === '1h') return 36;
  if (tf === '15m') return 48;
  if (tf === '5m' || tf === '3m') return 56;
  if (tf === '1m') return 64;
  if (tf === '1Y') return 16;
  return 32;
}

/** 마지막 캔들 근처 time1~time2 — 시리즈 인덱스 기준(분석 slice time 스냅 오류 방지) */
export function mergedDeskLastCandleZoneTimes(
  candles: Candle[],
  timeframe: string
): { t1: UTCTimestamp; t2: UTCTimestamp } | null {
  const n = candles.length;
  if (n < 2) return null;
  const width = mergedDeskLastCandleZoneBars(timeframe);
  const endIdx = n - 1;
  const startIdx = Math.max(0, endIdx - width + 1);
  const tEnd = Number(candles[endIdx]!.time);
  const tStart = Number(candles[startIdx]!.time);
  return {
    t1: tStart as UTCTimestamp,
    t2: tEnd as UTCTimestamp,
  };
}

/** screenOverlays — 마지막 봉 X 기준 우측 스냅 (time→X 실패·시리즈 길이 불일치 폴백) */
export function snapMergedDeskScreenOverlaySpan(
  candleSeries: Candle[],
  timeframe: string,
  timeToX: (t: number) => number,
  safeXLastBar: number,
  chartRightPx: number
): { xLeft: number; xRight: number } {
  const span = mergedDeskRightZoneScreenSpan(candleSeries, timeframe, timeToX, safeXLastBar);
  if (span) return span;
  const w = Math.max(48, chartRightPx * 0.08);
  return {
    xLeft: Math.max(0, safeXLastBar - w),
    xRight: Math.min(chartRightPx, Math.max(safeXLastBar, safeXLastBar + 2)),
  };
}

/**
 * 좁은 우측 레일(E/SL/TP 등)용 — TF별 last-N봉 X.
 * 분석 zone 면은 mergedDeskAnalyzedZoneScreenSpan 사용.
 */
export function mergedDeskRightZoneScreenSpan(
  candleSeries: Candle[],
  timeframe: string,
  timeToX: (t: number) => number,
  xLastBar: number
): { xLeft: number; xRight: number } | null {
  if (candleSeries.length < 2 || !Number.isFinite(xLastBar)) return null;
  const zoneTimes = mergedDeskLastCandleZoneTimes(candleSeries, timeframe);
  if (!zoneTimes) return null;
  const xLeftRaw = timeToX(Number(zoneTimes.t1));
  if (!Number.isFinite(xLeftRaw)) return null;
  const xRight = xLastBar;
  const minW = 14;
  let xLeft = Math.min(xLeftRaw, xRight - minW);
  if (xRight - xLeft < minW) xLeft = xRight - minW;
  return { xLeft, xRight };
}

/**
 * 분석 zone 면 X — 형성 캔들(time1) → 마지막 봉(time2).
 * 실제 봉 좌표만 사용 → 줌·패닝해도 캔들과 함께 이동(화면 우끝 강제 금지).
 */
export function mergedDeskAnalyzedZoneScreenSpan(
  candleSeries: Candle[],
  raw: Pick<OverlayItem, 'id' | 'kind' | 'time1' | 'time2' | 'overlayZoneExtraClass'> | null | undefined,
  timeToX: (t: number) => number,
  xLastBar: number,
  xFirstBar?: number
): { xLeft: number; xRight: number } | null {
  if (candleSeries.length < 2) return null;
  const compact = mergedDeskRbCompactFaceScreenSpan(candleSeries, raw, timeToX, xLastBar);
  if (compact) return compact;
  const span = mergedDeskAnalyzedZoneSpanTimes(candleSeries, raw);
  if (!span) return null;
  let xLeft = timeToX(Number(span.t1));
  if (!Number.isFinite(xLeft)) return null;
  /** 첫 봉이 화면 안(≥0)일 때만 왼쪽 빈 축 클램프 — 패닝으로 음수면 그대로 */
  if (Number.isFinite(xFirstBar) && Number(xFirstBar) >= 0 && xLeft < Number(xFirstBar)) {
    xLeft = Number(xFirstBar);
  }
  let xRight = timeToX(Number(span.t2));
  if (!Number.isFinite(xRight) && Number.isFinite(xLastBar)) xRight = xLastBar;
  if (!Number.isFinite(xRight)) return null;
  const minW = 14;
  if (xRight - xLeft < minW) {
    /** 형성봉이 마지막에 붙은 경우에도 우측으로만 붙이지 않음 — 좌측(과거)으로 최소폭 확보 */
    const expandedLeft = xRight - minW;
    if (Number.isFinite(xFirstBar) && Number(xFirstBar) >= 0) {
      xLeft = Math.max(Number(xFirstBar), expandedLeft);
    } else {
      xLeft = expandedLeft;
    }
    if (xRight - xLeft < minW) xRight = xLeft + minW;
  }
  return { xLeft, xRight };
}

export function mergedAnalysisChartZoneTimesSnapped(
  candles: Candle[],
  timeframe: string
): { t1: UTCTimestamp; t2: UTCTimestamp } | null {
  return mergedDeskLastCandleZoneTimes(candles, timeframe);
}

/** 분석 zone 가로폭 — 분석 캔들(앵커·레그·피벗) ~ 마지막 봉 */
export type MergedDeskAnalysisZoneContext = {
  anchorTime?: number | null;
  legHigh?: number | null;
  legLow?: number | null;
  direction?: 'up' | 'down' | null;
  pivotTimes?: number[];
};

function findBarIdxClosestHigh(candles: Candle[], target: number, endIdx?: number): number {
  const end = endIdx ?? candles.length - 1;
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i <= end; i++) {
    const diff = Math.abs(candles[i]!.high - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function findBarIdxClosestLow(candles: Candle[], target: number, endIdx?: number): number {
  const end = endIdx ?? candles.length - 1;
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i <= end; i++) {
    const diff = Math.abs(candles[i]!.low - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export function mergedDeskAnalysisZoneTimes(
  candles: Candle[],
  timeframe: string,
  ctx?: MergedDeskAnalysisZoneContext | null
): { t1: UTCTimestamp; t2: UTCTimestamp } {
  const work = mergedWorkCandles(candles, timeframe);
  const n = work.length;
  if (n < 2) {
    return { t1: 0 as UTCTimestamp, t2: 0 as UTCTimestamp };
  }
  const tEnd = Number(snapMergedOverlayTimeToCandles(Number(work[n - 1]!.time), work));
  const candidates: number[] = [];

  const pushT = (t: unknown) => {
    const tn = Number(t);
    if (!Number.isFinite(tn) || tn <= 0) return;
    candidates.push(Number(snapMergedOverlayTimeToCandles(tn, work)));
  };

  if (ctx?.anchorTime != null) pushT(ctx.anchorTime);
  for (const pt of ctx?.pivotTimes ?? []) pushT(pt);

  if (ctx?.direction === 'down' && ctx.legHigh != null && Number.isFinite(ctx.legHigh)) {
    const idx = findBarIdxClosestHigh(work, ctx.legHigh, n - 1);
    if (idx >= 0) pushT(work[idx]!.time);
  } else if (ctx?.direction === 'up' && ctx.legLow != null && Number.isFinite(ctx.legLow)) {
    const idx = findBarIdxClosestLow(work, ctx.legLow, n - 1);
    if (idx >= 0) pushT(work[idx]!.time);
  } else {
    if (ctx?.legHigh != null && Number.isFinite(ctx.legHigh)) {
      const idx = findBarIdxClosestHigh(work, ctx.legHigh, n - 1);
      if (idx >= 0) pushT(work[idx]!.time);
    }
    if (ctx?.legLow != null && Number.isFinite(ctx.legLow)) {
      const idx = findBarIdxClosestLow(work, ctx.legLow, n - 1);
      if (idx >= 0) pushT(work[idx]!.time);
    }
  }

  let tStart: number;
  if (candidates.length) {
    const valid = candidates.filter((t) => t <= tEnd + 1);
    tStart = valid.length ? Math.min(...valid) : Number(work[Math.max(0, n - 8)]!.time);
  } else {
    const tail = mergedDeskLastCandleZoneTimes(work, timeframe);
    tStart = tail ? Number(tail.t1) : Number(work[0]!.time);
  }

  if (!Number.isFinite(tStart) || tStart >= tEnd) {
    const tail = mergedDeskLastCandleZoneTimes(work, timeframe);
    tStart = tail ? Number(tail.t1) : Number(work[Math.max(0, n - 8)]!.time);
  }

  return {
    t1: snapMergedOverlayTimeToCandles(tStart, work) as UTCTimestamp,
    t2: tEnd as UTCTimestamp,
  };
}

export const MERGED_ARES_ZONE_CAPTION_CLASS = 'merged-ares-zone-caption';

/** 통합·분석 E/SL/TP·스윙·Strike 가로 레일 — 우측 라벨 앵커 time2 유지 */
export function isMergedDeskTradeRailOverlay(
  item: Pick<OverlayItem, 'id' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  if (String(item.kind || '') !== 'keyLevel') return false;
  if (/^merged-ares-line-(e|sl|tp[123])$/.test(id)) return true;
  if (/^merged-desk-trade-rail-(e|sl|tp[123])$/.test(id)) return true;
  if (/^merged-swing-fusion-(entry|sl|tp[123])$/.test(id)) return true;
  if (/^month-desk-strike-(long|short)-(entry|sl|tp[123])$/.test(id)) return true;
  return false;
}

/** 차트 screenOverlays — 마지막 봉 tail (xLastBar 우선) */
export function mergedDeskTailScreenXSpan(
  candleSeries: Candle[],
  timeframe: string,
  timeToX: (t: number) => number,
  xLastBar?: number
): { t1: number; t2: number; xLeft: number; xRight: number } | null {
  if (Number.isFinite(xLastBar)) {
    const zoneTimes = mergedDeskLastCandleZoneTimes(candleSeries, timeframe);
    if (zoneTimes) {
      const xRight = Number(xLastBar);
      const xLeftRaw = timeToX(Number(zoneTimes.t1));
      if (Number.isFinite(xLeftRaw)) {
        const minW = 14;
        const xLeft = Math.min(xLeftRaw, xRight - minW);
        return { t1: Number(zoneTimes.t1), t2: Number(zoneTimes.t2), xLeft, xRight };
      }
    }
  }
  if (candleSeries.length < 2) return null;
  const zoneTimes = mergedDeskLastCandleZoneTimes(candleSeries, timeframe);
  if (!zoneTimes) return null;
  const { t1, t2 } = zoneTimes;
  const t1n = Number(t1);
  const t2n = Number(t2);
  if (!Number.isFinite(t1n) || !Number.isFinite(t2n)) return null;
  const xA = timeToX(t1n);
  const xB = timeToX(t2n);
  if (!Number.isFinite(xA) || !Number.isFinite(xB)) return null;
  return {
    t1: t1n,
    t2: t2n,
    xLeft: Math.min(xA, xB),
    xRight: Math.max(xA, xB),
  };
}

/** @deprecated — isMergedDeskLastCandleAnchorOverlay 사용 */
export function shouldForceMergedDeskLastCandleTimes(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'category'> | null | undefined
): boolean {
  return isMergedDeskLastCandleAnchorOverlay(item);
}

/** 마지막 봉 우측 앵커 — ARES 참조 zone·E/SL/TP·롱/숏 zone (전구간 분석 레이어 제외) */
export function isMergedDeskRightAnchorOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'category'> | null | undefined
): boolean {
  return isMergedDeskLastCandleAnchorOverlay(item);
}

export { isMergedDeskLastCandleAnchorOverlay } from '@/lib/mergedAnalysisOverlayIds';

function snapOverlayItemTimesToCandles(raw: OverlayItem, candles: Candle[]): OverlayItem {
  const hasTime =
    typeof raw.time1 === 'number' ||
    typeof raw.time2 === 'number' ||
    (raw.channelBand && (raw.channelBand.time1 != null || raw.channelBand.time2 != null));
  if (!hasTime) return raw;
  const next: OverlayItem = { ...raw };
  if (typeof next.time1 === 'number') {
    next.time1 = snapMergedOverlayTimeToCandles(next.time1, candles);
  }
  if (typeof next.time2 === 'number') {
    next.time2 = snapMergedOverlayTimeToCandles(next.time2, candles);
  }
  if (next.channelBand) {
    const cb = next.channelBand;
    next.channelBand = {
      ...cb,
      time1: snapMergedOverlayTimeToCandles(Number(cb.time1), candles),
      time2: snapMergedOverlayTimeToCandles(Number(cb.time2), candles),
    };
  }
  return next;
}

/** @deprecated — isMergedDeskRightAnchorOverlay 사용 */
export function isMergedDeskZoneLikeOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'category'> | null | undefined
): boolean {
  return isMergedDeskRightAnchorOverlay(item);
}

function mirageBarStepMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 0;
  const d = Number(candles[n - 1]!.time) - Number(candles[n - 2]!.time);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function alignMirageTvZoneOverlayTimesInPlace(
  raw: OverlayItem,
  candles: Candle[],
  _timeframe: string
): OverlayItem {
  void mirageBarStepMs;
  return extendOverlayFromAnalyzedCandleToLast(raw, candles);
}

/**
 * zone 면 = **분석 시작 캔들(time1)** → **차트 마지막 생신 캔들(time2)**.
 * 절대시각 스냅 — 1m~1M 전 TF 공동 (선택 분봉과 무관).
 * 줌·패닝해도 좌=분석봉, 우=마지막 생신봉에 붙음.
 */
export function extendOverlayFromAnalyzedCandleToLast(
  raw: OverlayItem,
  candles: Candle[]
): OverlayItem {
  const span = mergedDeskAnalyzedZoneSpanTimes(candles, raw);
  if (!span) return raw;
  let t1 = Number(span.t1);
  let t2 = Number(span.t2);
  const n = candles.length;
  /** time1===time2(마지막봉) 이면 가격 첫 터치로 강제 재앵커 */
  if (n >= 4 && t1 === t2) {
    const p1 = Number(raw.price1);
    const p2 = Number(raw.price2);
    t1 = findMergedDeskZoneFormationBarTime(candles, p1, p2, t1);
    t1 = Number(snapMergedOverlayTimeToCandles(t1, candles));
    t2 = Number(snapMergedOverlayTimeToCandles(Number(candles[n - 1]!.time), candles));
  }
  if (!(t1 < t2) && n >= 4) {
    t1 = Number(candles[Math.max(0, n - 1 - Math.min(48, Math.floor(n * 0.25)))]!.time);
    t2 = Number(candles[n - 1]!.time);
  }

  const next: OverlayItem = {
    ...raw,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    zoneSpanOnly: false,
    x1: 0,
    x2: 1,
  };
  if (raw.channelBand) {
    const cb = raw.channelBand;
    next.channelBand = { ...cb, time1: t1 as UTCTimestamp, time2: t2 as UTCTimestamp };
  }
  return next;
}

/** 파랑빨강띠 — 좌측만 봉 스냅, 우측 time2(미래 10봉)는 유지 */
function preserveRbFuturePadTimes(raw: OverlayItem, candles: Candle[]): OverlayItem {
  if (!candles.length) return raw;
  const lastT = Number(candles[candles.length - 1]!.time);
  const keepRight = (t: unknown): number => {
    const n = Number(t);
    if (!Number.isFinite(n)) return n;
    if (Number.isFinite(lastT) && n > lastT) return n;
    return Number(snapMergedOverlayTimeToCandles(n, candles));
  };
  const next: OverlayItem = { ...raw };
  if (typeof next.time1 === 'number') {
    next.time1 = snapMergedOverlayTimeToCandles(next.time1, candles);
  }
  if (typeof next.time2 === 'number') {
    next.time2 = keepRight(next.time2) as UTCTimestamp;
  }
  if (next.channelBand) {
    const cb = next.channelBand;
    next.channelBand = {
      ...cb,
      time1: snapMergedOverlayTimeToCandles(Number(cb.time1), candles),
      time2: keepRight(cb.time2) as UTCTimestamp,
    };
  }
  return next;
}

/** zone 면 = 분석캔들→마지막봉 / 선·마커 = 절대시각 스냅 */
function snapOverlayItemTimesToChartWindow(
  raw: OverlayItem,
  candles: Candle[],
  _sourceCandles?: Candle[],
  _timeframe?: string
): OverlayItem {
  if (isMergedDeskRbCompactFaceOverlay(raw)) {
    return snapOverlayItemTimesToCandles(raw, candles);
  }
  if (isMergedDeskRbDrawOverlay(raw)) {
    return preserveRbFuturePadTimes(raw, candles);
  }
  if (isMergedDeskAnalyzedCandleSpanOverlay(raw)) {
    return extendOverlayFromAnalyzedCandleToLast(raw, candles);
  }
  return snapOverlayItemTimesToCandles(raw, candles);
}

/** numbered ARES·E/SL/TP = 마지막 봉 근처 / 분석 zone = 분석캔들→마지막봉 */
export function alignMergedDeskOverlaysToAnalysisWindow(
  overlays: OverlayItem[],
  candles: Candle[],
  timeframe: string,
  _sourceCandles?: Candle[]
): OverlayItem[] {
  if (candles.length < 2) return overlays;
  const zoneTimes = mergedDeskLastCandleZoneTimes(candles, timeframe);
  const t1n = Number(zoneTimes?.t1);
  const t2n = Number(zoneTimes?.t2);
  if (!zoneTimes || !Number.isFinite(t1n) || !Number.isFinite(t2n)) {
    return overlays.map((raw) =>
      clampOverlayLeftIntoCandleRange(
        isMergedDeskRbCompactFaceOverlay(raw)
          ? snapOverlayItemTimesToCandles(raw, candles)
          : isMergedDeskRbDrawOverlay(raw)
            ? preserveRbFuturePadTimes(raw, candles)
            : snapOverlayItemTimesToChartWindow(raw, candles, undefined, timeframe),
        candles
      )
    );
  }
  return overlays.map((raw) => clampOverlayLeftIntoCandleRange(alignOne(raw), candles));

  function alignOne(raw: OverlayItem): OverlayItem {
    if (isMergedDeskRbCompactFaceOverlay(raw)) {
      return snapOverlayItemTimesToCandles(raw, candles);
    }
    if (isMergedDeskRbDrawOverlay(raw)) {
      return preserveRbFuturePadTimes(raw, candles);
    }
    const kind = String(raw.kind || '');
    const id = String(raw.id || '');
    const extra = String(raw.overlayZoneExtraClass || '');
    const isZoneFace =
      kind === 'zone' ||
      kind === 'box' ||
      kind === 'supplyZone' ||
      kind === 'demandZone' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'reactionZone' ||
      kind === 'bprZone' ||
      !!raw.channelBand;
    /** 분석 시작봉 → 마지막 생신봉 — 전 TF 공동 */
    if (
      isMergedDeskMirageTvZoneOverlay(raw) ||
      isMergedDeskAnalyzedCandleSpanOverlay(raw) ||
      (isZoneFace && (id.startsWith('merged-') || extra.includes('merged-')))
    ) {
      return extendOverlayFromAnalyzedCandleToLast(raw, candles);
    }
    if (!isMergedDeskLastCandleAnchorOverlay(raw)) {
      return snapOverlayItemTimesToChartWindow(raw, candles, undefined, timeframe);
    }

    if (isMergedDeskTradeRailOverlay(raw)) {
      if (candles.length < 2) return raw;
      const n = candles.length;
      const lastT = snapMergedOverlayTimeToCandles(Number(candles[n - 1]!.time), candles);
      const tLabel = monthDeskTailLabelAnchorTime(candles, timeframe);
      const xEnd = monthDeskTailLabelAnchorXNorm(candles, timeframe);
      const price = raw.price1;
      return {
        ...raw,
        time1: lastT,
        time2: tLabel,
        x1: 0,
        x2: xEnd,
        price2: typeof price === 'number' ? price : raw.price2,
        noProject: true,
      };
    }

    const winZone = mergedDeskLastCandleZoneTimes(candles, timeframe);
    if (!winZone) return raw;
    const { t1: winT1, t2: winT2 } = winZone;
    const winT1n = Number(winT1);
    const winT2n = Number(winT2);
    const next: OverlayItem = {
      ...raw,
      time1: snapMergedOverlayTimeToCandles(winT1n, candles),
      time2: snapMergedOverlayTimeToCandles(winT2n, candles),
      x1: 0,
      x2: 1,
    };
    if (raw.channelBand) {
      const cb = raw.channelBand;
      const t0 = Number(cb.time1);
      const tEndCb = Number(cb.time2);
      const lerp = (a: number, b: number, t: number) => {
        if (!Number.isFinite(t0) || !Number.isFinite(tEndCb) || tEndCb <= t0) return b;
        const r = Math.max(0, Math.min(1, (t - t0) / (tEndCb - t0)));
        return a + (b - a) * r;
      };
      const hi1 = lerp(cb.priceHigh1, cb.priceHigh2, winT1n);
      const hi2 = lerp(cb.priceHigh1, cb.priceHigh2, winT2n);
      const lo1 = lerp(cb.priceLow1, cb.priceLow2, winT1n);
      const lo2 = lerp(cb.priceLow1, cb.priceLow2, winT2n);
      next.channelBand = {
        ...cb,
        time1: snapMergedOverlayTimeToCandles(winT1n, candles),
        time2: snapMergedOverlayTimeToCandles(winT2n, candles),
        priceHigh1: hi1,
        priceHigh2: hi2,
        priceLow1: lo1,
        priceLow2: lo2,
      };
      next.price1 = hi1;
      next.price2 = lo2;
    }
    return next;
  }
}

/**
 * 좌측 좌표 밀림 방지 — 차트 첫 봉보다 과거인 time을 첫 봉으로 당김.
 * (차트에 없는 시각은 lightweight-charts가 축 밖으로 외삽 → 축소 시 계속 왼쪽으로 밀림)
 * 우측(미래) 라벨 앵커는 그대로 둔다.
 */
function clampOverlayLeftIntoCandleRange(item: OverlayItem, candles: Candle[]): OverlayItem {
  if (candles.length < 2) return item;
  const tFirst = Number(candles[0]!.time);
  if (!Number.isFinite(tFirst)) return item;
  const pull = (t: unknown): number | null => {
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < tFirst ? tFirst : null;
  };
  let next = item;
  const c1 = pull(item.time1);
  const c2 = pull(item.time2);
  if (c1 != null || c2 != null) {
    next = { ...next };
    if (c1 != null) next.time1 = c1 as UTCTimestamp;
    if (c2 != null) next.time2 = c2 as UTCTimestamp;
  }
  const cb = next.channelBand;
  if (cb) {
    const b1 = pull(cb.time1);
    const b2 = pull(cb.time2);
    if (b1 != null || b2 != null) {
      next = {
        ...next,
        channelBand: {
          ...cb,
          time1: (b1 != null ? b1 : cb.time1) as UTCTimestamp,
          time2: (b2 != null ? b2 : cb.time2) as UTCTimestamp,
        },
      };
    }
  }
  return next;
}

/** @deprecated alias */
export function isMergedDeskTimedOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind' | 'category'> | null | undefined
): boolean {
  return isMergedDeskZoneLikeOverlay(item);
}
