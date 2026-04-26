import type { Candle, OverlayItem } from '@/types';

type Pivot = { i: number; price: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function toX(i: number, n: number) {
  if (n <= 1) return 0;
  return clamp(i / (n - 1), 0, 1.2);
}

function collectPivots(candles: Candle[], len: number) {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  if (candles.length < len * 2 + 2) return { highs, lows };
  for (let i = len; i < candles.length - len; i += 1) {
    let hi = candles[i].high;
    let lo = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - len; j <= i + len; j += 1) {
      if (j === i) continue;
      if (candles[j].high >= hi) isHigh = false;
      if (candles[j].low <= lo) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ i, price: hi });
    if (isLow) lows.push({ i, price: lo });
  }
  return { highs, lows };
}

export function buildBjorgumDoubleTapOverlays(
  candles: Candle[],
  options?: {
    pivotLength?: number;
    tolerancePct?: number;
    fibPct?: number;
    stopFibPct?: number;
  }
): OverlayItem[] {
  const n = candles.length;
  if (n < 80) return [];
  const len = clamp(Math.floor(options?.pivotLength ?? 35), 8, 80);
  const tolPct = clamp(Number(options?.tolerancePct ?? 15), 2, 40);
  const fibPct = clamp(Number(options?.fibPct ?? 100), 30, 240);
  const stopFibPct = clamp(Number(options?.stopFibPct ?? 0), 0, 120);
  const { highs, lows } = collectPivots(candles, len);
  if (!highs.length || !lows.length) return [];

  let bestTop: null | { h1: Pivot; l: Pivot; h2: Pivot; neck: number; target: number; stop: number } = null;
  for (let a = Math.max(0, highs.length - 8); a < highs.length; a += 1) {
    for (let b = a + 1; b < highs.length; b += 1) {
      const h1 = highs[a];
      const h2 = highs[b];
      if (h2.i - h1.i < 8) continue;
      const betweenLows = lows.filter((x) => x.i > h1.i && x.i < h2.i);
      if (!betweenLows.length) continue;
      const l = betweenLows.reduce((p, c) => (c.price < p.price ? c : p));
      const avgTop = (h1.price + h2.price) * 0.5;
      const height = avgTop - l.price;
      if (height <= 0) continue;
      const tolAbs = (height * tolPct) / 100;
      if (Math.abs(h1.price - h2.price) > tolAbs) continue;
      const now = candles[n - 1].close;
      if (now > l.price) continue;
      const target = l.price - height * (fibPct / 100);
      const stop = Math.max(h1.price, h2.price) + height * (stopFibPct / 100);
      bestTop = { h1, l, h2, neck: l.price, target, stop };
    }
  }

  let bestBottom: null | { l1: Pivot; h: Pivot; l2: Pivot; neck: number; target: number; stop: number } = null;
  for (let a = Math.max(0, lows.length - 8); a < lows.length; a += 1) {
    for (let b = a + 1; b < lows.length; b += 1) {
      const l1 = lows[a];
      const l2 = lows[b];
      if (l2.i - l1.i < 8) continue;
      const betweenHighs = highs.filter((x) => x.i > l1.i && x.i < l2.i);
      if (!betweenHighs.length) continue;
      const h = betweenHighs.reduce((p, c) => (c.price > p.price ? c : p));
      const avgLow = (l1.price + l2.price) * 0.5;
      const height = h.price - avgLow;
      if (height <= 0) continue;
      const tolAbs = (height * tolPct) / 100;
      if (Math.abs(l1.price - l2.price) > tolAbs) continue;
      const now = candles[n - 1].close;
      if (now < h.price) continue;
      const target = h.price + height * (fibPct / 100);
      const stop = Math.min(l1.price, l2.price) - height * (stopFibPct / 100);
      bestBottom = { l1, h, l2, neck: h.price, target, stop };
    }
  }

  const out: OverlayItem[] = [];
  if (bestTop) {
    const { h1, l, h2, neck, target, stop } = bestTop;
    out.push(
      {
        id: 'bjdt-top-leg-1',
        kind: 'trendLine',
        label: '더블탭 숏',
        x1: toX(h1.i, n),
        y1: h1.price,
        x2: toX(l.i, n),
        y2: l.price,
        confidence: 78,
        color: '#f8fafc',
        lineDash: '4 4',
        category: 'scenario',
      },
      {
        id: 'bjdt-top-leg-2',
        kind: 'trendLine',
        label: '더블탭 숏',
        x1: toX(l.i, n),
        y1: l.price,
        x2: toX(h2.i, n),
        y2: h2.price,
        confidence: 78,
        color: '#f8fafc',
        lineDash: '4 4',
        category: 'scenario',
      },
      {
        id: 'bjdt-top-neck',
        kind: 'resistanceLine',
        label: '목선(숏)',
        x1: toX(l.i, n),
        y1: neck,
        x2: 1.15,
        y2: neck,
        confidence: 80,
        color: '#f59e0b',
        category: 'scenario',
      },
      {
        id: 'bjdt-top-target',
        kind: 'target',
        label: '숏 목표',
        x1: toX(l.i, n),
        y1: target,
        x2: 1.15,
        y2: target,
        confidence: 82,
        color: '#22c55e',
        category: 'scenario',
      },
      {
        id: 'bjdt-top-stop',
        kind: 'stop',
        label: '숏 무효',
        x1: toX(h2.i, n),
        y1: stop,
        x2: 1.15,
        y2: stop,
        confidence: 76,
        color: '#ef4444',
        category: 'scenario',
      }
    );
  }
  if (bestBottom) {
    const { l1, h, l2, neck, target, stop } = bestBottom;
    out.push(
      {
        id: 'bjdt-bottom-leg-1',
        kind: 'trendLine',
        label: '더블탭 롱',
        x1: toX(l1.i, n),
        y1: l1.price,
        x2: toX(h.i, n),
        y2: h.price,
        confidence: 78,
        color: '#f8fafc',
        lineDash: '4 4',
        category: 'scenario',
      },
      {
        id: 'bjdt-bottom-leg-2',
        kind: 'trendLine',
        label: '더블탭 롱',
        x1: toX(h.i, n),
        y1: h.price,
        x2: toX(l2.i, n),
        y2: l2.price,
        confidence: 78,
        color: '#f8fafc',
        lineDash: '4 4',
        category: 'scenario',
      },
      {
        id: 'bjdt-bottom-neck',
        kind: 'supportLine',
        label: '목선(롱)',
        x1: toX(h.i, n),
        y1: neck,
        x2: 1.15,
        y2: neck,
        confidence: 80,
        color: '#f59e0b',
        category: 'scenario',
      },
      {
        id: 'bjdt-bottom-target',
        kind: 'target',
        label: '롱 목표',
        x1: toX(h.i, n),
        y1: target,
        x2: 1.15,
        y2: target,
        confidence: 82,
        color: '#22c55e',
        category: 'scenario',
      },
      {
        id: 'bjdt-bottom-stop',
        kind: 'stop',
        label: '롱 무효',
        x1: toX(l2.i, n),
        y1: stop,
        x2: 1.15,
        y2: stop,
        confidence: 76,
        color: '#ef4444',
        category: 'scenario',
      }
    );
  }

  return out;
}

