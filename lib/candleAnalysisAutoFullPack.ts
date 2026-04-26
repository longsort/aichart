import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

/**
 * 캔들분석 자동 레이어 확장 팩 — 교육·휴리스틱 (자료 전범위에 가깝게 누적, 실전 신호 아님)
 * - 횡보/추세 사이클 배경, UTC 아시안(추정), 브로드닝, 자동 피보 띠, VP 미분 피크, 시나리오 점선, 승·패
 */

function clamp(i: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, i));
}

function atrLike(candles: Candle[], look = 14): number {
  const n = candles.length;
  if (n < 2) return 1e-9;
  const from = Math.max(1, n - look);
  let sum = 0;
  let c = 0;
  for (let i = from; i < n; i++) {
    const prev = candles[i - 1];
    const cu = candles[i];
    const tr = Math.max(cu.high - cu.low, Math.abs(cu.high - prev.close), Math.abs(cu.low - prev.close));
    sum += tr;
    c++;
  }
  return Math.max(c > 0 ? sum / c : candles[n - 1].high - candles[n - 1].low, 1e-9);
}

function barMsEstimate(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 3600_000;
  const take = Math.min(24, n - 1);
  let sum = 0;
  for (let i = n - take; i < n; i++) {
    sum += Math.max(1, (candles[i].time as number) - (candles[i - 1].time as number)) * 1000;
  }
  return Math.max(60_000, sum / take);
}

function priceRange(candles: Candle[]): { pMin: number; pMax: number } {
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of candles) {
    if (c.low < pMin) pMin = c.low;
    if (c.high > pMax) pMax = c.high;
  }
  return { pMin, pMax };
}

/** 횡보 vs 추세 세로 구간 배경 */
function buildCycleRegimeZones(candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 36) return [];
  const { pMin, pMax } = priceRange(candles);
  if (!(pMax > pMin)) return [];
  const w = 22;
  const atr = atrLike(candles, w);
  type Seg = { s: number; e: number; mode: 'range' | 'trendUp' | 'trendDn' };
  const tags: Seg['mode'][] = [];
  for (let e = w; e < n; e++) {
    const s = e - w;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = s; i <= e; i++) {
      const x = i - s;
      const y = candles[i].close;
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    const len = w + 1;
    const denom = len * sxx - sx * sx;
    const slope = denom !== 0 ? (len * sxy - sx * sy) / denom : 0;
    const norm = Math.abs(slope) / (atr / Math.max(1, w * 0.35));
    if (norm < 0.11) tags.push('range');
    else if (slope > 0) tags.push('trendUp');
    else tags.push('trendDn');
  }
  const out: OverlayItem[] = [];
  let runS = w;
  let runMode = tags[0];
  const flush = (endIdx: number) => {
    if (runMode == null) return;
    const tA = candles[runS].time as number;
    const tB = candles[endIdx].time as number;
    const id = `candle-analysis-auto-cycle-${tA}-${tB}-${runMode}`;
    const isR = runMode === 'range';
    out.push({
      id,
      kind: 'zone',
      label: isR ? '횡보(추정)' : runMode === 'trendUp' ? '추세↑' : '추세↓',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tA,
      time2: tB,
      price1: pMax * 1.001,
      price2: pMin * 0.999,
      confidence: 55,
      color:
        runMode === 'range'
          ? 'rgba(56, 189, 248, 0.07)'
          : runMode === 'trendUp'
            ? 'rgba(248, 113, 113, 0.06)'
            : 'rgba(167, 139, 250, 0.06)',
      lineLabelColor: isR ? '#38bdf8' : runMode === 'trendUp' ? '#f87171' : '#c4b5fd',
      category: 'labels',
    });
  };
  for (let k = 1; k < tags.length; k++) {
    const idx = w + k;
    if (tags[k] !== runMode) {
      flush(idx - 1);
      runS = idx;
      runMode = tags[k];
    }
  }
  flush(n - 1);
  return out.slice(-14);
}

