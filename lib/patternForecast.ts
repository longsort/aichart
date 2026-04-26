import type { Candle } from '@/types';

export type PatternForecastMatch = {
  rank: number;
  similarity: number;
  patternEndIdx: number;
  patternEndTime: number;
  patternEndClose: number;
  fwdPct: Record<number, number>;
};

export type PatternForecastHorizonStats = {
  horizon: number;
  meanPct: number;
  medianPct: number;
  p25Pct: number;
  p75Pct: number;
  probUp: number;
};

export type PatternForecastVirtualBar = {
  barsAhead: number;
  meanPctFromNow: number;
  p25Pct: number;
  p75Pct: number;
};

export type PatternForecastResult = {
  patternBars: number;
  historyBars: number;
  horizons: number[];
  currentClose: number;
  currentTime: number;
  topK: number;
  horizonsStats: PatternForecastHorizonStats[];
  virtualPath: PatternForecastVirtualBar[];
  matches: PatternForecastMatch[];
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
}

/**
 * 끝 인덱스 endIdx에서 길이 W 패턴: (W-1)개 로그수익률 + W개 거래량 z(log vol)
 */
export function extractPatternFeatures(candles: Candle[], endIdx: number, W: number): number[] | null {
  if (W < 4 || endIdx < W - 1 || endIdx >= candles.length) return null;
  const start = endIdx - W + 1;
  const rets: number[] = [];
  for (let i = start + 1; i <= endIdx; i++) {
    const prev = candles[i - 1].close;
    const c = candles[i].close;
    if (!Number.isFinite(prev) || !Number.isFinite(c) || prev <= 0 || c <= 0) return null;
    rets.push(Math.log(c / prev));
  }
  const volRaw: number[] = [];
  for (let i = start; i <= endIdx; i++) {
    volRaw.push(Math.log(Math.max(0, candles[i].volume ?? 0) + 1));
  }
  const m = volRaw.reduce((s, v) => s + v, 0) / volRaw.length;
  const var0 =
    volRaw.reduce((s, v) => {
      const d = v - m;
      return s + d * d;
    }, 0) / volRaw.length;
  const std = Math.sqrt(Math.max(var0, 1e-12));
  const zVol = volRaw.map((v) => (v - m) / std);
  return rets.concat(zVol);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computePatternForecast(
  candles: Candle[],
  options: {
    patternBars: number;
    horizons: number[];
    topK: number;
  }
): PatternForecastResult | { error: string } {
  const W = Math.max(8, Math.min(96, Math.floor(options.patternBars)));
  const horizons = (options.horizons?.length ? options.horizons : [1, 4, 12])
    .map((h) => Math.max(1, Math.floor(h)))
    .filter((h, i, a) => a.indexOf(h) === i)
    .sort((a, b) => a - b);
  const maxH = horizons.length ? Math.max(...horizons) : 1;
  const topK = Math.max(3, Math.min(30, Math.floor(options.topK)));

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (n < W + maxH + 20) {
    return { error: `캔들이 부족합니다 (필요: 약 ${W + maxH + 20}봉 이상, 현재 ${n}봉)` };
  }

  const queryEnd = n - 1;
  const query = extractPatternFeatures(sorted, queryEnd, W);
  if (!query) return { error: '현재 구간 특징 추출 실패' };

  /** 패턴 [end-W+1..end]가 현재 패턴과 겹치지 않으려면 end ≤ n-W-1 (= queryEnd - W) */
  const maxEnd = queryEnd - W;
  const minEnd = W - 1;
  type Cand = { end: number; sim: number };
  const cands: Cand[] = [];

  for (let end = minEnd; end <= maxEnd; end++) {
    const f = extractPatternFeatures(sorted, end, W);
    if (!f) continue;
    const sim = cosineSimilarity(query, f);
    cands.push({ end, sim });
  }

  if (cands.length < topK) {
    return { error: '과거 매칭 후보가 부족합니다' };
  }

  cands.sort((a, b) => b.sim - a.sim);
  const best = cands.slice(0, topK);

  const matches: PatternForecastMatch[] = best.map((c, i) => {
    const i0 = c.end;
    const close0 = sorted[i0].close;
    const fwdPct: Record<number, number> = {};
    for (const h of horizons) {
      const j = i0 + h;
      if (j < n && close0 > 0) {
        fwdPct[h] = ((sorted[j].close / close0 - 1) * 100);
      } else {
        fwdPct[h] = NaN;
      }
    }
    return {
      rank: i + 1,
      similarity: c.sim,
      patternEndIdx: i0,
      patternEndTime: sorted[i0].time,
      patternEndClose: close0,
      fwdPct,
    };
  });

  const horizonsStats: PatternForecastHorizonStats[] = horizons.map((h) => {
    const vals = matches.map((m) => m.fwdPct[h]).filter((x) => Number.isFinite(x)) as number[];
    const sortedVals = [...vals].sort((a, b) => a - b);
    const probUp = vals.length ? vals.filter((x) => x > 0).length / vals.length : 0;
    return {
      horizon: h,
      meanPct: vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : NaN,
      medianPct: percentile(sortedVals, 0.5),
      p25Pct: percentile(sortedVals, 0.25),
      p75Pct: percentile(sortedVals, 0.75),
      probUp,
    };
  });

  const maxPath = Math.min(24, maxH);
  const virtualPath: PatternForecastVirtualBar[] = [];
  for (let s = 1; s <= maxPath; s++) {
    const pctList: number[] = [];
    for (const m of matches) {
      const i0 = m.patternEndIdx;
      const j = i0 + s;
      const close0 = sorted[i0].close;
      if (j < n && close0 > 0) {
        pctList.push((sorted[j].close / close0 - 1) * 100);
      }
    }
    if (pctList.length === 0) continue;
    const sortedP = [...pctList].sort((a, b) => a - b);
    virtualPath.push({
      barsAhead: s,
      meanPctFromNow: pctList.reduce((a, b) => a + b, 0) / pctList.length,
      p25Pct: percentile(sortedP, 0.25),
      p75Pct: percentile(sortedP, 0.75),
    });
  }

  return {
    patternBars: W,
    historyBars: n,
    horizons,
    currentClose: sorted[queryEnd].close,
    currentTime: sorted[queryEnd].time,
    topK,
    horizonsStats,
    virtualPath,
    matches,
  };
}
