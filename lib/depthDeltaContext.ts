import type { Candle } from '@/types';

export type DepthDeltaRegime = 'buy' | 'sell' | 'neutral';

export type DepthDeltaContext = {
  latestPct: number;
  smoothedPct: number;
  regime: DepthDeltaRegime;
  persistenceBars: number;
  flip: 'up' | 'down' | 'none';
  strength: number;
  trapLong: boolean;
  trapShort: boolean;
  seriesPct: number[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function ema(values: number[], len: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (len + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * alpha + out[i - 1] * (1 - alpha));
  }
  return out;
}

function candleDeltaPct(c: Candle): number {
  const vol = Math.max(1e-9, c.volume || 0);
  if (typeof c.takerBuyBaseVolume === 'number' && Number.isFinite(c.takerBuyBaseVolume) && c.takerBuyBaseVolume >= 0) {
    const buy = c.takerBuyBaseVolume;
    const sell = Math.max(0, vol - buy);
    return clamp(((buy - sell) / vol) * 100, -100, 100);
  }
  const body = c.close - c.open;
  const span = Math.max(1e-9, c.high - c.low);
  return clamp((body / span) * 55, -55, 55);
}

export function computeDepthDeltaContext(
  candles: Candle[],
  options?: { breakoutLevel?: number | null; invalidationLevel?: number | null }
): DepthDeltaContext | null {
  if (!candles.length) return null;
  const raw = candles.map(candleDeltaPct);
  const smooth = ema(raw, 5);
  const latestPct = raw[raw.length - 1] ?? 0;
  const smoothedPct = smooth[smooth.length - 1] ?? latestPct;
  const prevSmooth = smooth[Math.max(0, smooth.length - 2)] ?? smoothedPct;
  const regime: DepthDeltaRegime = smoothedPct >= 8 ? 'buy' : smoothedPct <= -8 ? 'sell' : 'neutral';

  let persistenceBars = 0;
  for (let i = smooth.length - 1; i >= 0; i--) {
    const v = smooth[i];
    const r: DepthDeltaRegime = v >= 8 ? 'buy' : v <= -8 ? 'sell' : 'neutral';
    if (r !== regime) break;
    persistenceBars += 1;
  }

  const flip: 'up' | 'down' | 'none' =
    prevSmooth < -4 && smoothedPct > 4 ? 'up' : prevSmooth > 4 && smoothedPct < -4 ? 'down' : 'none';
  const strength = clamp((Math.abs(smoothedPct) / 35) * (0.55 + Math.min(0.45, persistenceBars / 10)), 0, 1);

  const close = candles[candles.length - 1]?.close ?? 0;
  const breakout = options?.breakoutLevel ?? null;
  const invalidation = options?.invalidationLevel ?? null;
  const trapLong = breakout != null && close > breakout && smoothedPct <= -8;
  const trapShort = invalidation != null && close < invalidation && smoothedPct >= 8;

  return {
    latestPct: Math.round(latestPct * 100) / 100,
    smoothedPct: Math.round(smoothedPct * 100) / 100,
    regime,
    persistenceBars,
    flip,
    strength: Math.round(strength * 1000) / 1000,
    trapLong,
    trapShort,
    seriesPct: raw.slice(-32).map((v) => Math.round(v * 100) / 100),
  };
}
