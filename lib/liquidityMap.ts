import type { Candle } from '@/types';

export type LiquidityZone = {
  type: 'eqh' | 'eql' | 'pool' | 'stopHunt' | 'sweep' | 'above' | 'below';
  price: number;
  strength: number;
  label: string;
};

function pivotHigh(candles: Candle[], i: number, left = 2, right = 2): boolean {
  if (i - left < 0 || i + right >= candles.length) return false;
  const v = candles[i].high;
  for (let j = i - left; j <= i + right; j++) if (j !== i && candles[j].high >= v) return false;
  return true;
}
function pivotLow(candles: Candle[], i: number, left = 2, right = 2): boolean {
  if (i - left < 0 || i + right >= candles.length) return false;
  const v = candles[i].low;
  for (let j = i - left; j <= i + right; j++) if (j !== i && candles[j].low <= v) return false;
  return true;
}

export function buildLiquidityMap(candles: Candle[], visibleStart: number): LiquidityZone[] {
  const visible = candles.slice(visibleStart);
  if (visible.length < 10) return [];
  const zones: LiquidityZone[] = [];
  const highs: { index: number; price: number }[] = [];
  const lows: { index: number; price: number }[] = [];
  for (let i = 2; i < visible.length - 2; i++) {
    if (pivotHigh(visible, i)) highs.push({ index: i + visibleStart, price: visible[i].high });
    if (pivotLow(visible, i)) lows.push({ index: i + visibleStart, price: visible[i].low });
  }
  const tol = 0.0025;
  for (let i = 1; i < highs.length; i++) {
    const a = highs[i - 1], b = highs[i];
    if (Math.abs(a.price - b.price) / a.price <= tol) {
      zones.push({ type: 'eqh', price: (a.price + b.price) / 2, strength: 0.8, label: 'EQH' });
    }
  }
  for (let i = 1; i < lows.length; i++) {
    const a = lows[i - 1], b = lows[i];
    if (Math.abs(a.price - b.price) / a.price <= tol) {
      zones.push({ type: 'eql', price: (a.price + b.price) / 2, strength: 0.8, label: 'EQL' });
    }
  }
  const last = visible[visible.length - 1];
  zones.push({ type: 'above', price: last.high * 1.002, strength: 0.5, label: 'Above Liq' });
  zones.push({ type: 'below', price: last.low * 0.998, strength: 0.5, label: 'Below Liq' });
  return zones.slice(0, 12);
}
