/**
 * SMC 구조 기반 오더블록 — analyze.ts / monthDeskObFvgFusion.ts 와 동일 정의.
 * BOS(또는 CHOCH) 직전 마지막 반대색 봉 = OB. 무작위 음봉·양봉 전환 아님.
 */
import type { Candle } from '@/types';

const FVG_GAP_MIN_ATR_RATIO = 0.12;

export type SmcObHit = {
  bias: 'bullish' | 'bearish';
  index: number;
  low: number;
  high: number;
  bosIndex: number;
};

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

/** 가격이 OB 구간을 다시 스쳐 지나감(테스트) — 소진 후보 */
export function isObMitigated(ob: { index: number; low: number; high: number }, candles: Candle[]): boolean {
  for (let j = ob.index + 1; j < candles.length; j++) {
    if (candles[j]!.low <= ob.high && candles[j]!.high >= ob.low) return true;
  }
  return false;
}

/**
 * 종가 이탈로 OB 무효 — 롱(수요)은 저점 아래 종가, 숏(공급)은 고점 위 종가.
 * 하락 후에도 LONG OB BUY가 남는 문제를 막기 위한 기준.
 */
export function isObBrokenByClose(
  ob: { index: number; low: number; high: number; bias: 'bullish' | 'bearish' },
  candles: Candle[]
): boolean {
  for (let j = ob.index + 1; j < candles.length; j++) {
    const c = candles[j]!;
    if (ob.bias === 'bullish' && c.close < ob.low) return true;
    if (ob.bias === 'bearish' && c.close > ob.high) return true;
  }
  return false;
}

/** zone 가격대만으로도 무효 판정 (오버레이 기하용) */
export function isObZoneBrokenByClose(
  candles: Candle[],
  params: { fromIdx: number; low: number; high: number; bias: 'bullish' | 'bearish' }
): boolean {
  return isObBrokenByClose(
    { index: params.fromIdx, low: params.low, high: params.high, bias: params.bias },
    candles
  );
}

export function detectSmcStructureOrderBlocks(candles: Candle[]): {
  obs: SmcObHit[];
  validObs: SmcObHit[];
  atrVal: number;
} {
  const visible = candles;
  const n = visible.length;
  const empty = { obs: [] as SmcObHit[], validObs: [] as SmcObHit[], atrVal: 1e-8 };
  if (n < 12) return empty;

  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = 2; i < n - 2; i++) {
    if (pivotHigh(visible, i)) swings.push({ type: 'high', index: i, price: visible[i].high });
    if (pivotLow(visible, i)) swings.push({ type: 'low', index: i, price: visible[i].low });
  }
  swings.sort((a, b) => a.index - b.index);

  const bos: Array<{ bias: 'bullish' | 'bearish'; index: number }> = [];
  const choch: Array<{ bias: 'bullish' | 'bearish'; index: number }> = [];
  let trend: 'bullish' | 'bearish' | 'range' = 'range';

  for (let i = 2; i < swings.length; i++) {
    const a = swings[i - 2];
    const c = swings[i];
    if (c.type === 'high' && a.type === 'high' && c.price > a.price) {
      bos.push({ bias: 'bullish', index: c.index });
      if (trend === 'bearish') choch.push({ bias: 'bullish', index: c.index });
      trend = 'bullish';
    }
    if (c.type === 'low' && a.type === 'low' && c.price < a.price) {
      bos.push({ bias: 'bearish', index: c.index });
      if (trend === 'bullish') choch.push({ bias: 'bearish', index: c.index });
      trend = 'bearish';
    }
  }

  const simpleBos: Array<{ bias: 'bullish' | 'bearish'; index: number }> = [];
  for (let i = 1; i < n; i++) {
    if (visible[i].close > visible[i - 1].high) simpleBos.push({ bias: 'bullish', index: i });
    if (visible[i].close < visible[i - 1].low) simpleBos.push({ bias: 'bearish', index: i });
  }

  const key = (b: { index: number; bias: string }) => `${b.index}:${b.bias}`;
  const bosMap = new Map<string, { bias: 'bullish' | 'bearish'; index: number }>();
  for (const b of bos) bosMap.set(key(b), b);
  for (const b of simpleBos) {
    if (!bosMap.has(key(b))) bosMap.set(key(b), b);
  }
  const bosSorted = Array.from(bosMap.values()).sort((a, b) => a.index - b.index);

  const fvg: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number; valid: boolean }> = [];
  for (let i = 2; i < n; i++) {
    const c1 = visible[i - 2];
    const c3 = visible[i];
    if (c1.high < c3.low) {
      const gapLo = c1.high;
      const gapHi = c3.low;
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
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
      for (let j = i + 1; j < n; j++) {
        if (rangeOverlapsGap(visible[j], gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      fvg.push({ bias: 'bearish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
  }

  const obs: SmcObHit[] = [];
  for (const x of bosSorted.slice(-16)) {
    const start = Math.max(1, x.index - 8);
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
            bosIndex: x.index,
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
            bosIndex: x.index,
          });
          break;
        }
      }
    }
  }

  const atrVal = atrTail(visible, Math.min(50, Math.max(5, n - 2)));
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
    (o) =>
      hasStructureBreak(o.index, o.bias) &&
      hasStrongFvgSameDirection(o.index, o.bias) &&
      !isObBrokenByClose(o, visible)
  );

  return { obs, validObs, atrVal };
}
