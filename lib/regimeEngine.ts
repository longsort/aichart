import type { Candle } from '@/types';

export type RegimeType =
  | 'trend_up'
  | 'trend_down'
  | 'range'
  | 'squeeze'
  | 'high_volatility'
  | 'low_volatility';

export type RegimeResult = {
  regime: RegimeType;
  volatilityState: 'high' | 'low' | 'normal';
  trendState: 'up' | 'down' | 'side';
  reason: string[];
};

function atr(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}

function slope(candles: Candle[], lookback: number): number {
  if (candles.length < lookback) return 0;
  const slice = candles.slice(-lookback);
  const closes = slice.map(c => c.close);
  const n = closes.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += closes[i];
    sumXY += i * closes[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX || 1;
  return (n * sumXY - sumX * sumY) / denom;
}

/** 시장 상태 분류: 캔들 구조·변동성·추세·스윕·거래량 기반 */
export function computeRegime(
  candles: Candle[],
  options?: {
    trend?: 'bullish' | 'bearish' | 'range';
    swingHighs?: number;
    swingLows?: number;
  }
): RegimeResult {
  const visible = candles.slice(-Math.min(200, candles.length));
  const reason: string[] = [];
  if (visible.length < 20) {
    return { regime: 'range', volatilityState: 'normal', trendState: 'side', reason: ['데이터 부족'] };
  }

  const atr14 = atr(visible, 14);
  const atr50 = atr(visible, 50);
  const avgPrice = visible.reduce((s, c) => s + c.close, 0) / visible.length;
  const volRatio = atr50 > 0 ? atr14 / atr50 : 1;
  const slp = slope(visible, 30);
  const trend = options?.trend ?? (slp > avgPrice * 0.0005 ? 'bullish' : slp < -avgPrice * 0.0005 ? 'bearish' : 'range');

  let volatilityState: 'high' | 'low' | 'normal' = 'normal';
  if (volRatio > 1.25) {
    volatilityState = 'high';
    reason.push('변동성 확대');
  } else if (volRatio < 0.75) {
    volatilityState = 'low';
    reason.push('변동성 수축');
  }

  let trendState: 'up' | 'down' | 'side' = 'side';
  if (trend === 'bullish') {
    trendState = 'up';
    reason.push('추세 상승');
  } else if (trend === 'bearish') {
    trendState = 'down';
    reason.push('추세 하락');
  } else {
    reason.push('횡보');
  }

  let regime: RegimeType = 'range';
  if (volatilityState === 'low' && (trend === 'bullish' || trend === 'bearish')) {
    regime = 'squeeze';
    reason.push('스퀴즈 구간');
  } else if (volatilityState === 'high') {
    regime = 'high_volatility';
  } else if (volatilityState === 'low') {
    regime = 'low_volatility';
  } else if (trend === 'bullish') {
    regime = 'trend_up';
  } else if (trend === 'bearish') {
    regime = 'trend_down';
  } else {
    regime = 'range';
  }

  return { regime, volatilityState, trendState, reason };
}
