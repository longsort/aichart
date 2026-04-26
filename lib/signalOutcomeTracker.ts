import type { Candle } from '@/types';

export type TrackedOpenSignal = {
  id: string;
  clientId: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  signalBarTime: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  createdAtMs: number;
};

export type TrackedSettledSignal = TrackedOpenSignal & {
  outcome: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'OPEN';
  barsToOutcome: number | null;
  settledAtMs: number;
};

function horizonForTimeframe(timeframe: string): number {
  if (timeframe === '1m' || timeframe === '3m' || timeframe === '5m') return 120;
  if (timeframe === '15m' || timeframe === '1h') return 90;
  if (timeframe === '4h') return 72;
  if (timeframe === '1d') return 40;
  if (timeframe === '1w') return 20;
  if (timeframe === '1M') return 12;
  return 80;
}

export function makeOpenSignalId(symbol: string, timeframe: string, signalBarTime: number, direction: string): string {
  return `${symbol}|${timeframe}|${signalBarTime}|${direction}`;
}

/** signalLearning과 동일: 선행 봉 이후 horizon 내 TP/SL 판정, 동일 봉이면 SL 우선 */
export function trySettleOpen(
  open: TrackedOpenSignal,
  candles: Candle[],
  timeframe: string,
  settledAtMs: number
): { settled: TrackedSettledSignal } | { stillOpen: TrackedOpenSignal } {
  const byTime = new Map<number, number>();
  candles.forEach((c, i) => byTime.set(c.time, i));
  const idx = byTime.get(open.signalBarTime);
  if (idx == null || idx < 0 || idx >= candles.length - 2) {
    return { stillOpen: open };
  }
  const horizon = horizonForTimeframe(timeframe);
  const { direction: p, stopLoss: stopLossPx, tp1: tp1x, tp2: tp2x, tp3: tp3x } = open;
  let outcome: TrackedSettledSignal['outcome'] = 'OPEN';
  let barsToOutcome: number | null = null;
  for (let j = idx + 1; j < Math.min(candles.length, idx + 1 + horizon); j++) {
    const f = candles[j];
    const hitSl = p === 'LONG' ? f.low <= stopLossPx : f.high >= stopLossPx;
    const hitTp1 = p === 'LONG' ? f.high >= tp1x : f.low <= tp1x;
    const hitTp2 = p === 'LONG' ? f.high >= tp2x : f.low <= tp2x;
    const hitTp3 = p === 'LONG' ? f.high >= tp3x : f.low <= tp3x;
    if (hitSl) {
      outcome = 'SL';
      barsToOutcome = j - idx;
      break;
    }
    if (hitTp3) {
      outcome = 'TP3';
      barsToOutcome = j - idx;
      break;
    }
    if (hitTp2) {
      outcome = 'TP2';
      barsToOutcome = j - idx;
      break;
    }
    if (hitTp1) {
      outcome = 'TP1';
      barsToOutcome = j - idx;
      break;
    }
  }
  if (outcome === 'OPEN') {
    return { stillOpen: open };
  }
  return {
    settled: {
      ...open,
      outcome,
      barsToOutcome,
      settledAtMs,
    },
  };
}

export function settleOpensForKey(
  opens: TrackedOpenSignal[],
  candles: Candle[],
  symbol: string,
  timeframe: string,
  settledAtMs: number
): { remaining: TrackedOpenSignal[]; settled: TrackedSettledSignal[] } {
  const remaining: TrackedOpenSignal[] = [];
  const settled: TrackedSettledSignal[] = [];
  for (const o of opens) {
    if (o.symbol !== symbol || o.timeframe !== timeframe) {
      remaining.push(o);
      continue;
    }
    const r = trySettleOpen(o, candles, timeframe, settledAtMs);
    if ('settled' in r) settled.push(r.settled);
    else remaining.push(r.stillOpen);
  }
  return { remaining, settled };
}
