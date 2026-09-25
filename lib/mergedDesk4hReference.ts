/**
 * 통합·분석 데스크 — **15m** 분석·작업창 기준을 분·시·일·주·월 전 TF에 동일 적용.
 * zone **위치**는 `mergedDeskRightZoneScreenSpan`(마지막 봉 우측 픽셀).
 * 공유 분석 TF 상수: `lib/mergedDesk4hReferenceAnalysis.ts` (`MERGED_DESK_SHARED_ANALYZE_TF` = 15m).
 *
 * 분·시 봉 수: TF별 cap으로 HTML zone·오버레이 렉 완화 (전량 히스토리 1d/1w/1M 차트와 분리).
 */
import type { Candle } from '@/types';
import { isListingFullHistoryTf, normalizeChartTimeframe, visibleLimit } from '@/lib/constants';

/** 작도·tail 작업창 기준 TF (공유 분석과 동일 — 15m) */
export const MERGED_DESK_4H_REFERENCE_TF = '15m' as const;

/** 15m 기준 기본 작업창 (하위 호환) */
export const MERGED_DESK_4H_REF_BAR_CAP = Math.min(360, visibleLimit(MERGED_DESK_4H_REFERENCE_TF));

/**
 * 엔진·차트 표시(분·시) TF별 캔들 상한 — 렉 방지.
 * 1d/1w/1M 차트 setData는 전량 유지, 엔진 work만 이 cap.
 */
const MERGED_DESK_TF_BAR_CAP: Record<string, number> = {
  '1m': 360, // 6시간 — 학파·통로 구조
  '3m': 400, // 20시간
  '5m': 420, // 35시간
  '15m': 480, // 5일
  '1h': 320, // 13일
  '4h': 340, // ~56일
  '1d': 480, // 엔진 work
  '1w': 280,
  '1M': 180,
};

/**
 * assets 자동 ZONE · 세력ZONE 감지 전용 — 더 짧은 윈도 (이중 루프 렉 방지).
 */
const MERGED_DESK_AUTO_ZONE_DETECT_CAP: Record<string, number> = {
  '1m': 200,
  '3m': 220,
  '5m': 240,
  '15m': 260,
  '1h': 220,
  '4h': 200,
  '1d': 240,
  '1w': 180,
  '1M': 140,
};

/** 엔진·오버레이·mapOverlays work 봉 수 (1d/1w/1M 차트 전량과 별개) */
export function mergedDesk4hReferenceBarCap(timeframe?: string): number {
  if (!timeframe) return MERGED_DESK_4H_REF_BAR_CAP;
  const tf = normalizeChartTimeframe(timeframe);
  return MERGED_DESK_TF_BAR_CAP[tf] ?? MERGED_DESK_4H_REF_BAR_CAP;
}

/** ZONE 자동 감지용 TF별 봉 상한 */
export function mergedDeskAutoZoneDetectBarCap(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  return MERGED_DESK_AUTO_ZONE_DETECT_CAP[tf] ?? 160;
}

/**
 * 기관밴드 LineSeries 봉 수 — 분·시·일·주·월 **공동**.
 * - 분·시: TF별 chart/engine cap
 * - 일·주·월: 차트 전량 중 visibleLimit 이상(왼쪽 과거 존선이 비지 않게)
 */
export function mergedInstitutionalBandBarCap(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  if (isListingFullHistoryTf(tf)) {
    return Math.max(mergedDesk4hReferenceBarCap(tf), visibleLimit(tf));
  }
  return mergedDesk4hReferenceBarCap(tf);
}

/**
 * 엔진·작도용 tail.
 * 1d/1w/1M 차트 캔들(2017~전량)은 ChartView setData가 마켓 전량을 쓰고,
 * 여기서는 성능용 work 윈도만 자른다.
 */
export function mergedDesk4hReferenceCandles(candles: Candle[], timeframe: string): Candle[] {
  if (candles.length < 2) return candles;
  const cap = mergedDesk4hReferenceBarCap(timeframe);
  if (candles.length <= cap) return candles;
  return candles.slice(-cap);
}

