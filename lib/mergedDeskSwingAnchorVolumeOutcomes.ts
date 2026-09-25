/**
 * 스윙앵커 빅롱/빅숏 — N봉 후행 측정 (내부 보정용).
 * UI 승률·확정 수익 표현 금지.
 */
import type { Candle } from '@/types';
import type { SwingAnchorVolumeEvent } from '@/lib/mergedDeskSwingAnchorVolumeEvents';

export type SwingAnchorHorizonOutcome = {
  bars: number;
  closePct: number;
  mfePct: number;
  maePct: number;
  favorable: boolean;
  invalidated: boolean;
};

export type SwingAnchorEventWithOutcomes = SwingAnchorVolumeEvent & {
  outcomes: Record<string, SwingAnchorHorizonOutcome>;
};

const FAVORABLE_PCT = 0.18;

export function swingAnchorHorizonsForTf(timeframe: string): number[] {
  const map: Record<string, number[]> = {
    '1m': [12, 24, 48],
    '3m': [10, 20, 40],
    '5m': [8, 16, 32],
    '15m': [8, 13, 21],
    '1h': [6, 12, 21],
    '4h': [5, 8, 13],
    '1d': [4, 8, 13],
    '1w': [3, 6, 10],
    '1M': [2, 4, 6],
    '1Y': [2, 3, 4],
  };
  return map[timeframe] ?? [5, 8, 13];
}

export function computeSwingAnchorHorizonOutcome(
  candles: Candle[],
  ev: SwingAnchorVolumeEvent,
  horizon: number
): SwingAnchorHorizonOutcome | null {
  const n = candles.length;
  const i = ev.barIdx;
  if (i + horizon >= n) return null;
  const entry = Number(candles[i]!.close);
  if (!(entry > 0)) return null;

  let mfe = 0;
  let mae = 0;
  let invalidated = false;
  for (let j = i + 1; j <= i + horizon; j++) {
    const c = candles[j]!;
    const hi = Number(c.high);
    const lo = Number(c.low);
    if (ev.side === 'long') {
      mfe = Math.max(mfe, hi - entry);
      mae = Math.max(mae, entry - lo);
      if (lo < ev.anchorPrice) invalidated = true;
    } else {
      mfe = Math.max(mfe, entry - lo);
      mae = Math.max(mae, hi - entry);
      if (hi > ev.anchorPrice) invalidated = true;
    }
  }

  const closeAt = Number(candles[i + horizon]!.close);
  const closePct =
    ev.side === 'long'
      ? ((closeAt - entry) / entry) * 100
      : ((entry - closeAt) / entry) * 100;
  const mfePct = (mfe / entry) * 100;
  const maePct = (mae / entry) * 100;
  const favorable = !invalidated && closePct >= FAVORABLE_PCT && mfePct >= FAVORABLE_PCT;

  return { bars: horizon, closePct, mfePct, maePct, favorable, invalidated };
}

export function attachSwingAnchorOutcomes(
  candles: Candle[],
  events: SwingAnchorVolumeEvent[],
  horizons: number[]
): SwingAnchorEventWithOutcomes[] {
  return events.map((ev) => {
    const outcomes: Record<string, SwingAnchorHorizonOutcome> = {};
    for (const h of horizons) {
      const o = computeSwingAnchorHorizonOutcome(candles, ev, h);
      if (o) outcomes[`h${h}`] = o;
    }
    return { ...ev, outcomes };
  });
}
