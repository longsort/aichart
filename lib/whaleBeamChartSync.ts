/**
 * CSV/API 고래 신호 → 차트 캔들 시간 동기화 (인덱스 불일치 방지)
 */
import type { Candle } from '@/types';
import type { WhaleSegmentVolumeSignal } from '@/lib/whaleVolumeSegmentSignals';

function idxForTime(candles: Candle[], t: number): number {
  const n = candles.length;
  if (n === 0) return -1;
  for (let i = n - 1; i >= 0; i--) {
    const ct = Number(candles[i]!.time);
    if (ct === t) return i;
    if (ct < t) return i;
  }
  return 0;
}

function idxRangeForTimes(candles: Candle[], tFrom: number, tTo: number): { from: number; to: number } {
  const a = idxForTime(candles, tFrom);
  const b = idxForTime(candles, tTo);
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** API/CSV 인덱스 → 현재 차트 candles 기준으로 재매핑 */
export function syncWhaleSignalsToChart(
  signals: WhaleSegmentVolumeSignal[],
  candles: Candle[]
): WhaleSegmentVolumeSignal[] {
  if (!candles.length || !signals.length) return signals;

  return signals.map((s) => {
    const volIdx = idxForTime(candles, Number(s.timeVol));
    const fromIdx = idxForTime(candles, Number(s.timeFrom));
    const toIdx = idxForTime(candles, Number(s.timeTo));
    const boxTo = s.timeBoxTo != null ? idxForTime(candles, Number(s.timeBoxTo)) : toIdx;
    const vFrom = s.timeVolFrom != null ? idxForTime(candles, Number(s.timeVolFrom)) : volIdx;
    const vTo = s.timeVolTo != null ? idxForTime(candles, Number(s.timeVolTo)) : volIdx;
    const rg = idxRangeForTimes(candles, Number(s.timeVolFrom ?? s.timeFrom), Number(s.timeVolTo ?? s.timeTo));

    return {
      ...s,
      fromIdx: Math.max(0, fromIdx),
      toIdx: Math.max(0, toIdx),
      volIdx: Math.max(0, volIdx),
      volClusterFromIdx: Math.max(0, rg.from),
      volClusterToIdx: Math.max(0, rg.to),
      timeBoxTo: s.timeBoxTo ?? s.timeTo,
    };
  });
}

export function thinWhaleSignalsByChartTime(
  signals: WhaleSegmentVolumeSignal[],
  candles: Candle[],
  opts?: { maxPast?: number; minBarGap?: number; liveClearance?: number }
): WhaleSegmentVolumeSignal[] {
  const maxPast = opts?.maxPast ?? 3;
  const minBarGap = opts?.minBarGap ?? 10;
  const liveClearance = opts?.liveClearance ?? 8;
  if (!candles.length) return signals;

  const lastT = Number(candles[candles.length - 1]!.time);
  const clearanceT =
    candles.length > liveClearance
      ? Number(candles[candles.length - 1 - liveClearance]!.time)
      : 0;

  const live = signals.filter((s) => s.isLive).sort((a, b) => b.strength - a.strength);
  const past = signals
    .filter((s) => !s.isLive && Number(s.timeTo) < clearanceT)
    .sort((a, b) => b.strength - a.strength || Number(b.timeTo) - Number(a.timeTo));

  const bestLive = live[0] ?? null;
  const pickedPast: WhaleSegmentVolumeSignal[] = [];
  for (const s of past) {
    if (pickedPast.length >= maxPast) break;
    const tooClose = pickedPast.some(
      (p) => Math.abs(p.volIdx - s.volIdx) < minBarGap
    );
    if (tooClose) continue;
    pickedPast.push(s);
  }
  const out = bestLive ? [bestLive, ...pickedPast] : pickedPast;
  return out.sort((a, b) => Number(a.timeFrom) - Number(b.timeFrom));
}
