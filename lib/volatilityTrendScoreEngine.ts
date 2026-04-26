/**
 * Volatility Trend Score [BackQuant] — Pine v6 로직 포팅 (차트 L/S 마커용).
 * 캔들 재칠(paintCandles)·배경(bgCol)·서브페인 score 플롯은 앱 캔들 스타일 유지를 위해 생략.
 */
import type { Candle, OverlayItem } from '@/types';

export type VolatilityTrendScoreParams = {
  calcP: number;
  atrFactor: number;
  loopStart: number;
  loopEnd: number;
  thresL: number;
  thresS: number;
  showSignals: boolean;
  longHex: string;
  shortHex: string;
};

export const DEFAULT_VOLATILITY_TREND_SCORE_PARAMS: VolatilityTrendScoreParams = {
  calcP: 35,
  atrFactor: 1.2,
  loopStart: 1,
  loopEnd: 45,
  thresL: 40,
  thresS: -10,
  showSignals: true,
  longHex: '#00ff00',
  shortHex: '#ff0000',
};

function trueRange(candles: Candle[], i: number): number {
  const c = candles[i];
  if (i === 0) return Math.max(1e-12, c.high - c.low);
  const pc = candles[i - 1].close;
  return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
}

/** Pine ta.atr — Wilder RMA of true range */
function atrRma(candles: Candle[], period: number): Float64Array {
  const n = candles.length;
  const out = new Float64Array(n);
  out.fill(NaN);
  if (n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRange(candles, i);
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    const tr = trueRange(candles, i);
    out[i] = (out[i - 1] * (period - 1) + tr) / period;
  }
  return out;
}

function toRatio(price: number, lo: number, hi: number): number {
  const r = Math.max(1e-9, hi - lo);
  return (hi - price) / r;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  const v = h.length === 6 ? h : '00ff00';
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function solidLabelColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r},${g},${b})`;
}

/**
 * trail / score / signal 상태를 Pine과 동일 순서로 바(bar)마다 갱신 후,
 * plotshape: 롱 = signal 1이고 직전 -1, 숏 = -1이고 직전 1 인 바에만 오버레이.
 */
export function computeVolatilityTrendScoreOverlays(
  visible: Candle[],
  min: number,
  max: number,
  partial?: Partial<VolatilityTrendScoreParams>
): OverlayItem[] {
  const p: VolatilityTrendScoreParams = { ...DEFAULT_VOLATILITY_TREND_SCORE_PARAMS, ...partial };
  if (!p.showSignals || visible.length < p.calcP + p.loopEnd + 2) return [];

  const n = visible.length;
  const atr = atrRma(visible, p.calcP);
  const trail = new Float64Array(n);
  trail.fill(NaN);
  const score = new Float64Array(n);
  score.fill(NaN);
  const sig = new Int8Array(n);
  sig.fill(0);
  /** Pine var st.signal 초기값 1 */
  let stateSignal = 1;

  for (let t = 0; t < n; t++) {
    const a = atr[t];
    if (!Number.isFinite(a)) {
      sig[t] = stateSignal;
      continue;
    }
    const c = visible[t];
    const band = a * p.atrFactor;
    const up = c.close + band;
    const dn = c.close - band;

    let trailS = c.close;
    if (t > 0 && Number.isFinite(trail[t - 1])) trailS = trail[t - 1];
    else trailS = c.close;

    if (dn > trailS) trailS = dn;
    if (up < trailS) trailS = up;
    trail[t] = trailS;

    let scoreS = 0;
    for (let k = p.loopStart; k <= p.loopEnd; k++) {
      const past = trail[t - k];
      if (!Number.isFinite(trailS) || !Number.isFinite(past)) continue;
      scoreS += trailS > past ? 1 : -1;
    }
    score[t] = scoreS;

    const longCond = scoreS > p.thresL;
    const prevSc = t > 0 && Number.isFinite(score[t - 1]) ? score[t - 1] : NaN;
    const shortCond = Number.isFinite(prevSc) && scoreS < p.thresS && prevSc >= p.thresS;

    if (longCond && !shortCond) stateSignal = 1;
    else if (shortCond) stateSignal = -1;

    sig[t] = stateSignal;
  }

  const nVis = Math.max(1, n - 1);
  const out: OverlayItem[] = [];
  const longCol = solidLabelColor(p.longHex);
  const shortCol = solidLabelColor(p.shortHex);

  for (let t = 1; t < n; t++) {
    const prev = sig[t - 1];
    const cur = sig[t];
    const longFlip = cur === 1 && prev === -1;
    const shortFlip = cur === -1 && prev === 1;
    if (!longFlip && !shortFlip) continue;

    const bar = visible[t];
    const ti = bar.time as number;
    const isLong = longFlip;
    const x = Math.min(0.97, t / nVis);
    const yRaw = isLong ? toRatio(bar.low, min, max) + 0.028 : toRatio(bar.high, min, max) - 0.028;

    out.push({
      id: `vts-sig-${t}-${isLong ? 'L' : 'S'}`,
      kind: 'label',
      label: isLong ? '▲ L' : '▼ S',
      x1: x,
      y1: Math.max(0.02, Math.min(0.98, yRaw)),
      time1: ti,
      price1: isLong ? bar.low : bar.high,
      confidence: 80,
      color: isLong ? longCol : shortCol,
      lineLabelColor: isLong ? longCol : shortCol,
      labelBackgroundColor: 'rgba(8,15,25,0.82)',
      labelTextColor: isLong ? longCol : shortCol,
      category: 'volatilityTrendScore',
    });
  }

  return out;
}