/** UTC 일자 기준 초반 봉 = 아시안(추정, 암호화폐용) */
function buildAsianRangeZones(candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 16) return [];
  const dayMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const t = candles[i].time as number;
    const day = Math.floor(t / 86400);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(i);
  }
  const out: OverlayItem[] = [];
  const { pMin, pMax } = priceRange(candles);
  if (!(pMax > pMin)) return [];
  for (const [, idxs] of dayMap) {
    if (idxs.length < 10) continue;
    const k = Math.max(4, Math.min(8, Math.ceil(idxs.length * 0.15)));
    const head = idxs.slice(0, k);
    const s = head[0];
    const e = head[head.length - 1];
    let hi = -Infinity;
    let lo = Infinity;
    for (const j of head) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    const tA = candles[s].time as number;
    const tB = candles[e].time as number;
    const pad = Math.max((hi - lo) * 0.06, hi * 1e-5);
    out.push({
      id: `candle-analysis-auto-asian-${tA}`,
      kind: 'zone',
      label: '아시안(추정)',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tA,
      time2: tB,
      price1: hi + pad,
      price2: lo - pad,
      confidence: 60,
      color: 'rgba(251, 191, 36, 0.09)',
      lineLabelColor: '#fcd34d',
      category: 'labels',
    });
  }
  return out.slice(-12);
}

/** 변동폭 연속 확대 = 브로드닝(메가폰) 추정 */
function buildBroadeningZones(candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 48) return [];
  const { pMin, pMax } = priceRange(candles);
  if (!(pMax > pMin)) return [];
  const out: OverlayItem[] = [];
  const span = 18;
  for (let e = span * 2; e < n; e++) {
    const r0 = rangeOf(candles, e - span * 2, e - span);
    const r1 = rangeOf(candles, e - span, e);
    if (r0 <= 0 || r1 < r0 * 1.18) continue;
    const s = e - span * 2;
    const tA = candles[s].time as number;
    const tB = candles[e].time as number;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = s; i <= e; i++) {
      if (candles[i].high > hi) hi = candles[i].high;
      if (candles[i].low < lo) lo = candles[i].low;
    }
    const pad = Math.max((hi - lo) * 0.03, hi * 1e-5);
    out.push({
      id: `candle-analysis-auto-megaphone-${tA}-${tB}`,
      kind: 'zone',
      label: '브로드닝·확장',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tA,
      time2: tB,
      price1: hi + pad,
      price2: lo - pad,
      confidence: 58,
      color: 'rgba(244, 63, 94, 0.08)',
      lineLabelColor: '#fb7185',
      category: 'labels',
    });
    e += span;
  }
  return out.slice(-4);
}

function rangeOf(candles: Candle[], s: number, e: number): number {
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = s; i <= e; i++) {
    if (candles[i].high > hi) hi = candles[i].high;
    if (candles[i].low < lo) lo = candles[i].low;
  }
  return hi - lo;
}

