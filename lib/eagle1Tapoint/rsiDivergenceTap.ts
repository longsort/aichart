/**
 * §20 RSI / DIVERGENCE — 단독 진입 신호 금지.
 */
import { computeDivergenceSignal } from '@/lib/divergenceSignalEngine';
import { rsi } from '@/lib/indicators';
import type { Candle } from '@/types';

export type TapRsiDivSnap = {
  rsi: number | null;
  overbought: boolean;
  oversold: boolean;
  slopeKo: string;
  divergence: 'BULLISH' | 'BEARISH' | 'NONE';
  verdict: string;
  scoreBoost: number;
  aloneEntryForbidden: true;
  chaseWarn: boolean;
  noteKo: string;
};

function roughSwings(candles: Candle[]) {
  const highs: Array<{ index: number; price: number }> = [];
  const lows: Array<{ index: number; price: number }> = [];
  const L = 3;
  for (let i = L; i + L < candles.length; i++) {
    let isH = true;
    let isL = true;
    for (let k = i - L; k <= i + L; k++) {
      if (k === i) continue;
      if (candles[k]!.high >= candles[i]!.high) isH = false;
      if (candles[k]!.low <= candles[i]!.low) isL = false;
    }
    if (isH) highs.push({ index: i, price: candles[i]!.high });
    if (isL) lows.push({ index: i, price: candles[i]!.low });
  }
  return { highs: highs.slice(-12), lows: lows.slice(-12) };
}

export function buildTapRsiDivSnap(params: {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  timeframe?: string;
  direction?: 'LONG' | 'SHORT' | null;
  location?: string | null;
}): TapRsiDivSnap {
  const empty: TapRsiDivSnap = {
    rsi: null,
    overbought: false,
    oversold: false,
    slopeKo: '—',
    divergence: 'NONE',
    verdict: 'NONE',
    scoreBoost: 0,
    aloneEntryForbidden: true,
    chaseWarn: false,
    noteKo: 'RSI 데이터부족',
  };
  const bars = params.candles || [];
  if (bars.length < 30) return empty;

  const asCandle = bars.map((c) => ({
    time: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume) || 0,
  })) as Candle[];

  let rsiV: number | null = null;
  let slopeKo = '평';
  try {
    const series = rsi(asCandle, 14);
    const a = series[series.length - 1];
    const b = series[series.length - 4];
    rsiV = Number.isFinite(a) ? Number(a) : null;
    if (rsiV != null && Number.isFinite(b)) {
      if (a! - b! > 3) slopeKo = '상승';
      else if (b! - a! > 3) slopeKo = '하락';
    }
  } catch {
    /* */
  }

  const swings = roughSwings(asCandle);
  const last = asCandle[asCandle.length - 1]!;
  let divergence: TapRsiDivSnap['divergence'] = 'NONE';
  let verdict = 'NONE';
  try {
    const div = computeDivergenceSignal({
      candles: asCandle,
      swingHighs: swings.highs,
      swingLows: swings.lows,
      supportLevel: swings.lows.length
        ? { price: swings.lows[swings.lows.length - 1]!.price }
        : null,
      resistanceLevel: swings.highs.length
        ? { price: swings.highs[swings.highs.length - 1]!.price }
        : null,
      trend: 'range',
      timeframe: params.timeframe || '15m',
    });
    verdict = String(div.verdict || 'NONE');
    if (div.divergence?.bullish) divergence = 'BULLISH';
    else if (div.divergence?.bearish) divergence = 'BEARISH';
  } catch {
    /* */
  }

  const overbought = rsiV != null && rsiV >= 70;
  const oversold = rsiV != null && rsiV <= 30;

  let scoreBoost = 0;
  if (divergence === 'BULLISH' && params.direction === 'LONG') scoreBoost += 8;
  if (divergence === 'BEARISH' && params.direction === 'SHORT') scoreBoost += 8;
  if (divergence === 'BULLISH' && params.direction === 'SHORT') scoreBoost -= 10;
  if (divergence === 'BEARISH' && params.direction === 'LONG') scoreBoost -= 10;

  const loc = String(params.location || '');
  const chaseWarn =
    (params.direction === 'LONG' && overbought && (loc === 'PREMIUM' || loc === 'UNKNOWN')) ||
    (params.direction === 'SHORT' && oversold && (loc === 'DISCOUNT' || loc === 'UNKNOWN'));
  if (chaseWarn) scoreBoost -= 12;

  void last;
  const noteKo = [
    rsiV != null ? `RSI${Math.round(rsiV)}` : null,
    overbought ? '과매수' : oversold ? '과매도' : null,
    `기울기${slopeKo}`,
    divergence !== 'NONE' ? `다이버${divergence}` : '다이버없음',
    chaseWarn ? '추격주의' : null,
    'RSI단독진입금지',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    rsi: rsiV,
    overbought,
    oversold,
    slopeKo,
    divergence,
    verdict,
    scoreBoost,
    aloneEntryForbidden: true,
    chaseWarn,
    noteKo,
  };
}
