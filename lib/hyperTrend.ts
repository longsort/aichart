import type { Candle, OverlayItem } from '@/types';

type HyperTrendOptions = {
  enabled: boolean;
  mult: number;
  slope: number;
  widthPct: number;
  lookbackBars: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function trueRange(curr: Candle, prev?: Candle): number {
  if (!prev) return curr.high - curr.low;
  const a = curr.high - curr.low;
  const b = Math.abs(curr.high - prev.close);
  const c = Math.abs(curr.low - prev.close);
  return Math.max(a, b, c);
}

function atr(candles: Candle[], period: number): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (!candles.length) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const tr = trueRange(candles[i], i > 0 ? candles[i - 1] : undefined);
    if (i < period) {
      sum += tr;
      out[i] = sum / (i + 1);
    } else {
      out[i] = (out[i - 1] * (period - 1) + tr) / period;
    }
  }
  return out;
}

export function buildHyperTrendOverlays(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  options: HyperTrendOptions;
}): OverlayItem[] {
  const { symbol, timeframe, candles, options } = params;
  if (!options.enabled || candles.length < 40) return [];

  const mult = clamp(Number(options.mult || 5), 0.2, 20);
  const slope = clamp(Number(options.slope || 14), 1, 100);
  const width = clamp(Number(options.widthPct || 80) / 100, 0.05, 1.0);
  const lookback = clamp(Math.round(options.lookbackBars || 160), 40, 500);
  const arr = candles.slice(-Math.min(lookback, candles.length));
  const atrArr = atr(arr, 200);

  const avg: number[] = new Array(arr.length).fill(0);
  const upper: number[] = new Array(arr.length).fill(0);
  const lower: number[] = new Array(arr.length).fill(0);
  const dir: number[] = new Array(arr.length).fill(1);

  let hold = 0;
  avg[0] = arr[0].close;
  for (let i = 1; i < arr.length; i++) {
    const a = (atrArr[i] || atrArr[i - 1] || 0) * mult;
    const prevAvg = avg[i - 1];
    const c = arr[i].close;
    avg[i] = Math.abs(c - prevAvg) > a ? (c + prevAvg) / 2 : prevAvg + dir[i - 1] * (hold / mult / slope);
    dir[i] = Math.sign(avg[i] - prevAvg) || dir[i - 1] || 1;
    hold = dir[i] !== dir[i - 1] ? a : hold;
    upper[i] = avg[i] + width * hold;
    lower[i] = avg[i] - width * hold;
  }

  const out: OverlayItem[] = [];
  const pushSegment = (start: number, end: number) => {
    if (end <= start) return;
    const bull = dir[end] >= 0;
    const avgColor = bull ? '#14B8A6' : '#EF4444';
    const upperColor = 'rgba(239,68,68,0.22)';
    const lowerColor = 'rgba(20,184,166,0.22)';
    const t1 = arr[start].time;
    const t2 = arr[end].time;
    // Segment-average bands for smooth channel blocks (closer to Lux look).
    let u = 0;
    let a = 0;
    let l = 0;
    let n = 0;
    for (let i = start; i <= end; i++) {
      u += upper[i];
      a += avg[i];
      l += lower[i];
      n++;
    }
    const uMid = u / Math.max(1, n);
    const aMid = a / Math.max(1, n);
    const lMid = l / Math.max(1, n);

    out.push({
      id: `hypertrend-avg-${symbol}-${timeframe}-${t1}`,
      kind: 'trendLine',
      label: `HT ${bull ? 'UP' : 'DN'}`,
      x1: t1,
      y1: avg[start],
      x2: t2,
      y2: avg[end],
      time1: t1,
      price1: avg[start],
      time2: t2,
      price2: avg[end],
      confidence: 78,
      color: avgColor,
      lineLabelColor: avgColor,
      category: 'trendlineEngine',
      noProject: true,
      lineStrokeWidth: 2,
    });
    out.push({
      id: `hypertrend-up-${symbol}-${timeframe}-${t1}`,
      kind: 'zone',
      label: 'HT-Upper',
      x1: t1,
      y1: uMid,
      x2: t2,
      y2: aMid,
      time1: t1,
      price1: uMid,
      time2: t2,
      price2: aMid,
      confidence: 70,
      color: upperColor,
      category: 'zones',
    });
    out.push({
      id: `hypertrend-low-${symbol}-${timeframe}-${t1}`,
      kind: 'zone',
      label: 'HT-Lower',
      x1: t1,
      y1: aMid,
      x2: t2,
      y2: lMid,
      time1: t1,
      price1: aMid,
      time2: t2,
      price2: lMid,
      confidence: 70,
      color: lowerColor,
      category: 'zones',
    });
  };

  let segStart = 1;
  for (let i = 2; i < arr.length; i++) {
    if (dir[i] !== dir[i - 1]) {
      pushSegment(segStart, i - 1);
      segStart = i;
    }
  }
  pushSegment(segStart, arr.length - 1);
  return out;
}

