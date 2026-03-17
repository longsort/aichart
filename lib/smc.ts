import { Candle } from '@/types';

export type SLHunt = { index: number; price: number; side: 'buy' | 'sell' };
export type FalseBreakout = { index: number; price: number; side: 'up' | 'down' };
export type PO3Phase = 'accumulation' | 'manipulation' | 'distribution' | null;
export type SDBaseType = 'reversal' | 'continuation';

export function detectSLHunt(
  candles: Candle[],
  swingHighs: Array<{ index: number; price: number }>,
  swingLows: Array<{ index: number; price: number }>,
  tol = 0.003
): SLHunt[] {
  const hits: SLHunt[] = [];
  for (const sh of swingHighs.slice(-5)) {
    for (let j = sh.index + 1; j < Math.min(sh.index + 12, candles.length); j++) {
      const c = candles[j];
      if (c.high > sh.price * (1 + tol) && c.close < sh.price * (1 - tol * 0.5)) {
        hits.push({ index: j, price: c.high, side: 'buy' });
        break;
      }
    }
  }
  for (const sl of swingLows.slice(-5)) {
    for (let j = sl.index + 1; j < Math.min(sl.index + 12, candles.length); j++) {
      const c = candles[j];
      if (c.low < sl.price * (1 - tol) && c.close > sl.price * (1 + tol * 0.5)) {
        hits.push({ index: j, price: c.low, side: 'sell' });
        break;
      }
    }
  }
  return hits.slice(-3);
}

export function detectFalseBreakout(
  candles: Candle[],
  rangeHigh: number,
  rangeLow: number,
  lookback = 20
): FalseBreakout[] {
  const hits: FalseBreakout[] = [];
  if (candles.length < lookback + 10) return hits;
  const recent = candles.slice(-lookback - 10);
  const rH = Math.max(...recent.map(c => c.high));
  const rL = Math.min(...recent.map(c => c.low));
  for (let i = lookback; i < recent.length - 3; i++) {
    const c = recent[i];
    if (c.close > rH * 1.001 && recent[i + 1].close < rH * 0.998 && recent[i + 2].close < rH) {
      hits.push({ index: candles.length - recent.length + i, price: c.high, side: 'up' });
    }
    if (c.close < rL * 0.999 && recent[i + 1].close > rL * 1.002 && recent[i + 2].close > rL) {
      hits.push({ index: candles.length - recent.length + i, price: c.low, side: 'down' });
    }
  }
  return hits.slice(-2);
}

export function detectPO3Phase(candles: Candle[], window = 30): PO3Phase {
  if (candles.length < window * 2) return null;
  const mid = candles.length - window;
  const first = candles.slice(mid - window, mid);
  const second = candles.slice(mid);
  const firstRange = Math.max(...first.map(c => c.high)) - Math.min(...first.map(c => c.low));
  const secondRange = Math.max(...second.map(c => c.high)) - Math.min(...second.map(c => c.low));
  const firstTrend = (first[first.length - 1].close - first[0].open) / first[0].open;
  const secondTrend = (second[second.length - 1].close - second[0].open) / second[0].open;
  const avgCandle = first.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / first.length;
  const rangeRatio = firstRange / (avgCandle || 1);
  if (rangeRatio < 3 && Math.abs(firstTrend) < 0.02) return 'accumulation';
  if (firstTrend * secondTrend < -0.01 && Math.abs(secondTrend) > 0.015) return 'manipulation';
  if (Math.abs(secondTrend) > 0.02 && secondRange > firstRange * 0.5) return 'distribution';
  return null;
}

export function isKillZone(candleTime: number): boolean {
  const d = new Date(candleTime * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const utcMin = h * 60 + m;
  const londonOpen = 8 * 60;
  const nyOpen = 13 * 60;
  const londonNyOverlap = 16 * 60;
  return (utcMin >= londonOpen && utcMin <= londonOpen + 120) ||
    (utcMin >= nyOpen && utcMin <= nyOpen + 120) ||
    (utcMin >= 13 * 60 && utcMin <= londonNyOverlap);
}

export function candlePatterns(candles: Candle[]): Array<{ index: number; label: string; bias: 'bullish' | 'bearish' }> {
  const out: Array<{ index: number; label: string; bias: 'bullish' | 'bearish' }> = [];
  const body = (c: Candle) => Math.abs(c.close - c.open);
  const range = (c: Candle) => c.high - c.low || 0.0001;
  const upperWick = (c: Candle) => c.high - Math.max(c.open, c.close);
  const lowerWick = (c: Candle) => Math.min(c.open, c.close) - c.low;

  for (let i = 1; i < candles.length - 1; i++) {
    const c0 = candles[i - 1];
    const c1 = candles[i];
    const c2 = candles[i + 1];
    const b1 = body(c1);
    const r1 = range(c1);

    const bullEngulf = c1.close > c1.open && c0.close < c0.open && c1.open <= c0.close && c1.close >= c0.open && b1 > body(c0);
    const bearEngulf = c1.close < c1.open && c0.close > c0.open && c1.open >= c0.close && c1.close <= c0.open && b1 > body(c0);
    if (bullEngulf && c2.close > c2.open && c2.close > c1.close) {
      out.push({ index: i + 1, label: 'Three Outside Up', bias: 'bullish' });
    } else if (bullEngulf) {
      out.push({ index: i, label: 'Bullish Engulfing', bias: 'bullish' });
    }
    if (bearEngulf) out.push({ index: i, label: 'Bearish Engulfing', bias: 'bearish' });

    const doji = b1 < r1 * 0.1;
    const hammer = lowerWick(c1) > b1 * 2 && upperWick(c1) < b1 * 0.5 && r1 > 0;
    const shootingStar = upperWick(c1) > b1 * 2 && lowerWick(c1) < b1 * 0.5 && r1 > 0;
    if (doji) out.push({ index: i, label: 'Doji', bias: 'bullish' });
    if (hammer && c1.close > c1.open) out.push({ index: i, label: 'Hammer', bias: 'bullish' });
    if (hammer && c1.close < c1.open) out.push({ index: i, label: 'Hanging Man', bias: 'bearish' });
    if (shootingStar) out.push({ index: i, label: 'Shooting Star', bias: 'bearish' });
  }
  return out.slice(-8);
}
