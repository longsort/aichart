import type { Candle } from '@/types';
import type { CandleScore } from '@/engine/types';

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function stdev(nums: number[], mu: number): number {
  if (!nums.length) return 1;
  const v = nums.reduce((s, x) => s + (x - mu) * (x - mu), 0) / nums.length;
  return Math.sqrt(v) || 1;
}

export function scoreCandles(candles: Candle[], lookback = 120): CandleScore[] {
  const arr = candles.slice(-Math.max(20, lookback));
  const out: CandleScore[] = [];
  const vols = arr.map((x) => Number(x.volume || 0));
  const volMu = mean(vols);
  const volSigma = stdev(vols, volMu);
  for (let i = 2; i < arr.length; i++) {
    const c = arr[i];
    const prev = arr[i - 1];
    const range = Math.max(1e-9, c.high - c.low);
    const body = Math.abs(c.close - c.open);
    const bullish = c.close >= c.open;
    const bodyPct = body / range;
    const upperWickPct = (c.high - Math.max(c.open, c.close)) / range;
    const lowerWickPct = (Math.min(c.open, c.close) - c.low) / range;
    const closeNearHigh = (c.high - c.close) / range <= 0.2;
    const closeNearLow = (c.close - c.low) / range <= 0.2;
    const longBody = bodyPct >= 0.65;
    const hammer = lowerWickPct >= 0.45 && bodyPct <= 0.35 && bullish;
    const invertedHammer = upperWickPct >= 0.45 && bodyPct <= 0.35 && !bullish;
    const engulfing =
      bullish
        ? prev.close < prev.open && c.open <= prev.close && c.close >= prev.open
        : prev.close > prev.open && c.open >= prev.close && c.close <= prev.open;
    const breakoutCandle = bullish ? c.close > prev.high : c.close < prev.low;
    const failedBreakCandle = bullish ? c.high > prev.high && c.close <= prev.high : c.low < prev.low && c.close >= prev.low;
    const sweepSuspect = upperWickPct >= 0.4 || lowerWickPct >= 0.4;
    const v0 = Number(arr[i - 2].volume || 0);
    const v1 = Number(arr[i - 1].volume || 0);
    const v2 = Number(c.volume || 0);
    const volumeZ = (v2 - volMu) / Math.max(1e-9, volSigma);
    const volumeTrend3 = v2 - v1 + (v1 - v0) * 0.5;
    const volumeConfirmed = volumeZ >= 0.45 || (v2 > v1 && v1 > v0);

    let score = 50;
    if (longBody) score += 12;
    if (closeNearHigh && bullish) score += 10;
    if (closeNearLow && !bullish) score += 10;
    if (engulfing) score += 8;
    if (breakoutCandle) score += 8;
    if (failedBreakCandle) score -= 8;
    if (sweepSuspect) score += 4;
    if (hammer || invertedHammer) score += 5;
    if (volumeZ >= 0.6) score += 8;
    else if (volumeZ >= 0.25) score += 4;
    if (!volumeConfirmed) score -= 10;
    score = clamp(score);
    const strength = score >= 75 && volumeConfirmed ? 'strong' : score >= 55 ? 'normal' : 'weak';

    out.push({
      index: candles.length - arr.length + i,
      bullish,
      bodyPct,
      upperWickPct,
      lowerWickPct,
      closeNearHigh,
      closeNearLow,
      longBody,
      hammer,
      invertedHammer,
      engulfing,
      breakoutCandle,
      failedBreakCandle,
      sweepSuspect,
      volumeZ,
      volumeTrend3,
      volumeConfirmed,
      strength,
      score,
    });
  }
  return out;
}
