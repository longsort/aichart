import type { Candle, OverlayItem } from '@/types';

type Sample = {
  feat: number[];
  ret3: number;
  upMove: number;
  dnMove: number;
};

export type WhalePredictionSnapshot = {
  longProb: number;
  shortProb: number;
  longProbCalibrated: number;
  shortProbCalibrated: number;
  expectedPct: number;
  confidence: number;
  direction: 'LONG' | 'SHORT';
  hitRatePct: number | null;
  horizonBars: number;
  regime: 'trend' | 'range' | 'high-vol';
  quality: {
    winRatePct: number | null;
    expectancyPct: number | null;
    maxLossPct: number | null;
  };
};

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdev(xs: number[], mu: number): number {
  if (!xs.length) return 1;
  const v = xs.reduce((s, x) => s + (x - mu) * (x - mu), 0) / xs.length;
  return Math.sqrt(v) || 1;
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-9 ? dot / d : 0;
}

function tfSec(tf: string): number {
  const m: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
    '1w': 604800,
    '1M': 2592000,
  };
  return m[tf] ?? 3600;
}

function featureAt(arr: Candle[], i: number, volMu: number, volSigma: number): number[] | null {
  if (i < 5 || i >= arr.length) return null;
  const f: number[] = [];
  for (let k = i - 5; k <= i; k++) {
    const c = arr[k];
    const range = Math.max(1e-9, c.high - c.low);
    const body = Math.abs(c.close - c.open) / range;
    const dir = c.close >= c.open ? 1 : -1;
    const wz = (Number(c.volume || 0) - volMu) / Math.max(1e-9, volSigma);
    f.push(body, dir, wz);
  }
  return f;
}

function detectRegime(arr: Candle[]): 'trend' | 'range' | 'high-vol' {
  if (arr.length < 40) return 'range';
  const tail = arr.slice(-40);
  const closes = tail.map((c) => c.close);
  const hi = Math.max(...tail.map((c) => c.high));
  const lo = Math.min(...tail.map((c) => c.low));
  const rangePct = (hi - lo) / Math.max(1e-9, closes[0]);
  const ret = Math.abs((closes[closes.length - 1] - closes[0]) / Math.max(1e-9, closes[0]));
  const stepMoves: number[] = [];
  for (let i = 1; i < closes.length; i++) stepMoves.push(Math.abs((closes[i] - closes[i - 1]) / Math.max(1e-9, closes[i - 1])));
  const vol = avg(stepMoves);
  if (vol >= 0.02 || rangePct >= 0.25) return 'high-vol';
  if (ret >= 0.08) return 'trend';
  return 'range';
}

