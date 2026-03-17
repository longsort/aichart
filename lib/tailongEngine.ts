import type { Candle } from '@/types';

export type TailongLevel = {
  high: number;
  low: number;
  close: number;
  open: number;
  tf: string;
  verdict: 'long' | 'short' | 'neutral';
};

export type TailongResult = {
  tailongLevels: TailongLevel[];
  tailongSupport: number;
  tailongResistance: number;
  tailongBreakPrice: number;
  tailongBreakDirection: 'bullish' | 'bearish';
  tailongTailLevels?: Record<string, { entryLow: number; entryHigh: number }>;
};

const TF_ORDER: Record<string, number> = {
  '1m': 0, '3m': 1, '5m': 2, '15m': 3, '1h': 4, '4h': 5, '1d': 6, '1w': 7, '1M': 8, '1Y': 9
};

export function computeTailong(
  candles: Candle[],
  timeframe: string,
  verdict: 'LONG' | 'SHORT' | 'WATCH',
  trend: 'bullish' | 'bearish' | 'range'
): TailongResult {
  const visible = candles.slice(-Math.min(100, candles.length));
  if (visible.length === 0) {
    return {
      tailongLevels: [],
      tailongSupport: 0,
      tailongResistance: 0,
      tailongBreakPrice: 0,
      tailongBreakDirection: 'bullish',
    };
  }

  const last = visible[visible.length - 1];
  const recentHigh = Math.max(...visible.slice(-20).map(c => c.high));
  const recentLow = Math.min(...visible.slice(-20).map(c => c.low));
  const support = recentLow;
  const resistance = recentHigh;

  const verdictLower = verdict === 'LONG' ? 'long' : verdict === 'SHORT' ? 'short' : 'neutral';
  const tailongLevels: TailongLevel[] = [
    { high: last.high, low: last.low, close: last.close, open: last.open, tf: timeframe, verdict: verdictLower },
  ];
  if (visible.length >= 2) {
    const prev = visible[visible.length - 2];
    tailongLevels.unshift({
      high: prev.high,
      low: prev.low,
      close: prev.close,
      open: prev.open,
      tf: timeframe,
      verdict: prev.close >= prev.open ? 'long' : 'short',
    });
  }

  const breakDirection: 'bullish' | 'bearish' = verdict === 'LONG' || trend === 'bullish' ? 'bullish' : verdict === 'SHORT' || trend === 'bearish' ? 'bearish' : last.close >= last.open ? 'bullish' : 'bearish';
  const breakPrice = breakDirection === 'bullish' ? resistance : support;

  const bodyMid = (last.open + last.close) / 2;
  const entryLow = Math.min(last.open, last.close) - (last.high - last.low) * 0.1;
  const entryHigh = Math.max(last.open, last.close) + (last.high - last.low) * 0.1;
  const tailongTailLevels: Record<string, { entryLow: number; entryHigh: number }> = {
    [timeframe]: { entryLow, entryHigh },
  };

  return {
    tailongLevels,
    tailongSupport: support,
    tailongResistance: resistance,
    tailongBreakPrice: breakPrice,
    tailongBreakDirection: breakDirection,
    tailongTailLevels,
  };
}
