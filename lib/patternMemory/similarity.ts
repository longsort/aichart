/**
 * Coarse bucket → cosine candidates → rerank. No full scan of 300k.
 * asOfIndex exclusive: future bars never enter the pool.
 */
import { PATTERN_WINDOWS, TF_MIN_SEPARATION, type PatternMemoryModel, type PatternWindow, type SimilarityHit } from '@/lib/patternMemory/types';
import { computeBarFeatures, windowVector, type BarFeatures } from '@/lib/patternMemory/features';
import { isoUtc } from '@/lib/patternMemory/tfMap';
import type { StoredCandle } from '@/lib/patternMemory/types';

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a)) || 1e-12;
}

export function cosine(a: number[], b: number[]): number {
  return dot(a, b) / (norm(a) * norm(b));
}

export function euclidean(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

function structureMatch(a: BarFeatures, b: BarFeatures): number {
  let s = 0;
  if (a.regime === b.regime) s += 0.45;
  const ca = a.candleVec;
  const cb = b.candleVec;
  for (const i of [8, 9, 10, 11, 12, 13, 14]) {
    if (Math.abs((ca[i] || 0) - (cb[i] || 0)) < 0.15) s += 0.08;
  }
  return Math.min(1, s);
}

function volumeMatch(a: BarFeatures, b: BarFeatures): number {
  return (cosine(a.volumeVec, b.volumeVec) + 1) / 2;
}

export type SearchParams = {
  candles: StoredCandle[];
  asOfIndex: number;
  model: PatternMemoryModel;
  topK?: number;
  minCosine?: number;
  timeframe?: string;
  windows?: readonly PatternWindow[];
};

export function searchSimilarPatterns(params: SearchParams): SimilarityHit[] {
  const topK = params.topK ?? 100;
  const minCosine = params.minCosine ?? 0.72;
  const windows = params.windows ?? PATTERN_WINDOWS;
  const feats = computeBarFeatures(params.candles, params.asOfIndex + 1);
  const query = feats.find((f) => f.index === params.asOfIndex) || feats[feats.length - 1];
  if (!query) return [];
  const sep = TF_MIN_SEPARATION[params.timeframe || ''] ?? 6;
  const pool = feats.filter((f) => f.index < query.index - sep);
  const sameBucket = pool.filter((f) => f.bucket === query.bucket);
  const coarse = sameBucket.length >= 40 ? sameBucket : pool.filter((f) => f.regime === query.regime);
  const candidates = coarse.length >= 24 ? coarse : pool;
  const maxScan = Math.min(candidates.length, 8000);
  const scanned = candidates.length > maxScan ? candidates.filter((_, i) => i % Math.ceil(candidates.length / maxScan) === 0) : candidates;

  const hits: SimilarityHit[] = [];
  for (const win of windows) {
    const qv = windowVector(feats, query.index, win, params.model);
    if (!qv.length) continue;
    const scored: SimilarityHit[] = [];
    for (const cand of scanned) {
      const cv = windowVector(feats, cand.index, win, params.model);
      if (cv.length !== qv.length) continue;
      const cos = cosine(qv, cv);
      if (cos < minCosine) continue;
      const euc = euclidean(qv, cv);
      const corr = correlation(qv, cv);
      const sm = structureMatch(query, cand);
      const vm = params.model === 'CANDLE_VOLUME' ? volumeMatch(query, cand) : 0;
      const rerank = cos * 0.55 + ((corr + 1) / 2) * 0.2 + sm * 0.15 + (params.model === 'CANDLE_VOLUME' ? vm * 0.1 : 0) - Math.tanh(euc / 8) * 0.08;
      scored.push({
        openTime: cand.openTime,
        iso: isoUtc(cand.openTime),
        cosine: cos,
        euclidean: euc,
        correlation: corr,
        structureMatch: sm,
        volumeMatch: vm,
        rerank,
        regime: cand.regime,
        model: params.model,
        window: win,
      });
    }
    scored.sort((a, b) => b.rerank - a.rerank);
    const dedup: SimilarityHit[] = [];
    for (const h of scored) {
      if (dedup.some((x) => Math.abs(x.openTime - h.openTime) < sep * (params.candles[1]?.openTime && params.candles[0] ? params.candles[1].openTime - params.candles[0].openTime : 900_000))) {
        continue;
      }
      dedup.push(h);
      if (dedup.length >= topK) break;
    }
    hits.push(...dedup.slice(0, Math.min(20, topK)));
  }
  hits.sort((a, b) => b.rerank - a.rerank);
  const seen = new Set<number>();
  const out: SimilarityHit[] = [];
  for (const h of hits) {
    if (seen.has(h.openTime)) continue;
    seen.add(h.openTime);
    out.push(h);
    if (out.length >= topK) break;
  }
  return out;
}