/** 스윙 구간 피보 되돌림 띠 */
function buildAutoFibZones(candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 30) return [];
  const look = Math.min(120, n);
  const slice = candles.slice(-look);
  let iLo = 0;
  let iHi = 0;
  let vLo = Infinity;
  let vHi = -Infinity;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i].low < vLo) {
      vLo = slice[i].low;
      iLo = i;
    }
    if (slice[i].high > vHi) {
      vHi = slice[i].high;
      iHi = i;
    }
  }
  const baseGlobal = n - look;
  const t1 = candles[0].time as number;
  const t2 = candles[n - 1].time as number;
  let lowP: number;
  let highP: number;
  if (iLo <= iHi) {
    lowP = vLo;
    highP = vHi;
  } else {
    lowP = vLo;
    highP = vHi;
  }
  const diff = highP - lowP;
  if (!(diff > 0)) return [];
  const levels = [0.382, 0.5, 0.618];
  const out: OverlayItem[] = [];
  const w = Math.max(diff * 0.012, highP * 1e-5);
  let k = 0;
  for (const f of levels) {
    k += 1;
    const p = highP - diff * f;
    out.push({
      id: `candle-analysis-auto-fib-${k}-${Math.round(p * 1e4)}`,
      kind: 'zone',
      label: `피보·${f === 0.382 ? '38.2%' : f === 0.5 ? '50%' : '61.8%'}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: p + w,
      price2: p - w,
      confidence: 62,
      color: 'rgba(250, 204, 21, 0.09)',
      lineLabelColor: '#facc15',
      category: 'labels',
    });
  }
  return out;
}

/** 거래량 프로파일 미분 절대값 국소 피크 → 보조 매집/공백 라인 */
function buildVpDerivativeBandOverlays(candles: Candle[], t1: number, t2: number): OverlayItem[] {
  const n = candles.length;
  if (n < 28) return [];
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of candles) {
    if (c.low < pMin) pMin = c.low;
    if (c.high > pMax) pMax = c.high;
  }
  if (!(pMax > pMin)) return [];
  const numBins = clamp(Math.round(n * 0.2), 32, 88);
  const step = (pMax - pMin) / numBins;
  if (!(step > 0)) return [];
  const raw = new Array<number>(numBins).fill(0);
  for (const c of candles) {
    const v = c.volume > 0 ? c.volume : 1;
    let i0 = Math.floor((c.low - pMin) / step);
    let i1 = Math.floor((c.high - pMin) / step);
    i0 = clamp(i0, 0, numBins - 1);
    i1 = clamp(i1, 0, numBins - 1);
    if (i0 > i1) [i0, i1] = [i1, i0];
    const span = i1 - i0 + 1;
    const add = v / span;
    for (let i = i0; i <= i1; i++) raw[i] += add;
  }
  const smooth = raw.map((_, i) => {
    if (i === 0 || i === numBins - 1) return raw[i];
    return (raw[i - 1] + raw[i] * 2 + raw[i + 1]) / 4;
  });
  const dAbs: number[] = [];
  for (let i = 1; i < numBins; i++) {
    dAbs.push(Math.abs(smooth[i] - smooth[i - 1]));
  }
  const mean = dAbs.reduce((a, b) => a + b, 0) / Math.max(1, dAbs.length);
  const peaks: number[] = [];
  for (let i = 1; i < dAbs.length - 1; i++) {
    if (dAbs[i] >= dAbs[i - 1] && dAbs[i] >= dAbs[i + 1] && dAbs[i] > mean * 1.35) {
      peaks.push(i);
    }
  }
  peaks.sort((a, b) => dAbs[b] - dAbs[a]);
  const half = Math.max(step * 0.28, pMax * 1e-6);
  const out: OverlayItem[] = [];
  let r = 0;
  for (const bi of peaks.slice(0, 5)) {
    r += 1;
    const center = pMin + (bi + 0.5) * step;
    out.push({
      id: `candle-analysis-auto-vpderiv-${Math.round(center * 1e5)}`,
      kind: 'zone',
      label: `거래·변곡 ${r}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: center + half,
      price2: center - half,
      confidence: 61,
      color: 'rgba(52, 211, 153, 0.1)',
      lineLabelColor: '#5eead4',
      category: 'labels',
    });
  }
  return out;
}

/** 돌파·리테스트·휩소 스타일 시나리오 점선 (최근봉 기준) */
function buildScenarioPathLines(candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 5) return [];
  const last = candles[n - 1];
  const t0 = last.time as number;
  const p0 = last.close;
  const atr = atrLike(candles);
  const dt = barMsEstimate(candles) / 1000;
  const t1 = t0 + dt * 4;
  const t2 = t0 + dt * 10;
  const t3 = t0 + dt * 16;
  const out: OverlayItem[] = [];

  const seg = (
    id: string,
    label: string,
    te: number,
    pe: number,
    ts: number,
    ps: number,
    color: string,
    lineHex: string,
    dash: string
  ) => ({
    id,
    kind: 'trendLine' as const,
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: ts,
    time2: te,
    price1: ps,
    price2: pe,
    confidence: 48,
    color,
    lineLabelColor: lineHex,
    lineDash: dash,
    lineStrokeWidth: 1.25,
    category: 'labels' as const,
    noProject: true,
  });

  out.push(
    seg(
      'candle-analysis-auto-scen-breakout-up-a',
      '시나리오·돌파↑',
      t1,
      p0 + atr * 0.85,
      t0,
      p0,
      'rgba(74, 222, 128, 0.45)',
      '#4ade80',
      '3 4'
    )
  );
  out.push(
    seg(
      'candle-analysis-auto-scen-breakout-up-b',
      '시나리오·리테↑',
      t2,
      p0 + atr * 0.35,
      t1,
      p0 + atr * 0.85,
      'rgba(74, 222, 128, 0.35)',
      '#86efac',
      '3 4'
    )
  );
  out.push(
    seg(
      'candle-analysis-auto-scen-whipsaw',
      '시나리오·휩소',
      t2,
      p0 - atr * 0.9,
      t1,
      p0 + atr * 0.4,
      'rgba(251, 191, 36, 0.45)',
      '#fbbf24',
      '2 3'
    )
  );
  out.push(
    seg(
      'candle-analysis-auto-scen-breakdown',
      '시나리오·이탈↓',
      t3,
      p0 - atr * 1.15,
      t0,
      p0,
      'rgba(248, 113, 113, 0.45)',
      '#f87171',
      '3 4'
    )
  );
  return out;
}

