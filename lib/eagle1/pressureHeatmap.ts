/**
 * Per-bar flow heatmap. Not a probability.
 * Historical book OFI does not exist → never fabricate it.
 * Live CVD/orderbook only boosts the last bar when flags say so.
 */
import type { Eagle1Bar } from './structureEngine';
import type { Eagle1MoneyPressureLive } from './moneyPressureBand';

export type HeatSource = 'taker' | 'body' | 'live-cvd' | 'live-book';

export type HeatBar = {
  time: number;
  score: number;
  source: HeatSource;
};

function clamp1(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

export function buildPressureHeat(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  live?: Eagle1MoneyPressureLive | null;
}): HeatBar[] {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const prefix = params.candles.slice(0, n).slice(-64);
  const out: HeatBar[] = [];
  for (let i = 0; i < prefix.length; i++) {
    const b = prefix[i]!;
    const t = Number(b.time) || 0;
    if (!(t > 0)) continue;
    const vol = Number(b.volume) || 0;
    let score = 0;
    let source: HeatSource = 'body';
    if (vol > 0 && b.takerBuyBaseVolume != null && Number.isFinite(b.takerBuyBaseVolume)) {
      score = (b.takerBuyBaseVolume / vol) * 2 - 1;
      source = 'taker';
    } else {
      const range = Math.max(b.high - b.low, 1e-9);
      score = ((b.close - b.open) / range) * 0.65;
      source = 'body';
    }
    const last = i === prefix.length - 1;
    if (last && params.live?.has_cvd && typeof params.live.volumeDelta === 'number') {
      score = clamp1(score * 0.55 + Math.tanh(params.live.volumeDelta / 8) * 0.45);
      source = 'live-cvd';
    } else if (last && params.live?.has_orderbook && typeof params.live.orderbookImbalance === 'number') {
      score = clamp1(score * 0.7 + params.live.orderbookImbalance * 0.3);
      source = 'live-book';
    }
    out.push({ time: t, score: clamp1(score), source });
  }
  return out;
}

export function heatBarPaint(score: number): { fill: string; opacity: number } {
  const abs = Math.abs(score);
  return {
    fill: score >= 0 ? '#22c55e' : '#ef4444',
    /** Phase 20: 낮게 — 캔들 가림 방지 (HUD strip에서 추가 클램프) */
    opacity: 0.04 + Math.min(0.18, abs * 0.18),
  };
}

export function heatBarRgba(score: number): string {
  const p = heatBarPaint(score);
  const n = parseInt(p.fill.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${p.opacity.toFixed(3)})`;
}
