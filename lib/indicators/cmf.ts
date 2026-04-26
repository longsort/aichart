import type { Candle } from '@/types';

/** Chaikin Money Flow 마지막 값 (기간 n, 일반적으로 20) */
export function computeCmfLast(candles: Candle[], period = 20): number | null {
  if (!candles.length || candles.length < period) return null;
  let adSum = 0;
  let volSum = 0;
  const start = candles.length - period;
  for (let j = start; j < candles.length; j += 1) {
    const c = candles[j];
    const high = c.high;
    const low = c.low;
    const close = c.close;
    const range = high - low;
    const mfm = range < 1e-12 ? 0 : (close - low - (high - close)) / range;
    const mfv = mfm * (c.volume || 0);
    adSum += mfv;
    volSum += c.volume || 0;
  }
  if (volSum <= 0) return null;
  return adSum / volSum;
}
