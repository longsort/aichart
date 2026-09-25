/**
 * Automatic lookahead gate. Mutating T+ data must not change features/search at T.
 */
import { computeBarFeatures, windowVector } from '@/lib/patternMemory/features';
import { searchSimilarPatterns } from '@/lib/patternMemory/similarity';
import type { StoredCandle } from '@/lib/patternMemory/types';

function synth(n: number, seed = 1): StoredCandle[] {
  const out: StoredCandle[] = [];
  let px = 40_000;
  let t = Date.parse('2022-01-03T00:00:00.000Z');
  for (let i = 0; i < n; i++) {
    const drift = Math.sin((i + seed) / 17) * 40 + ((i * 17 + seed * 13) % 50) - 25;
    const open = px;
    const close = Math.max(100, px + drift);
    const high = Math.max(open, close) + 15;
    const low = Math.min(open, close) - 15;
    out.push({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: t,
      closeTime: t + 3_600_000,
      open,
      high,
      low,
      close,
      baseVolume: 100 + (i % 40),
      quoteTurnover: (100 + (i % 40)) * close,
      isClosed: true,
    });
    px = close;
    t += 3_600_000;
  }
  return out;
}

export type LookaheadTestResult = {
  pass: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
};

export function runLookaheadTests(): LookaheadTestResult {
  const checks: LookaheadTestResult['checks'] = [];
  const base = synth(220);
  const T = 180;
  const featsA = computeBarFeatures(base, T + 1);
  const qA = windowVector(featsA, T, 20, 'CANDLE_ONLY');
  const hitsA = searchSimilarPatterns({
    candles: base.slice(0, T + 1),
    asOfIndex: T,
    model: 'CANDLE_ONLY',
    topK: 50,
    timeframe: '1h',
    windows: [20],
  });

  const poisoned = base.map((c, i) =>
    i > T
      ? { ...c, high: c.high * 3, close: c.close * 2.5, baseVolume: c.baseVolume * 50 }
      : c
  );
  const featsB = computeBarFeatures(poisoned, T + 1);
  const qB = windowVector(featsB, T, 20, 'CANDLE_ONLY');
  const hitsB = searchSimilarPatterns({
    candles: poisoned.slice(0, T + 1),
    asOfIndex: T,
    model: 'CANDLE_ONLY',
    topK: 50,
    timeframe: '1h',
    windows: [20],
  });

  const sameVec = qA.length === qB.length && qA.every((x, i) => Math.abs(x - (qB[i] || 0)) < 1e-9);
  checks.push({
    name: 'feature_prefix_immune_to_future',
    pass: sameVec,
    detail: sameVec ? 'T feature unchanged after T+ poison' : 'T feature changed when future bars mutated',
  });

  const sameHits =
    hitsA.length === hitsB.length && hitsA.every((h, i) => h.openTime === hitsB[i]?.openTime && Math.abs(h.cosine - (hitsB[i]?.cosine || 0)) < 1e-9);
  checks.push({
    name: 'search_prefix_immune_to_future',
    pass: sameHits,
    detail: sameHits ? 'Top-K identical after T+ poison' : 'Search used future-mutated series',
  });

  const futureInHits = hitsA.some((h) => h.openTime > base[T]!.openTime);
  checks.push({
    name: 'no_future_timestamp_in_hits',
    pass: !futureInHits,
    detail: futureInHits ? 'Hit openTime > T' : 'All hits strictly before T',
  });

  const leakIndex = featsA.some((f) => f.index > T);
  checks.push({
    name: 'features_endExclusive',
    pass: !leakIndex,
    detail: leakIndex ? 'Feature index > T' : 'Feature indices <= T',
  });

  return { pass: checks.every((c) => c.pass), checks };
}
