import { Candle } from '@/types';

export type PatternHit = {
  type: 'triangle' | 'flag' | 'wedge' | 'symTriangle';
  bias: 'bullish' | 'bearish' | 'neutral';
  start: number;
  end: number;
  upperStart: number;
  upperEnd: number;
  lowerStart: number;
  lowerEnd: number;
  label: string;
  targetPrice?: number;
  breakoutDir?: 'up' | 'down';
};

function lineSlope(aIndex: number, aPrice: number, bIndex: number, bPrice: number) {
  const dx = Math.max(1, bIndex - aIndex);
  return (bPrice - aPrice) / dx;
}

export function detectPatterns(
  candles: Candle[],
  swings: Array<{ type: 'high' | 'low'; index: number; price: number }>
): PatternHit[] {
  const hits: PatternHit[] = [];
  const highs = swings.filter(s => s.type === 'high').slice(-3);
  const lows = swings.filter(s => s.type === 'low').slice(-3);

  if (highs.length < 2 || lows.length < 2) return hits;

  const h1 = highs[highs.length - 2];
  const h2 = highs[highs.length - 1];
  const l1 = lows[lows.length - 2];
  const l2 = lows[lows.length - 1];

  const upperSlope = lineSlope(h1.index, h1.price, h2.index, h2.price);
  const lowerSlope = lineSlope(l1.index, l1.price, l2.index, l2.price);

  const widthStart = Math.abs(h1.price - l1.price);
  const widthEnd = Math.abs(h2.price - l2.price);
  const start = Math.min(h1.index, l1.index);
  const end = Math.max(h2.index, l2.index);

  if (upperSlope < 0 && lowerSlope > 0 && widthEnd < widthStart * 0.9) {
    const L = widthStart;
    const apexIdx = start + (end - start) * 1.2;
    let targetPrice: number | undefined;
    let breakoutDir: 'up' | 'down' | undefined;
    const lastC = candles[candles.length - 1];
    if (lastC && candles.length > end + 3) {
      const after = candles.slice(end, Math.min(end + 15, candles.length));
      const brokeUp = after.some(c => c.close > Math.max(h2.price, l2.price) + 0.001 * L);
      const brokeDown = after.some(c => c.close < Math.min(h2.price, l2.price) - 0.001 * L);
      if (brokeDown) {
        breakoutDir = 'down';
        targetPrice = Math.min(h2.price, l2.price) - L;
      } else if (brokeUp) {
        breakoutDir = 'up';
        targetPrice = Math.max(h2.price, l2.price) + L;
      }
    }
    hits.push({
      type: 'symTriangle',
      bias: 'neutral',
      start,
      end,
      upperStart: h1.price,
      upperEnd: h2.price,
      lowerStart: l1.price,
      lowerEnd: l2.price,
      label: '대칭삼각형',
      targetPrice,
      breakoutDir
    });
  }

  if (widthEnd < widthStart * 0.9) {
    if (upperSlope > 0 && lowerSlope > 0) {
      hits.push({
        type: 'wedge',
        bias: 'bearish',
        start,
        end,
        upperStart: h1.price,
        upperEnd: h2.price,
        lowerStart: l1.price,
        lowerEnd: l2.price,
        label: '상승 웨지'
      });
    }
    if (upperSlope < 0 && lowerSlope < 0) {
      hits.push({
        type: 'wedge',
        bias: 'bullish',
        start,
        end,
        upperStart: h1.price,
        upperEnd: h2.price,
        lowerStart: l1.price,
        lowerEnd: l2.price,
        label: '하락 웨지'
      });
    }
  }

  const recent = candles.slice(Math.max(0, end - 20), end + 1);
  if (recent.length >= 8) {
    const first = recent[0];
    const impulse = (recent[Math.min(3, recent.length - 1)].close - first.open) / Math.max(1, first.open);
    const channelParallel = Math.abs(upperSlope - lowerSlope) < Math.max(Math.abs(upperSlope), Math.abs(lowerSlope), 1e-9) * 0.6;

    if (channelParallel) {
      if (impulse > 0.015 && upperSlope < 0 && lowerSlope < 0) {
        hits.push({
          type: 'flag',
          bias: 'bullish',
          start,
          end,
          upperStart: h1.price,
          upperEnd: h2.price,
          lowerStart: l1.price,
          lowerEnd: l2.price,
          label: '상승 플래그'
        });
      }
      if (impulse < -0.015 && upperSlope > 0 && lowerSlope > 0) {
        hits.push({
          type: 'flag',
          bias: 'bearish',
          start,
          end,
          upperStart: h1.price,
          upperEnd: h2.price,
          lowerStart: l1.price,
          lowerEnd: l2.price,
          label: '하락 플래그'
        });
      }
    }
  }

  return hits.slice(-3);
}