/** 리테스트 이후 N봉 결과로 승·패(교육용) */
function buildOutcomeWinLossLabels(candles: Candle[], vpCenters: number[]): OverlayItem[] {
  const n = candles.length;
  if (n < 20 || vpCenters.length === 0) return [];
  const atr = atrLike(candles);
  const out: OverlayItem[] = [];
  const fwd = 6;
  const eps = atr * 0.08;
  const lvls = vpCenters.slice(0, 6);
  for (let i = 1; i < n - fwd; i += 2) {
    const c = candles[i];
    const t = c.time as number;
    for (const level of lvls) {
      const d = Math.max(level * 1.1e-4, atr * 0.1);
      const touchLow = c.low <= level + d && c.low >= level - d * 1.3 && c.close > level + d * 0.1;
      const touchHigh = c.high >= level - d && c.high <= level + d * 1.3 && c.close < level - d * 0.1;
      if (!touchLow && !touchHigh) continue;
      let hiF = -Infinity;
      let loF = Infinity;
      for (let j = 1; j <= fwd; j++) {
        hiF = Math.max(hiF, candles[i + j].high);
        loF = Math.min(loF, candles[i + j].low);
      }
      let win = false;
      if (touchLow) win = hiF > level + eps;
      else win = loF < level - eps;
      out.push({
        id: `candle-analysis-auto-wl-${t}-${Math.round(level * 1e3)}-${win ? 'w' : 'l'}`,
        kind: 'label',
        label: win ? '승(추정)' : '패(추정)',
        x1: 0,
        y1: 0,
        time1: t,
        price1: touchLow ? c.low * (1 - 3e-5) : c.high * (1 + 3e-5),
        confidence: 52,
        color: win ? 'rgba(74, 222, 128, 0.92)' : 'rgba(248, 113, 113, 0.92)',
        labelBackgroundColor: 'rgba(8,15,25,0.75)',
        category: 'labels',
      });
    }
  }
  out.sort((a, b) => (b.time1 as number) - (a.time1 as number));
  const seen = new Set<string>();
  const dedup: OverlayItem[] = [];
  for (const x of out) {
    const k = x.id;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(x);
    if (dedup.length >= 18) break;
  }
  return dedup;
}

/**
 * VP 중심가 배열(매집대+저거래대) — 호출부에서 computeCandleAnalysisVpLevelCenters 결과 전달
 */
export function buildCandleAnalysisAutoFullPack(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  timeframe: string,
  vpLevelPrices: number[] | null
): OverlayItem[] {
  void analysis;
  void timeframe;
  if (candles.length < 12) return [];
  const t1 = candles[0].time as number;
  const t2 = candles[candles.length - 1].time as number;
  const out: OverlayItem[] = [];

  out.push(...buildCycleRegimeZones(candles));
  out.push(...buildAsianRangeZones(candles));
  out.push(...buildBroadeningZones(candles));
  out.push(...buildAutoFibZones(candles));
  out.push(...buildVpDerivativeBandOverlays(candles, t1, t2));
  out.push(...buildScenarioPathLines(candles));
  if (vpLevelPrices && vpLevelPrices.length) {
    out.push(...buildOutcomeWinLossLabels(candles, vpLevelPrices));
  }

  return out;
}
