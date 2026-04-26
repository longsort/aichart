import type { Candle } from '@/types';
import type { SwingPoint } from '@/engine/types';

export function detectSwings(candles: Candle[], left = 3, right = 3): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ type: 'high', index: i, price: c.high });
    if (isLow) out.push({ type: 'low', index: i, price: c.low });
  }
  return out;
}

export function nearestSwingLevels(swings: SwingPoint[], currentPrice: number) {
  const highs = swings.filter((s) => s.type === 'high' && s.price >= currentPrice).sort((a, b) => a.price - b.price);
  const lows = swings.filter((s) => s.type === 'low' && s.price <= currentPrice).sort((a, b) => b.price - a.price);
  return {
    resistance: highs[0]?.price ?? null,
    support: lows[0]?.price ?? null,
  };
}
