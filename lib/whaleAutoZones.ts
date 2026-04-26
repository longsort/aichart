import type { Candle, OverlayItem } from '@/types';

type WhaleAutoZoneOptions = {
  showForecastBoxes: boolean;
  showAccumulationBoxes: boolean;
  showDistributionBoxes: boolean;
  /** true면 Bu/Be-OB만 생성(축적·분산·BB·유사 MB 경로 없이 OB 푸시만) */
  msbObOnlyBuild?: boolean;
  onlyLocked: boolean;
  zigzagLen: number;
  fibFactor: number;
  deleteBrokenBoxes: boolean;
  buObHex: string;
  beObHex: string;
  buBbHex: string;
  beBbHex: string;
  similarityMinSamples: number;
};

type PersistRow = {
  id: string;
  locked: boolean;
  overlay: OverlayItem;
};

export type WhaleMemoryZoneInput = {
  id: string;
  label: string;
  time1: number;
  time2: number;
  price1: number;
  price2: number;
  confidence?: number;
  color?: string;
};

const STORAGE_KEY = 'ailongshort-whale-auto-zones-v2';
const MAX_ROWS = 300;
const TOPK_SIM = 5;

function tfSec(tf: string): number {
  const m: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400,
    '1d': 86400, '1w': 604800, '1M': 2592000, '1Y': 31536000,
  };
  return m[tf] ?? 3600;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toRgba(hex: string, a: number): string {
  const h = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(148,163,184,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

type ZoneBias = 'BUY' | 'SELL' | 'MIXED';

function zoneBiasFromFlow(arr: Candle[], idx: number, lookback = 10): { bias: ZoneBias; strength: number } {
  const from = Math.max(0, idx - Math.max(3, lookback) + 1);
  let buy = 0;
  let sell = 0;
  for (let i = from; i <= idx; i++) {
    const c = arr[i];
    const vol = Math.max(0, Number(c.volume ?? 0));
    const range = Math.max(1e-9, c.high - c.low);
    const closePos = clamp((c.close - c.low) / range, 0, 1);
    buy += vol * closePos;
    sell += vol * (1 - closePos);
  }
  const total = buy + sell;
  if (total <= 1e-9) return { bias: 'MIXED', strength: 0 };
  const edge = (buy - sell) / total;
  const absEdge = Math.abs(edge);
  if (edge >= 0.16) return { bias: 'BUY', strength: absEdge };
  if (edge <= -0.16) return { bias: 'SELL', strength: absEdge };
  return { bias: 'MIXED', strength: absEdge };
}

function zoneBiasFromPriceAction(arr: Candle[], from: number, to: number): { bias: ZoneBias; strength: number } {
  const s = Math.max(0, Math.min(from, arr.length - 1));
  const e = Math.max(s, Math.min(to, arr.length - 1));
  if (e <= s) return { bias: 'MIXED', strength: 0 };
  const open0 = Number(arr[s].open ?? arr[s].close ?? 0);
  const close1 = Number(arr[e].close ?? arr[e].open ?? 0);
  if (!Number.isFinite(open0) || !Number.isFinite(close1) || open0 <= 0) return { bias: 'MIXED', strength: 0 };
  const pct = (close1 - open0) / open0;
  const absPct = Math.abs(pct);
  // 구간 방향이 미약하면 중립
  if (absPct < 0.003) return { bias: 'MIXED', strength: absPct };
  return { bias: pct > 0 ? 'BUY' : 'SELL', strength: absPct };
}

function detectVolumeStatZones(
  arr: Candle[],
  stepSec: number
): Array<{ id: string; label: string; color: string; t1: number; pHi: number; pLo: number; conf: number; bias: ZoneBias }> {
  const out: Array<{ id: string; label: string; color: string; t1: number; pHi: number; pLo: number; conf: number; bias: ZoneBias }> = [];
  if (arr.length < 48) return out;
  const win = 14;
  const ranges = arr.map((c) => Math.max(1e-9, c.high - c.low));
  for (let end = win; end < arr.length; end++) {
    const from = end - win + 1;
    const seg = arr.slice(from, end + 1);
    const flow = zoneBiasFromFlow(arr, end, win);
    const priceBias = zoneBiasFromPriceAction(arr, from, end);
    if (flow.bias === 'MIXED' || priceBias.bias === 'MIXED') continue;
    if (flow.bias !== priceBias.bias) continue;
    const finalBias: ZoneBias = flow.bias;
    const segHi = Math.max(...seg.map((c) => c.high));
    const segLo = Math.min(...seg.map((c) => c.low));
    const segRange = Math.max(1e-9, segHi - segLo);
    const avgRange = avg(ranges.slice(from, end + 1));
    const ctxFrom = Math.max(0, from - 28);
    const ctxAvgRange = avg(ranges.slice(ctxFrom, from + 1));
    const compression = clamp(1 - avgRange / Math.max(1e-9, ctxAvgRange), 0, 1);
    const flowScore = flow.strength;
    const trendScore = priceBias.strength;
    const closePosAvg = avg(seg.map((c) => {
      const r = Math.max(1e-9, c.high - c.low);
      return clamp((c.close - c.low) / r, 0, 1);
    }));
    // 거래량·가격·캔들마감 위치 3중 합의(정밀)
    if (finalBias === 'BUY' && closePosAvg < 0.54) continue;
    if (finalBias === 'SELL' && closePosAvg > 0.46) continue;
    const score = flowScore * 0.4 + trendScore * 0.4 + compression * 0.2;
    if (score < 0.32) continue;
    const conf = clamp(64 + score * 34, 64, 96);
    const anchor = arr[end].time;
    const label = finalBias === 'BUY' ? '거래량 매집존' : '거래량 분배존';
    const color = finalBias === 'BUY' ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)';
    const id = `whale-auto-volstat-${finalBias.toLowerCase()}-${stepSec}-${anchor}`;
    out.push({
      id,
      label,
      color,
      t1: anchor,
      pHi: segHi,
      pLo: segLo,
      conf,
      bias: finalBias,
    });
  }
  // 최근/강한 존 우선 2개까지만 유지(과밀 방지)
  return out
    .sort((a, b) => b.conf - a.conf || b.t1 - a.t1)
    .slice(0, 2)
    .sort((a, b) => a.t1 - b.t1);
}

function rangesOverlapRatio(aLo: number, aHi: number, bLo: number, bHi: number): number {
  const lo = Math.max(Math.min(aLo, aHi), Math.min(bLo, bHi));
  const hi = Math.min(Math.max(aLo, aHi), Math.max(bLo, bHi));
  const inter = Math.max(0, hi - lo);
  const den = Math.max(1e-9, Math.min(Math.abs(aHi - aLo), Math.abs(bHi - bLo)));
  return inter / den;
}

function resolveWhaleZoneOverlaps(rows: PersistRow[]): PersistRow[] {
  const picked: PersistRow[] = [];
  const isSameCluster = (a: OverlayItem, b: OverlayItem) => {
    const at1 = Number(a.time1 ?? a.x1 ?? 0);
    const at2 = Number(a.time2 ?? a.x2 ?? at1);
    const bt1 = Number(b.time1 ?? b.x1 ?? 0);
    const bt2 = Number(b.time2 ?? b.x2 ?? bt1);
    const timeOverlap = !(at2 < bt1 || bt2 < at1);
    if (!timeOverlap) return false;
    const aHi = Number(a.price1 ?? a.y1 ?? 0);
    const aLo = Number(a.price2 ?? a.y2 ?? 0);
    const bHi = Number(b.price1 ?? b.y1 ?? 0);
    const bLo = Number(b.price2 ?? b.y2 ?? 0);
    return rangesOverlapRatio(aLo, aHi, bLo, bHi) >= 0.58;
  };
  const rank = (o: OverlayItem) => {
    const lbl = String(o.label || '');
    const conf = Number(o.confidence ?? 60);
    const obBoost = lbl.includes('OB') ? 14 : lbl.includes('BB') || lbl.includes('MB') ? 7 : 0;
    const dirBoost = lbl.includes('BUY') || lbl.includes('SELL') ? 4 : 0;
    return conf + obBoost + dirBoost;
  };
  const sorted = [...rows].sort((a, b) => rank(b.overlay) - rank(a.overlay));
  for (const row of sorted) {
    if (picked.some((x) => isSameCluster(x.overlay, row.overlay))) continue;
    picked.push(row);
  }
  return picked.sort((a, b) => Number((a.overlay.time1 ?? a.overlay.x1 ?? 0)) - Number((b.overlay.time1 ?? b.overlay.x1 ?? 0)));
}

function featureFrom(arr: Candle[], endIdx: number, volMu: number, volSigma: number): number[] | null {
  if (endIdx < 3 || endIdx >= arr.length) return null;
  const out: number[] = [];
  for (let i = endIdx - 3; i <= endIdx; i++) {
    const c = arr[i];
    const range = Math.max(1e-9, c.high - c.low);
    const body = Math.abs(c.close - c.open) / range;
    const upW = (c.high - Math.max(c.open, c.close)) / range;
    const dnW = (Math.min(c.open, c.close) - c.low) / range;
    const dir = c.close >= c.open ? 1 : -1;
    const vz = (Number(c.volume || 0) - volMu) / Math.max(1e-9, volSigma);
    out.push(body, upW, dnW, dir, vz);
  }
  return out;
}

function stdev(nums: number[], mu: number): number {
  if (!nums.length) return 1;
  const v = nums.reduce((s, x) => s + (x - mu) * (x - mu), 0) / nums.length;
  return Math.sqrt(v) || 1;
}

function loadAll(): Record<string, PersistRow[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, PersistRow[]>;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function saveAll(v: Record<string, PersistRow[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {}
}

function key(symbol: string, timeframe: string): string {
  return `${symbol.toUpperCase()}|${timeframe}`;
}

function makeZone(
  id: string,
  label: string,
  color: string,
  t1: number,
  t2: number,
  p1: number,
  p2: number,
  confidence: number
): OverlayItem {
  return {
    id,
    kind: 'zone',
    label,
    x1: t1,
    y1: p1,
    x2: t2,
    y2: p2,
    time1: t1,
    time2: t2,
    price1: p1,
    price2: p2,
    confidence,
    color,
    category: 'zones',
  };
}

export function buildWhaleZonesFromMemoryRows(rows: WhaleMemoryZoneInput[]): OverlayItem[] {
  return rows.map((r, i) => {
    const id = r.id || `whale-memory-${i}-${r.time1}`;
    return {
      id,
      kind: 'zone',
      label: r.label || 'Whale-Zone',
      x1: r.time1,
      y1: r.price1,
      x2: r.time2,
      y2: r.price2,
      time1: r.time1,
      time2: r.time2,
      price1: r.price1,
      price2: r.price2,
      confidence: Number.isFinite(r.confidence) ? Number(r.confidence) : 72,
      color: r.color || 'rgba(148,163,184,0.22)',
      category: 'zones',
    } as OverlayItem;
  });
}

export function buildWhaleAutoZones(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  options: WhaleAutoZoneOptions;
}): OverlayItem[] {
  const { symbol, timeframe, candles, options } = params;
  if (typeof window === 'undefined') return [];
  if (candles.length < 30) return [];
  const k = key(symbol, timeframe);
  const step = tfSec(timeframe);
  const all = loadAll();
  const prev = all[k] ?? [];
  const byId = new Map(prev.map((r) => [r.id, r] as const));
  const out: PersistRow[] = [...prev];
  const arr = candles.slice(-Math.max(220, Math.min(520, candles.length)));
  const volArr = arr.map((c) => Number(c.volume || 0));
  const volMu = avg(volArr);
  const volSigma = stdev(volArr, volMu);
  const zigzagLen = Math.max(3, Math.min(25, Math.round(options.zigzagLen || 9)));
  const fibFactor = clamp(Number(options.fibFactor || 0.33), 0.05, 0.95);
  const minSimSamples = Math.max(20, Math.min(500, Math.round(options.similarityMinSamples || 60)));
  const extendBars = 10;

  type Pivot = { index: number; time: number; price: number };
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];

  let trend = 1;
  const maxIn = (from: number, to: number): number => {
    let m = -Infinity;
    for (let i = from; i <= to; i++) m = Math.max(m, arr[i].high);
    return m;
  };
  const minIn = (from: number, to: number): number => {
    let m = Infinity;
    for (let i = from; i <= to; i++) m = Math.min(m, arr[i].low);
    return m;
  };
  const argMaxIn = (from: number, to: number): number => {
    let idx = from;
    let v = -Infinity;
    for (let i = from; i <= to; i++) {
      if (arr[i].high >= v) {
        v = arr[i].high;
        idx = i;
      }
    }
    return idx;
  };
  const argMinIn = (from: number, to: number): number => {
    let idx = from;
    let v = Infinity;
    for (let i = from; i <= to; i++) {
      if (arr[i].low <= v) {
        v = arr[i].low;
        idx = i;
      }
    }
    return idx;
  };

  for (let i = zigzagLen; i < arr.length; i++) {
    const from = Math.max(0, i - zigzagLen + 1);
    const toUp = arr[i].high >= maxIn(from, i);
    const toDown = arr[i].low <= minIn(from, i);
    const prevTrend = trend;
    trend = trend === 1 && toDown ? -1 : trend === -1 && toUp ? 1 : trend;
    if (trend !== prevTrend) {
      if (trend === 1) {
        const li = argMinIn(from, i);
        lows.push({ index: li, time: arr[li].time, price: arr[li].low });
      } else {
        const hi = argMaxIn(from, i);
        highs.push({ index: hi, time: arr[hi].time, price: arr[hi].high });
      }
    }
  }

  const fresh: PersistRow[] = [];
  const longSamples: Array<{ feature: number[]; offHi: number; offLo: number }> = [];
  const shortSamples: Array<{ feature: number[]; offHi: number; offLo: number }> = [];
  let market = 1;
  const makeId = (prefix: string, t: number, p: number) => `${prefix}-${timeframe}-${t}-${Math.round(p * 100)}`;
  const pushZone = (
    id: string,
    label: string,
    color: string,
    t1: number,
    pHi: number,
    pLo: number,
    conf = 78,
    bias: ZoneBias = 'MIXED'
  ) => {
    const taggedLabel = bias === 'MIXED' ? label : `${label}(${bias})`;
    const ov = makeZone(id, taggedLabel, color, t1, t1 + step * extendBars, pHi, pLo, conf);
    fresh.push({ id, overlay: ov, locked: true });
  };

  for (let i = 1; i < Math.min(highs.length, lows.length); i++) {
    const h0 = highs[highs.length - 1 - i];
    const h1 = highs[highs.length - 2 - i];
    const l0 = lows[lows.length - 1 - i];
    const l1 = lows[lows.length - 2 - i];
    if (!h0 || !h1 || !l0 || !l1) continue;
    const prevMarket = market;
    if (market === 1 && l0.price < l1.price && l0.price < l1.price - Math.abs(h0.price - l1.price) * fibFactor) market = -1;
    else if (market === -1 && h0.price > h1.price && h0.price > h1.price + Math.abs(h1.price - l0.price) * fibFactor) market = 1;
    if (market === prevMarket) continue;

    const left = Math.max(0, Math.min(h1.index, l1.index) - zigzagLen);
    const right = Math.max(h0.index, l0.index);
    const findLast = (from: number, to: number, pred: (c: Candle) => boolean): number => {
      let idx = -1;
      for (let j = Math.max(0, from); j <= Math.min(arr.length - 1, to); j++) {
        if (pred(arr[j])) idx = j;
      }
      return idx;
    };

    const obOnly = options.msbObOnlyBuild === true;
    if (market === 1) {
      if (options.showAccumulationBoxes || obOnly) {
        const obIdx = findLast(Math.min(h1.index, l0.index), Math.max(h1.index, l0.index), (c) => c.open > c.close);
        if (obIdx >= 0) {
          const c = arr[obIdx];
          pushZone(
            makeId('whale-auto-bu-ob', c.time, c.high),
            '매집핵심',
            toRgba(options.buObHex, 0.30),
            c.time,
            c.high,
            c.low,
            84,
            'BUY'
          );
        }
      }
      if (options.showAccumulationBoxes && !obOnly) {
        const bbIdx = findLast(left, Math.max(h1.index, l1.index), (c) => c.open < c.close);
        if (bbIdx >= 0) {
          const c = arr[bbIdx];
          const flow = zoneBiasFromFlow(arr, bbIdx, 12);
          const flowColor =
            flow.bias === 'BUY'
              ? 'rgba(14,165,233,0.22)'
              : flow.bias === 'SELL'
                ? 'rgba(245,158,11,0.22)'
                : toRgba(options.buBbHex, 0.16);
          const tag = '매집준비';
          pushZone(
            makeId('whale-auto-bu-bb', c.time, c.high),
            tag,
            flowColor,
            c.time,
            c.high,
            c.low,
            clamp(74 + flow.strength * 18, 68, 94),
            flow.bias
          );
          if (options.showForecastBoxes && right >= 3) {
            const fromCtx = Math.max(0, right - 24);
            const seg = arr.slice(fromCtx, right + 1);
            const segHi = Math.max(...seg.map((x) => x.high));
            const segLo = Math.min(...seg.map((x) => x.low));
            const segMid = (segHi + segLo) * 0.5;
            const segRange = Math.max(1e-9, segHi - segLo);
            const feat = featureFrom(arr, right, volMu, volSigma);
            if (feat) longSamples.push({ feature: feat, offHi: (c.high - segMid) / segRange, offLo: (c.low - segMid) / segRange });
          }
        }
      }
    } else {
      if (options.showDistributionBoxes || obOnly) {
        const obIdx = findLast(Math.min(l1.index, h0.index), Math.max(l1.index, h0.index), (c) => c.open < c.close);
        if (obIdx >= 0) {
          const c = arr[obIdx];
          pushZone(
            makeId('whale-auto-be-ob', c.time, c.high),
            '분배핵심',
            toRgba(options.beObHex, 0.30),
            c.time,
            c.high,
            c.low,
            84,
            'SELL'
          );
        }
      }
      if (options.showDistributionBoxes && !obOnly) {
        const bbIdx = findLast(left, Math.max(h1.index, l1.index), (c) => c.open > c.close);
        if (bbIdx >= 0) {
          const c = arr[bbIdx];
          const flow = zoneBiasFromFlow(arr, bbIdx, 12);
          const flowColor =
            flow.bias === 'SELL'
              ? 'rgba(249,115,22,0.22)'
              : flow.bias === 'BUY'
                ? 'rgba(14,165,233,0.22)'
                : toRgba(options.beBbHex, 0.16);
          const tag = '분배준비';
          pushZone(
            makeId('whale-auto-be-bb', c.time, c.high),
            tag,
            flowColor,
            c.time,
            c.high,
            c.low,
            clamp(74 + flow.strength * 18, 68, 94),
            flow.bias
          );
          if (options.showForecastBoxes && right >= 3) {
            const fromCtx = Math.max(0, right - 24);
            const seg = arr.slice(fromCtx, right + 1);
            const segHi = Math.max(...seg.map((x) => x.high));
            const segLo = Math.min(...seg.map((x) => x.low));
            const segMid = (segHi + segLo) * 0.5;
            const segRange = Math.max(1e-9, segHi - segLo);
            const feat = featureFrom(arr, right, volMu, volSigma);
            if (feat) shortSamples.push({ feature: feat, offHi: (c.high - segMid) / segRange, offLo: (c.low - segMid) / segRange });
          }
        }
      }
    }
  }

  if (options.showForecastBoxes && arr.length >= 32 && !options.msbObOnlyBuild) {
    const curIdx = arr.length - 1;
    const curFeat = featureFrom(arr, curIdx, volMu, volSigma);
    const seg = arr.slice(Math.max(0, curIdx - 24), curIdx + 1);
    const segHi = Math.max(...seg.map((x) => x.high));
    const segLo = Math.min(...seg.map((x) => x.low));
    const segMid = (segHi + segLo) * 0.5;
    const segRange = Math.max(1e-9, segHi - segLo);
    const project = (
      sampleList: Array<{ feature: number[]; offHi: number; offLo: number }>,
      dir: 'long' | 'short'
    ) => {
      if (!curFeat || sampleList.length < minSimSamples) return;
      const ranked = sampleList
        .map((s) => ({ ...s, sim: cosine(curFeat, s.feature) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, TOPK_SIM);
      if (!ranked.length) return;
      const hi = avg(ranked.map((r) => segMid + r.offHi * segRange));
      const lo = avg(ranked.map((r) => segMid + r.offLo * segRange));
      const pHi = Math.max(hi, lo);
      const pLo = Math.min(hi, lo);
      const sim = avg(ranked.map((r) => Math.max(0, r.sim)));
      const conf = clamp(55 + sim * 40, 55, 95);
      const label = dir === 'long' ? '매집준비 BUY' : '분배준비 SELL';
      const color = dir === 'long' ? 'rgba(14,165,233,0.18)' : 'rgba(249,115,22,0.18)';
      const id = makeId(dir === 'long' ? 'whale-auto-buy-forecast-sim' : 'whale-auto-sell-forecast-sim', arr[curIdx].time, pHi);
      pushZone(id, label, color, arr[curIdx].time + step, pHi, pLo, conf);
    };
    project(longSamples, 'long');
    project(shortSamples, 'short');
  }

  // 거래량 통계 기반 매집/분배 존: 최근 구간의 볼륨 편향 + 압축 구간을 존으로 승격
  if (!options.msbObOnlyBuild) {
    const volStatZones = detectVolumeStatZones(arr, step);
    for (const z of volStatZones) {
      pushZone(z.id, z.label, z.color, z.t1, z.pHi, z.pLo, z.conf, z.bias);
    }
  }

  for (const f of fresh) {
    if (!byId.has(f.id)) out.push(f);
  }

  const latestClose = candles[candles.length - 1]?.close ?? 0;
  const filtered = options.deleteBrokenBoxes
    ? out.filter((r) => {
        const top = Math.max(Number(r.overlay.price1 ?? r.overlay.y1 ?? 0), Number(r.overlay.price2 ?? r.overlay.y2 ?? 0));
        const bot = Math.min(Number(r.overlay.price1 ?? r.overlay.y1 ?? 0), Number(r.overlay.price2 ?? r.overlay.y2 ?? 0));
        const oid = String(r.overlay.id || '');
        const isBuyZone = /whale-auto-(bu-|buy-)/i.test(oid);
        const isSellZone = /whale-auto-(be-|sell-)/i.test(oid);
        if (isBuyZone) return latestClose >= bot;
        if (isSellZone) return latestClose <= top;
        return true;
      })
    : out;
  const dedup = new Map<string, PersistRow>();
  for (const r of filtered) dedup.set(r.id, r);
  let merged = resolveWhaleZoneOverlaps([...dedup.values()]);
  if (merged.length > MAX_ROWS) merged = merged.slice(-MAX_ROWS);
  all[k] = merged;
  saveAll(all);

  const visible = options.onlyLocked ? merged.filter((r) => r.locked) : merged;
  const nowFlow = zoneBiasFromFlow(arr, arr.length - 1, 18);
  const directionalPruned = visible.filter((r) => {
    const id = String(r.overlay.id || '');
    const isBuyZone = /whale-auto-(bu-|buy-|volstat-buy)/i.test(id);
    const isSellZone = /whale-auto-(be-|sell-|volstat-sell)/i.test(id);
    // 최근 흐름이 한쪽으로 충분히 기울면 반대 존은 화면에서 숨김(오판 독해 방지)
    if (nowFlow.strength >= 0.2 && nowFlow.bias === 'SELL' && isBuyZone) return false;
    if (nowFlow.strength >= 0.2 && nowFlow.bias === 'BUY' && isSellZone) return false;
    return true;
  });
  return directionalPruned.map((r) => {
    const o = { ...r.overlay };
    if (r.locked) {
      o.label = `${o.label} (고정)`;
      o.confidence = clamp((o.confidence ?? 60) + 8, 0, 100);
    }
    return o;
  });
}

