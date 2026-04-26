import type { Candle } from '@/types';
import type { StructureSnapshot, SwingPoint } from '@/engine/types';

export function deriveStructure(candles: Candle[], swings: SwingPoint[]): StructureSnapshot {
  const highs = swings.filter((s) => s.type === 'high').slice(-3);
  const lows = swings.filter((s) => s.type === 'low').slice(-3);
  const hhhl = highs.length >= 2 && lows.length >= 2 && highs[highs.length - 1].price > highs[highs.length - 2].price && lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lhll = highs.length >= 2 && lows.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price && lows[lows.length - 1].price < lows[lows.length - 2].price;
  const state: StructureSnapshot['state'] = hhhl ? 'trend_up' : lhll ? 'trend_down' : 'range';
  const bosUp = hhhl ? 1 : 0;
  const bosDown = lhll ? 1 : 0;
  const chochUp = lhll ? 0 : highs.length >= 2 && highs[highs.length - 1].price > highs[highs.length - 2].price ? 1 : 0;
  const chochDown = hhhl ? 0 : lows.length >= 2 && lows[lows.length - 1].price < lows[lows.length - 2].price ? 1 : 0;
  const c = candles[candles.length - 1];
  const h = Math.max(...candles.slice(-120).map((x) => x.high));
  const l = Math.min(...candles.slice(-120).map((x) => x.low));
  const eq = (h + l) / 2;
  const premiumDiscount: StructureSnapshot['premiumDiscount'] = c.close > eq ? 'premium' : c.close < eq ? 'discount' : 'equilibrium';
  return { state, hhhl, lhll, bosUp, bosDown, chochUp, chochDown, premiumDiscount };
}
