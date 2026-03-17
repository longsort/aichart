import { Candle } from '@/types';

export type HarmonicPatternName = 'butterfly' | 'bat' | 'gartley' | 'crab' | 'altBat' | 'deepCrab' | 'cypher' | 'shark';

export type HarmonicLeg = {
  x: number; a: number; b: number; c: number; d: number;
  xPrice: number; aPrice: number; bPrice: number; cPrice: number; dPrice: number;
  bias: 'bullish' | 'bearish';
  score: number;
  pattern: HarmonicPatternName;
};

export type ButterflyLeg = HarmonicLeg & { pattern: 'butterfly' };

const TOL = 0.08;

function inRange(val: number, target: number, tol: number) {
  return val >= target - tol && val <= target + tol;
}

export function detectButterfly(
  candles: Candle[],
  swings: Array<{ type: 'high' | 'low'; index: number; price: number }>
): ButterflyLeg[] {
  const hits: ButterflyLeg[] = [];
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  if (highs.length < 3 || lows.length < 3) return hits;

  for (let xi = 0; xi < highs.length - 2; xi++) {
    const x = highs[xi];
    for (let ai = xi + 1; ai < lows.length; ai++) {
      const a = lows[ai];
      if (a.index <= x.index) continue;
      const xa = x.price - a.price;
      if (xa <= 0) continue;
      for (let bi = ai + 1; bi < highs.length; bi++) {
        const b = highs[bi];
        if (b.index <= a.index) continue;
        const xbRet = (x.price - b.price) / xa;
        if (!inRange(xbRet, 0.786, TOL)) continue;
        const ab = b.price - a.price;
        if (ab <= 0) continue;
        for (let ci = bi + 1; ci < lows.length; ci++) {
          const c = lows[ci];
          if (c.index <= b.index) continue;
          const bcRet = (b.price - c.price) / ab;
          if (bcRet < 0.382 || bcRet > 0.886) continue;
          const bc = b.price - c.price;
          const cd1 = bc * 1.618;
          const cd2 = bc * 2.0;
          const cd3 = bc * 2.24;
          const d1 = c.price - cd1;
          const d2 = c.price - cd2;
          const d3 = c.price - cd3;
          const xa127 = xa * 1.27;
          const dTarget = x.price - xa127;
          let bestD = d1;
          let bestScore = 0;
          for (const d of [d1, d2, d3]) {
            const dist = Math.abs(d - dTarget) / xa;
            if (dist < TOL) {
              const sc = 1 - dist / TOL;
              if (sc > bestScore) {
                bestScore = sc;
                bestD = d;
              }
            }
          }
          if (bestScore > 0) {
            const lastLow = Math.min(...candles.slice(c.index, Math.min(c.index + 20, candles.length)).map(cx => cx.low));
            if (lastLow <= bestD * 1.01 && lastLow >= bestD * 0.99) {
              hits.push({
                x: x.index, a: a.index, b: b.index, c: c.index, d: c.index + 5,
                xPrice: x.price, aPrice: a.price, bPrice: b.price, cPrice: c.price, dPrice: bestD,
                bias: 'bullish' as const, score: bestScore, pattern: 'butterfly'
              });
            }
          }
        }
      }
    }
  }

  for (let xi = 0; xi < lows.length - 2; xi++) {
    const x = lows[xi];
    for (let ai = xi + 1; ai < highs.length; ai++) {
      const a = highs[ai];
      if (a.index <= x.index) continue;
      const xa = a.price - x.price;
      if (xa <= 0) continue;
      for (let bi = ai + 1; bi < lows.length; bi++) {
        const b = lows[bi];
        if (b.index <= a.index) continue;
        const xbRet = (b.price - x.price) / xa;
        if (!inRange(xbRet, 0.786, TOL)) continue;
        const ab = a.price - b.price;
        if (ab <= 0) continue;
        for (let ci = bi + 1; ci < highs.length; ci++) {
          const c = highs[ci];
          if (c.index <= b.index) continue;
          const bcRet = (c.price - b.price) / ab;
          if (bcRet < 0.382 || bcRet > 0.886) continue;
          const bc = c.price - b.price;
          const cd1 = bc * 1.618;
          const d1 = c.price + cd1;
          const xa127 = xa * 1.27;
          const dTarget = x.price + xa127;
          const dist = Math.abs(d1 - dTarget) / xa;
          if (dist < TOL) {
            const lastHigh = Math.max(...candles.slice(c.index, Math.min(c.index + 20, candles.length)).map(cx => cx.high));
            if (lastHigh >= d1 * 0.99 && lastHigh <= d1 * 1.01) {
              hits.push({
                x: x.index, a: a.index, b: b.index, c: c.index, d: c.index + 5,
                xPrice: x.price, aPrice: a.price, bPrice: b.price, cPrice: c.price, dPrice: d1,
                bias: 'bearish' as const, score: 1 - dist / TOL, pattern: 'butterfly'
              });
            }
          }
        }
      }
    }
  }

  return hits.map(h => ({ ...h, pattern: 'butterfly' as const }));
}

const HARMONIC_SPECS: Record<HarmonicPatternName, { xb: [number, number]; bc: [number, number]; cd: [number, number]; xaAd: [number, number] }> = {
  butterfly: { xb: [0.786, 0.786], bc: [0.382, 0.886], cd: [1.618, 2.618], xaAd: [1.27, 1.618] },
  bat: { xb: [0.382, 0.5], bc: [0.382, 0.886], cd: [1.618, 2.618], xaAd: [0.886, 0.886] },
  gartley: { xb: [0.618, 0.618], bc: [0.382, 0.886], cd: [1.27, 1.618], xaAd: [0.786, 0.786] },
  crab: { xb: [0.382, 0.618], bc: [0.382, 0.886], cd: [2.24, 3.618], xaAd: [1.618, 1.618] },
  altBat: { xb: [0.382, 0.382], bc: [0.382, 0.886], cd: [2.0, 3.618], xaAd: [1.13, 1.13] },
  deepCrab: { xb: [0.886, 0.886], bc: [0.382, 0.886], cd: [2.618, 3.618], xaAd: [1.618, 1.618] },
  cypher: { xb: [0.382, 0.618], bc: [1.13, 1.41], cd: [1.27, 2.0], xaAd: [0.786, 0.786] },
  shark: { xb: [0, 0], bc: [0, 0], cd: [0, 0], xaAd: [1.13, 1.168] },
};