/** 기관밴드·차트TF 로켓용 — TF별 bar cap으로 슬라이스(전 TF 공동 경로) */
export function mergedInstitutionalBandCandlesSlice(
  candles: Candle[],
  timeframe: string
): Candle[] {
  if (candles.length < 2) return candles;
  const cap = mergedInstitutionalBandBarCap(timeframe);
  if (candles.length <= cap) return candles;
  return candles.slice(-cap);
}

/** 차트 setData용 — 1d/1w/1M은 cap 없이 전량(상장~현재) */
export function mergedDeskChartDisplayCandles(candles: Candle[], timeframe: string): Candle[] {
  if (candles.length < 2) return candles;
  if (isListingFullHistoryTf(timeframe)) return candles;
  return mergedDesk4hReferenceCandles(candles, timeframe);
}

/** ZONE 감지용 tail — 엔진 work보다 짧게 */
export function mergedDeskAutoZoneDetectCandles(candles: Candle[], timeframe: string): Candle[] {
  if (candles.length < 2) return candles;
  const cap = mergedDeskAutoZoneDetectBarCap(timeframe);
  if (candles.length <= cap) return candles;
  return candles.slice(-cap);
}

/** 통합·분석 UI TF 칩과 동일 */
export const MERGED_DESK_CHART_TIMEFRAMES = [
  '1m',
  '3m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const;

export type MergedDeskChartTimeframe = (typeof MERGED_DESK_CHART_TIMEFRAMES)[number];

export function isMergedDeskChartTimeframe(timeframe: string): boolean {
  const tf = normalizeChartTimeframe(timeframe);
  return (MERGED_DESK_CHART_TIMEFRAMES as readonly string[]).includes(tf);
}

/** @deprecated — HTF 전용 대신 전 TF tail 스냅; 하위 호환 alias */
export function isMergedDeskHtfChartTf(timeframe: string): boolean {
  return isMergedDeskChartTimeframe(timeframe);
}

/** zone tail 폭은 mergedDeskLastCandleZoneBars — 여기서 단축하지 않음 */
/** 스윙 regime 세그먼트 상한 (15m 공동) */
export function mergedDesk4hReferenceRegimeSegments(): number {
  return 48;
}

/** 스윙 평행 채널 lookback (15m 공동 기본) */
export function mergedDesk4hReferenceSwingChannelLookback(): number {
  return 42;
}

/** TF별 구조 고저 lookback — 엔진 work cap과 맞춤. 1d 42봉이면 1번 고점(수개월 전)이 잘리고 우측 2번 고점만 잡힘 */
export function mergedDesk4hReferenceSwingChannelLookbackForTf(timeframe?: string): number {
  const tf = normalizeChartTimeframe(String(timeframe || ''));
  if (tf === '1d') return Math.max(480, mergedDesk4hReferenceBarCap(tf));
  if (tf === '1w') return Math.max(280, mergedDesk4hReferenceBarCap(tf));
  if (tf === '1M') return Math.max(180, mergedDesk4hReferenceBarCap(tf));
  if (tf === '4h') return Math.max(340, mergedDesk4hReferenceBarCap(tf));
  if (tf === '1h') return Math.max(320, mergedDesk4hReferenceBarCap(tf));
  return mergedDesk4hReferenceSwingChannelLookback();
}

/** 스윙 피벗 L/R (15m 공동) */
export function mergedDesk4hReferencePivotWindow(): { L: number; R: number } {
  return { L: 2, R: 2 };
}

/** @deprecated — 전 TF L/R=2 통일. 하위 호환 alias */
export function mergedDesk4hReferencePivotWindowHtf(): { L: number; R: number } {
  return mergedDesk4hReferencePivotWindow();
}

/** 전 TF 동일 피벗 창 (15m L/R=2) */
export function mergedDesk4hReferencePivotWindowForTf(_timeframe?: string): { L: number; R: number } {
  return mergedDesk4hReferencePivotWindow();
}

/** 스윙 TF — 15m 공동 경로로 전 TF 분석 */
export function isMergedDesk4hReferenceSwingTf(timeframe: string): boolean {
  return isMergedDeskChartTimeframe(timeframe);
}
