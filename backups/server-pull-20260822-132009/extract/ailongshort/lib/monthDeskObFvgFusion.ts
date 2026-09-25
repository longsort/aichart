/**
 * 마감·안착 밴드 융합 전용 — analyze.ts와 동일한 FVG·OB 정의·검증(구조돌파+FVG 강도).
 * 차트 오버레이가 아닌 봉별 편향 점수만 산출. 참고·휴리스틱(확정 신호·수익 보장 아님).
 */
import type { Candle } from '@/types';

const FVG_GAP_MIN_ATR_RATIO = 0.12;

function pivotHigh(candles: Candle[], index: number, left = 2, right = 2): boolean {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].high;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].high >= v) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], index: number, left = 2, right = 2): boolean {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].low;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].low <= v) return false;
  }
  return true;
}

function atrTail(candles: Candle[], period = 50): number {
  const n = candles.length;
  if (n < 2) return 1e-8;
  if (n < period + 1) {
    return (Math.max(...candles.map((c) => c.high)) - Math.min(...candles.map((c) => c.low))) / Math.max(period, 1);
  }
  let sum = 0;
  for (let i = n - period; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}

function rangeOverlapsGap(c: { low: number; high: number }, gapLo: number, gapHi: number): boolean {
  return c.low <= gapHi && c.high >= gapLo;
}

function candleZoneOverlapWeight(c: Candle, lo: number, hi: number): number {
  if (c.close >= lo && c.close <= hi) return 1;
  if (c.low <= hi && c.high >= lo) return 0.48;
  return 0;
}

function isObMitigated(ob: { index: number; low: number; high: number }, candles: Candle[]): boolean {
  for (let j = ob.index + 1; j < candles.length; j++) {
    if (candles[j].low <= ob.high && candles[j].high >= ob.low) return true;
  }
  return false;
}

/**
 * 유효 FVG·구조 검증 OB 구간에 종가/위크가 겹칠 때 롱(+)/숏(-) 편향. analyze 오버레이 규칙과 정합.
 */
export function computeObFvgFusionBiasScores(candles: Candle[]): number[] {
  const visible = candles;
  const n = visible.length;
  const out = new Array(n).fill(0);
  if (n < 8) return out;

  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = 2; i < visible.length - 2; i++) {
    if (pivotHigh(visible, i)) swings.push({ type: 'high', index: i, price: visible[i].high });
    if (pivotLow(visible, i)) swings.push({ type: 'low', index: i, price: visible[i].low });
  }
  swings.sort((a, b) => a.index - b.index);

  const bos: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }> = [];
  const choch: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number; brokenLevel?: number }> = [];
  let trend: 'bullish' | 'bearish' | 'range' = 'range';

  for (let i = 2; i < swings.length; i++) {
    const a = swings[i - 2];
    const c = swings[i];
    if (c.type === 'high' && a.type === 'high' && c.price > a.price) {
      bos.push({ bias: 'bullish', index: c.index, price: c.price, brokenLevel: a.price });
      if (trend === 'bearish') choch.push({ bias: 'bullish', index: c.index, price: c.price, brokenLevel: a.price });
      trend = 'bullish';
    }
    if (c.type === 'low' && a.type === 'low' && c.price < a.price) {
      bos.push({ bias: 'bearish', index: c.index, price: c.price, brokenLevel: a.price });
      if (trend === 'bullish') choch.push({ bias: 'bearish', index: c.index, price: c.price, brokenLevel: a.price });
      trend = 'bearish';
    }
  }

  const simpleBos: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number }> = [];
  for (let i = 1; i < visible.length; i++) {
    if (visible[i].close > visible[i - 1].high) simpleBos.push({ bias: 'bullish', index: i, price: visible[i].close });
    if (visible[i].close < visible[i - 1].low) simpleBos.push({ bias: 'bearish', index: i, price: visible[i].close });
  }
  const bosForObKey = (b: { index: number; bias: string }) => `${b.index}:${b.bias}`;
  const bosForObMap = new Map<string, { bias: 'bullish' | 'bearish'; index: number; price: number }>();
  for (const b of bos) bosForObMap.set(bosForObKey(b), b);
  for (const b of simpleBos) {
    if (!bosForObMap.has(bosForObKey(b))) bosForObMap.set(bosForObKey(b), b);
  }
  const bosSortedForOb = Array.from(bosForObMap.values()).sort((a, b) => a.index - b.index);

  const fvg: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number; valid: boolean }> = [];
  for (let i = 2; i < visible.length; i++) {
    const c1 = visible[i - 2];
    const c3 = visible[i];
    if (c1.high < c3.low) {
      const gapLo = c1.high;
      const gapHi = c3.low;
      let mitigated = false;
      for (let j = i + 1; j < visible.length; j++) {
        if (rangeOverlapsGap(visible[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bullish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
    if (c1.low > c3.high) {
      const gapLo = c3.high;
      const gapHi = c1.low;
      let mitigated = false;
      for (let j = i + 1; j < visible.length; j++) {
        if (rangeOverlapsGap(visible[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bearish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
  }

  const obs: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number }> = [];
  for (const x of bosSortedForOb.slice(-14)) {
    const start = Math.max(1, x.index - 6);
    const end = x.index - 1;
    if (end <= start) continue;
    if (x.bias === 'bullish') {
      for (let i = end; i >= start; i--) {
        if (visible[i].close < visible[i].open) {
          obs.push({
            bias: 'bullish',
            index: i,
            low: Math.min(visible[i].open, visible[i].close),
            high: visible[i].high,
          });
          break;
        }
      }
    } else {
      for (let i = end; i >= start; i--) {
        if (visible[i].close > visible[i].open) {
          obs.push({
            bias: 'bearish',
            index: i,
            low: visible[i].low,
            high: Math.max(visible[i].open, visible[i].close),
          });
          break;
        }
      }
    }
  }

  const atrVal = atrTail(visible, Math.min(50, Math.max(5, visible.length - 2)));
  const validFvg = fvg.filter((x) => x.valid);

  const hasSimpleBreakoutAfter = (idx: number, bias: 'bullish' | 'bearish') =>
    simpleBos.some((b) => b.bias === bias && b.index > idx && b.index - idx <= 14);
  const hasStructureBreak = (idx: number, bias: 'bullish' | 'bearish') =>
    bos.some((b) => b.bias === bias && Math.abs(b.index - idx) <= 8) ||
    choch.some((c) => c.bias === bias && Math.abs(c.index - idx) <= 8) ||
    hasSimpleBreakoutAfter(idx, bias);
  const hasStrongFvgSameDirection = (idx: number, bias: 'bullish' | 'bearish') =>
    validFvg.some((f) => {
      if (f.bias !== bias || f.index < idx - 2 || f.index > idx + 15) return false;
      const gap = f.high - f.low;
      return gap / Math.max(atrVal, 1e-12) >= FVG_GAP_MIN_ATR_RATIO;
    });

  const validObs = obs.filter(
    (o) => hasStructureBreak(o.index, o.bias) && hasStrongFvgSameDirection(o.index, o.bias)
  );

  for (let i = 0; i < n; i++) {
    const c = visible[i];
    let s = 0;
    for (const f of validFvg) {
      const zw = candleZoneOverlapWeight(c, f.low, f.high);
      if (zw <= 0) continue;
      const gap = (f.high - f.low) / Math.max(atrVal, 1e-12);
      const w = Math.min(1.05, 0.26 + gap * 0.11) * zw;
      s += f.bias === 'bullish' ? w : -w;
    }
    for (const o of validObs) {
      const zw = candleZoneOverlapWeight(c, o.low, o.high);
      if (zw <= 0) continue;
      const mitigated = isObMitigated(o, visible);
      const w = (mitigated ? 0.34 : 0.58) * zw;
      s += o.bias === 'bullish' ? w : -w;
    }
    out[i] = Math.max(-1.45, Math.min(1.45, s));
  }
  return out;
}