export function buildWhalePredictionOverlays(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  horizonBars?: number;
  minConfidence?: number;
  showHitRate?: boolean;
}): OverlayItem[] {
  const { symbol, timeframe, candles, horizonBars = 3, minConfidence = 65, showHitRate = true } = params;
  if (!candles.length || candles.length < 90) return [];
  const arr = candles.slice(-Math.min(1800, candles.length));
  const vols = arr.map((c) => Number(c.volume || 0));
  const volMu = avg(vols);
  const volSigma = stdev(vols, volMu);
  const horizon = Math.max(2, Math.min(6, Math.round(horizonBars)));
  const samples: Sample[] = [];
  for (let i = 8; i < arr.length - horizon; i++) {
    const feat = featureAt(arr, i, volMu, volSigma);
    if (!feat) continue;
    const now = arr[i].close;
    const next = arr[i + horizon].close;
    const seg = arr.slice(i + 1, i + horizon + 1);
    const hi = Math.max(...seg.map((c) => c.high));
    const lo = Math.min(...seg.map((c) => c.low));
    samples.push({
      feat,
      ret3: (next - now) / Math.max(1e-9, now),
      upMove: (hi - now) / Math.max(1e-9, now),
      dnMove: (lo - now) / Math.max(1e-9, now),
    });
  }
  if (samples.length < 40) return [];
  const curIdx = arr.length - 1;
  const curFeat = featureAt(arr, curIdx, volMu, volSigma);
  if (!curFeat) return [];
  const ranked = samples
    .map((s) => ({ ...s, sim: cosine(curFeat, s.feat) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 25);
  if (!ranked.length) return [];

  const longVotes = ranked.filter((r) => r.ret3 > 0).length;
  const shortVotes = ranked.length - longVotes;
  const longProb = longVotes / ranked.length;
  const shortProb = shortVotes / ranked.length;
  const meanRet = avg(ranked.map((r) => r.ret3));
  const avgUp = avg(ranked.map((r) => r.upMove));
  const avgDn = avg(ranked.map((r) => r.dnMove));
  const meanSim = avg(ranked.map((r) => Math.max(0, r.sim)));
  const conf = Math.max(55, Math.min(95, Math.round(55 + meanSim * 40)));
  if (conf < minConfidence) return [];

  // Lightweight rolling hit-rate estimate on recent samples.
  let hitRate: number | null = null;
  const evalCount = Math.min(50, Math.max(0, samples.length - 30));
  if (evalCount > 12) {
    let hit = 0;
    for (let e = samples.length - evalCount; e < samples.length; e++) {
      const cur = samples[e];
      const pool = samples.slice(0, e);
      if (pool.length < 25) continue;
      const top = pool
        .map((s) => ({ s, sim: cosine(cur.feat, s.feat) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 15);
      const p = top.filter((x) => x.s.ret3 > 0).length / Math.max(1, top.length);
      const predLong = p >= 0.5;
      const realLong = cur.ret3 >= 0;
      if (predLong === realLong) hit += 1;
    }
    const hr = (hit / evalCount) * 100;
    if (Number.isFinite(hr)) hitRate = hr;
  }
  const hitRateText = showHitRate && hitRate != null ? ` · 적중률 ${hitRate.toFixed(0)}%` : '';

  const last = arr[curIdx];
  const step = tfSec(timeframe);
  const t1 = last.time + step;
  const t2 = t1 + step * Math.max(2, horizon);
  const pNow = last.close;
  const pHi = pNow * (1 + Math.max(0.002, avgUp));
  const pLo = pNow * (1 + Math.min(-0.002, avgDn));
  const bullish = longProb >= shortProb;
  const pct = Math.abs(meanRet * 100);
  const dir = bullish ? 'LONG' : 'SHORT';
  const label = `${dir} ${(Math.max(longProb, shortProb) * 100).toFixed(0)}% · 예상 ${bullish ? '+' : '-'}${pct.toFixed(2)}%${hitRateText}`;
  const color = bullish ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';
  const lineColor = bullish ? '#22C55E' : '#EF4444';

  return [
    {
      id: `whale-predict-zone-${symbol}-${timeframe}-${last.time}`,
      kind: 'zone',
      label: `예고 ${dir}`,
      x1: t1,
      y1: pHi,
      x2: t2,
      y2: pLo,
      time1: t1,
      price1: pHi,
      time2: t2,
      price2: pLo,
      confidence: conf,
      color,
      category: 'zones',
    },
    {
      id: `whale-predict-label-${symbol}-${timeframe}-${last.time}`,
      kind: 'label',
      label,
      x1: t1,
      y1: bullish ? pHi : pLo,
      time1: t1,
      price1: bullish ? pHi : pLo,
      confidence: conf,
      color: lineColor,
      lineLabelColor: lineColor,
      labelBackgroundColor: 'rgba(8,15,25,0.72)',
      labelTextColor: '#E2E8F0',
      category: 'labels',
    },
  ];
}

export function buildWhalePredictionSnapshot(params: {
  timeframe: string;
  candles: Candle[];
  horizonBars?: number;
  minConfidence?: number;
}): WhalePredictionSnapshot | null {
  const { timeframe, candles, horizonBars = 3, minConfidence = 65 } = params;
  if (!candles.length || candles.length < 90) return null;
  const arr = candles.slice(-Math.min(1800, candles.length));
  const vols = arr.map((c) => Number(c.volume || 0));
  const volMu = avg(vols);
  const volSigma = stdev(vols, volMu);
  const horizon = Math.max(2, Math.min(6, Math.round(horizonBars)));
  const samples: Sample[] = [];
  for (let i = 8; i < arr.length - horizon; i++) {
    const feat = featureAt(arr, i, volMu, volSigma);
    if (!feat) continue;
    const now = arr[i].close;
    const next = arr[i + horizon].close;
    const seg = arr.slice(i + 1, i + horizon + 1);
    const hi = Math.max(...seg.map((c) => c.high));
    const lo = Math.min(...seg.map((c) => c.low));
    samples.push({
      feat,
      ret3: (next - now) / Math.max(1e-9, now),
      upMove: (hi - now) / Math.max(1e-9, now),
      dnMove: (lo - now) / Math.max(1e-9, now),
    });
  }
  if (samples.length < 40) return null;
  const curIdx = arr.length - 1;
  const curFeat = featureAt(arr, curIdx, volMu, volSigma);
  if (!curFeat) return null;
  const ranked = samples
    .map((s) => ({ ...s, sim: cosine(curFeat, s.feat) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 25);
  if (!ranked.length) return null;
  const longVotes = ranked.filter((r) => r.ret3 > 0).length;
  const longProb = longVotes / ranked.length;
  const shortProb = 1 - longProb;
  const meanRet = avg(ranked.map((r) => r.ret3));
  const meanSim = avg(ranked.map((r) => Math.max(0, r.sim)));
  const conf = Math.max(55, Math.min(95, Math.round(55 + meanSim * 40)));
  if (conf < minConfidence) return null;
  const regime = detectRegime(arr);

  // Probability calibration: shrink toward 50% depending on regime.
  const shrink = regime === 'trend' ? 0.92 : regime === 'range' ? 0.8 : 0.68;
  const longProbCal = 0.5 + (longProb - 0.5) * shrink;
  const shortProbCal = 1 - longProbCal;

  const evalCount = Math.min(20, Math.max(0, samples.length - 30));
  let hitRate: number | null = null;
  let wins = 0;
  let losses = 0;
  const pnlList: number[] = [];
  if (evalCount > 8) {
    let hit = 0;
    for (let e = samples.length - evalCount; e < samples.length; e++) {
      const cur = samples[e];
      const pool = samples.slice(0, e);
      if (pool.length < 20) continue;
      const top = pool
        .map((s) => ({ s, sim: cosine(cur.feat, s.feat) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 12);
      const p = top.filter((x) => x.s.ret3 > 0).length / Math.max(1, top.length);
      const predLong = p >= 0.5;
      const realLong = cur.ret3 >= 0;
      if (predLong === realLong) hit += 1;
      const pnl = predLong ? cur.ret3 : -cur.ret3;
      pnlList.push(pnl);
      if (pnl >= 0) wins++;
      else losses++;
    }
    hitRate = (hit / evalCount) * 100;
  }
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null;
  const expectancy = pnlList.length ? avg(pnlList) * 100 : null;
  const maxLoss = pnlList.length ? Math.min(...pnlList) * 100 : null;
  void timeframe;
  return {
    longProb,
    shortProb,
    longProbCalibrated: longProbCal,
    shortProbCalibrated: shortProbCal,
    expectedPct: Math.abs(meanRet * 100),
    confidence: conf,
    direction: longProbCal >= shortProbCal ? 'LONG' : 'SHORT',
    hitRatePct: hitRate,
    horizonBars: horizon,
    regime,
    quality: {
      winRatePct: winRate,
      expectancyPct: expectancy,
      maxLossPct: maxLoss,
    },
  };
}

