/**
 * 신호 기록부 — N봉 후 결과(MFE/MAE·방향 적중) 계산.
 * 조건부 표본·검증용 — 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';

export const OUTCOME_BAR_HORIZONS = [1, 3, 5, 12, 24] as const;
export type OutcomeHorizon = (typeof OUTCOME_BAR_HORIZONS)[number];

export type SignalOutcomeSnapshot = {
  bars: OutcomeHorizon;
  closeDeltaPct: number;
  maxUpPct: number;
  maxDownPct: number;
  directionHit: boolean;
  hitTp: boolean;
  hitSl: boolean;
};

export function createSignalId(): string {
  return `sig-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function outcomeKindForHorizon(bars: OutcomeHorizon): `OUTCOME_${OutcomeHorizon}` {
  return `OUTCOME_${bars}`;
}

export function findCandleIndexByTime(candles: Candle[], candleTime: number): number {
  const t = Number(candleTime);
  if (!(t > 0)) return -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (Number(candles[i]!.time) === t) return i;
  }
  return -1;
}

export function candleTouchesZone(last: Candle | null | undefined, lower: number, upper: number): boolean {
  if (!last) return false;
  const lo = Number(last.low);
  const hi = Number(last.high);
  const zLo = Math.min(lower, upper);
  const zHi = Math.max(lower, upper);
  if (![lo, hi, zLo, zHi].every((x) => Number.isFinite(x))) return false;
  return lo <= zHi && hi >= zLo;
}

/** anchor 봉 이후 bars봉까지 전방 결과 */
export function computeForwardOutcome(params: {
  candles: Candle[];
  anchorIdx: number;
  anchorPrice: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  bars: OutcomeHorizon;
  tpPrice?: number;
  slPrice?: number;
}): SignalOutcomeSnapshot | null {
  const { candles, anchorIdx, anchorPrice, direction, bars } = params;
  if (anchorIdx < 0 || anchorIdx >= candles.length) return null;
  if (!(anchorPrice > 0)) return null;
  const endIdx = anchorIdx + bars;
  if (endIdx >= candles.length) return null;

  let maxUpPct = 0;
  let maxDownPct = 0;
  let hitTp = false;
  let hitSl = false;
  const tp = params.tpPrice;
  const sl = params.slPrice;

  for (let i = anchorIdx + 1; i <= endIdx; i++) {
    const c = candles[i]!;
    const hi = Number(c.high);
    const lo = Number(c.low);
    if (Number.isFinite(hi)) {
      maxUpPct = Math.max(maxUpPct, ((hi - anchorPrice) / anchorPrice) * 100);
    }
    if (Number.isFinite(lo)) {
      maxDownPct = Math.max(maxDownPct, ((anchorPrice - lo) / anchorPrice) * 100);
    }
    if (tp != null && Number.isFinite(tp)) {
      if (direction === 'LONG' && hi >= tp) hitTp = true;
      if (direction === 'SHORT' && lo <= tp) hitTp = true;
    }
    if (sl != null && Number.isFinite(sl)) {
      if (direction === 'LONG' && lo <= sl) hitSl = true;
      if (direction === 'SHORT' && hi >= sl) hitSl = true;
    }
  }

  const closeEnd = Number(candles[endIdx]!.close);
  const closeDeltaPct = Number.isFinite(closeEnd)
    ? ((closeEnd - anchorPrice) / anchorPrice) * 100
    : 0;

  let directionHit = false;
  if (direction === 'LONG') directionHit = closeDeltaPct > 0;
  else if (direction === 'SHORT') directionHit = closeDeltaPct < 0;

  return {
    bars,
    closeDeltaPct,
    maxUpPct,
    maxDownPct,
    directionHit,
    hitTp,
    hitSl,
  };
}