function matchHarmonic(
  xa: number, xbRet: number, bcRet: number, cdExt: number, adRet: number,
  pattern: HarmonicPatternName
): number {
  const s = HARMONIC_SPECS[pattern];
  if (!s || pattern === 'shark') return 0;
  let score = 1;
  if (s.xb[0] > 0) {
    const xbOk = xbRet >= s.xb[0] - TOL && xbRet <= s.xb[1] + TOL;
    if (!xbOk) return 0;
  }
  if (s.bc[0] > 0) {
    const bcOk = bcRet >= s.bc[0] - TOL && bcRet <= s.bc[1] + TOL;
    if (!bcOk) score *= 0.7;
  }
  if (s.cd[0] > 0) {
    const cdOk = cdExt >= s.cd[0] - TOL && cdExt <= s.cd[1] + TOL;
    if (!cdOk) score *= 0.8;
  }
  return score;
}

export function detectAllHarmonics(
  candles: Candle[],
  swings: Array<{ type: 'high' | 'low'; index: number; price: number }>
): HarmonicLeg[] {
  const results: HarmonicLeg[] = [];
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  if (highs.length < 3 || lows.length < 3) return results;

  const patterns: HarmonicPatternName[] = ['butterfly', 'bat', 'gartley', 'crab', 'altBat', 'deepCrab'];
  for (const patternName of patterns) {
    for (let xi = 0; xi < highs.length - 2; xi++) {
      const x = highs[xi];
      for (let ai = xi + 1; ai < lows.length; ai++) {
        const a = lows[ai];
        if (a.index <= x.index) continue;
        const xa = x.price - a.price;
        if (xa <= 0) continue;
        for (let bi = ai + 1; bi < highs.length; bi++) {
          const b = highs[bi];
          if (b.index <= a.index) continue;
          const xbRet = (x.price - b.price) / xa;
          const s = HARMONIC_SPECS[patternName];
          if (xbRet < s.xb[0] - TOL || xbRet > s.xb[1] + TOL) continue;
          const ab = b.price - a.price;
          if (ab <= 0) continue;
          for (let ci = bi + 1; ci < lows.length; ci++) {
            const c = lows[ci];
            if (c.index <= b.index) continue;
            const bcRet = (b.price - c.price) / ab;
            if (bcRet < 0.382 || bcRet > 0.886) continue;
            const bc = b.price - c.price;
            const cdVals = [1.618, 2.0, 2.24, 2.618];
            for (const cdR of cdVals) {
              const dPrice = c.price - bc * cdR;
              const adRet = (x.price - dPrice) / xa;
              const sc = matchHarmonic(xa, xbRet, bcRet, cdR, adRet, patternName);
              if (sc > 0.5) {
                results.push({
                  x: x.index, a: a.index, b: b.index, c: c.index, d: c.index + 5,
                  xPrice: x.price, aPrice: a.price, bPrice: b.price, cPrice: c.price, dPrice,
                  bias: 'bullish', score: sc, pattern: patternName,
                });
                break;
              }
            }
          }
        }
      }
    }
    for (let xi = 0; xi < lows.length - 2; xi++) {
      const x = lows[xi];
      for (let ai = xi + 1; ai < highs.length; ai++) {
        const a = highs[ai];
        if (a.index <= x.index) continue;
        const xa = a.price - x.price;
        if (xa <= 0) continue;
        for (let bi = ai + 1; bi < lows.length; bi++) {
          const b = lows[bi];
          if (b.index <= a.index) continue;
          const xbRet = (b.price - x.price) / xa;
          const s = HARMONIC_SPECS[patternName];
          if (xbRet < s.xb[0] - TOL || xbRet > s.xb[1] + TOL) continue;
          const ab = a.price - b.price;
          if (ab <= 0) continue;
          for (let ci = bi + 1; ci < highs.length; ci++) {
            const c = highs[ci];
            if (c.index <= b.index) continue;
            const bcRet = (c.price - b.price) / ab;
            if (bcRet < 0.382 || bcRet > 0.886) continue;
            const bc = c.price - b.price;
            const cdVals = [1.618, 2.0, 2.24, 2.618];
            for (const cdR of cdVals) {
              const dPrice = c.price + bc * cdR;
              const adRet = (dPrice - x.price) / xa;
              const sc = matchHarmonic(xa, xbRet, bcRet, cdR, adRet, patternName);
              if (sc > 0.5) {
                results.push({
                  x: x.index, a: a.index, b: b.index, c: c.index, d: c.index + 5,
                  xPrice: x.price, aPrice: a.price, bPrice: b.price, cPrice: c.price, dPrice,
                  bias: 'bearish', score: sc, pattern: patternName,
                });
                break;
              }
            }
          }
        }
      }
    }
  }

  const names: Record<HarmonicPatternName, string> = {
    butterfly: '나비', bat: '박쥐', gartley: 'gartley', crab: '크랩',
    altBat: 'Alt Bat', deepCrab: 'Deep Crab', cypher: 'cypher', shark: 'shark',
  };
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(h => ({ ...h, pattern: h.pattern || 'butterfly' }));
}
