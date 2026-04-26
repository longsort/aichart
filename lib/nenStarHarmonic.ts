import type { Candle, OverlayItem } from '@/types';
import { detectZigzagPivots, type ZigzagPivot } from '@/lib/candleAnalysisElliottMvp';

/**
 * TradingView 「Nen Star Harmonic Pattern [TradingFinder]」 Pine 대응
 * HP.XABCD(..., PP, 0.382, 0.786, 1.13, 1.272, 1.272, 2.618, 1.13, 1.414)
 * — 지그재그 피벗(PP=3) + 위 비율 범위로 Bull/Bear Nen-Star 탐지
 */
const TOL = 0.07;

/** Pine ColorBull / ColorBear 기본 */
export const NEN_STAR_LINE_HEX = '#0609bb';
export const NEN_STAR_PROJ_BULL = 'rgba(34,197,94,0.42)';
export const NEN_STAR_PROJ_BEAR = 'rgba(239,68,68,0.42)';

export type NenStarHarmonicHit = {
  x: number;
  a: number;
  b: number;
  c: number;
  d: number;
  xPrice: number;
  aPrice: number;
  bPrice: number;
  cPrice: number;
  dPrice: number;
  bias: 'bullish' | 'bearish';
  /** 0~1, 비율이 범위 중앙에 가까울수록 높음 */
  score: number;
  /** 내부 점선 라벨용 (TradingView 스샷과 동일 의미) */
  ratios: {
    /** B 되돌림 / XA */
    retracementB: number;
    /** BC / AB (확장) */
    extensionC: number;
    /** CD / BC */
    extensionD: number;
    /** (A−D) / XA — Pine 마지막 쌍 1.13~1.414 */
    adOverXa: number;
  };
  /** D 봉에서 캔들 확인 (롱: 양봉, 숏: 음봉) — plotshape 대응 */
  candleConfirm: boolean;
};

function inRange(v: number, lo: number, hi: number): boolean {
  return v >= lo - TOL && v <= hi + TOL;
}

function scoreFromRanges(
  checks: Array<{ v: number; lo: number; hi: number; weight: number }>
): number {
  let s = 0;
  let wsum = 0;
  for (const { v, lo, hi, weight } of checks) {
    wsum += weight;
    if (!inRange(v, lo, hi)) return 0;
    const mid = (lo + hi) / 2;
    const span = Math.max(1e-9, hi - lo);
    const dist = Math.abs(v - mid) / span;
    s += weight * (1 - dist * 0.35);
  }
  return wsum > 0 ? Math.min(1, s / wsum) : 0;
}

function pivotsToHitBull(
  candles: Candle[],
  x: ZigzagPivot,
  a: ZigzagPivot,
  b: ZigzagPivot,
  c: ZigzagPivot,
  d: ZigzagPivot
): NenStarHarmonicHit | null {
  const xPrice = x.price;
  const aPrice = a.price;
  const bPrice = b.price;
  const cPrice = c.price;
  const dPrice = d.price;

  if (!(cPrice > aPrice)) return null;

  const xa = aPrice - xPrice;
  if (!(xa > 0)) return null;

  const retracementB = (aPrice - bPrice) / xa;
  const abMag = aPrice - bPrice;
  if (!(abMag > 0)) return null;

  const extensionC = (cPrice - bPrice) / abMag;
  const bcMag = cPrice - bPrice;
  if (!(bcMag > 0)) return null;

  const extensionD = (cPrice - dPrice) / bcMag;
  if (!(cPrice > dPrice)) return null;

  const adOverXa = (aPrice - dPrice) / xa;

  const sc = scoreFromRanges([
    { v: retracementB, lo: 0.382, hi: 0.786, weight: 1 },
    { v: extensionC, lo: 1.13, hi: 1.272, weight: 1 },
    { v: extensionD, lo: 1.272, hi: 2.618, weight: 1 },
    { v: adOverXa, lo: 1.13, hi: 1.414, weight: 1 },
  ]);
  if (sc <= 0) return null;

  const di = d.idx;
  const bar = candles[di];
  const candleConfirm = bar ? bar.close > bar.open : false;

  return {
    x: x.idx,
    a: a.idx,
    b: b.idx,
    c: c.idx,
    d: di,
    xPrice,
    aPrice,
    bPrice,
    cPrice,
    dPrice,
    bias: 'bullish',
    score: sc,
    ratios: { retracementB, extensionC, extensionD, adOverXa },
    candleConfirm,
  };
}

function pivotsToHitBear(
  candles: Candle[],
  x: ZigzagPivot,
  a: ZigzagPivot,
  b: ZigzagPivot,
  c: ZigzagPivot,
  d: ZigzagPivot
): NenStarHarmonicHit | null {
  const xPrice = x.price;
  const aPrice = a.price;
  const bPrice = b.price;
  const cPrice = c.price;
  const dPrice = d.price;

  if (!(cPrice < aPrice)) return null;

  const xa = xPrice - aPrice;
  if (!(xa > 0)) return null;

  const retracementB = (bPrice - aPrice) / xa;
  const abMag = bPrice - aPrice;
  if (!(abMag > 0)) return null;

  const extensionC = (bPrice - cPrice) / abMag;
  const bcMag = bPrice - cPrice;
  if (!(bcMag > 0)) return null;

  const extensionD = (dPrice - cPrice) / bcMag;
  if (!(dPrice > cPrice)) return null;

  const adOverXa = (dPrice - aPrice) / xa;

  const sc = scoreFromRanges([
    { v: retracementB, lo: 0.382, hi: 0.786, weight: 1 },
    { v: extensionC, lo: 1.13, hi: 1.272, weight: 1 },
    { v: extensionD, lo: 1.272, hi: 2.618, weight: 1 },
    { v: adOverXa, lo: 1.13, hi: 1.414, weight: 1 },
  ]);
  if (sc <= 0) return null;

  const di = d.idx;
  const bar = candles[di];
  const candleConfirm = bar ? bar.close < bar.open : false;

  return {
    x: x.idx,
    a: a.idx,
    b: b.idx,
    c: c.idx,
    d: di,
    xPrice,
    aPrice,
    bPrice,
    cPrice,
    dPrice,
    bias: 'bearish',
    score: sc,
    ratios: { retracementB, extensionC, extensionD, adOverXa },
    candleConfirm,
  };
}

/**
 * @param zigzagPeriod Pine `ZigZag Pivot Period` (기본 3)
 * @param maxPatterns 차트에 그릴 최대 개수 (최근·고점수 우선)
 */
export function detectNenStarHarmonics(
  candles: Candle[],
  zigzagPeriod = 3,
  maxPatterns = 2
): NenStarHarmonicHit[] {
  if (candles.length < zigzagPeriod * 4 + 8) return [];
  const pivots = detectZigzagPivots(candles, zigzagPeriod, zigzagPeriod);
  if (pivots.length < 5) return [];

  const hits: NenStarHarmonicHit[] = [];

  for (let i = 0; i <= pivots.length - 5; i++) {
    const slice = pivots.slice(i, i + 5);
    const [p0, p1, p2, p3, p4] = slice;

    const bullSeq = !p0.isHigh && p1.isHigh && !p2.isHigh && p3.isHigh && !p4.isHigh;
    const bearSeq = p0.isHigh && !p1.isHigh && p2.isHigh && !p3.isHigh && p4.isHigh;

    if (bullSeq) {
      const h = pivotsToHitBull(candles, p0, p1, p2, p3, p4);
      if (h) hits.push(h);
    } else if (bearSeq) {
      const h = pivotsToHitBear(candles, p0, p1, p2, p3, p4);
      if (h) hits.push(h);
    }
  }

  const seen = new Set<string>();
  const dedup: NenStarHarmonicHit[] = [];
  for (const h of hits.sort((a, b) => b.score - a.score || b.d - a.d)) {
    const key = `${h.x}|${h.a}|${h.b}|${h.c}|${h.d}|${h.bias}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(h);
  }

  return dedup
    .sort((a, b) => b.d - a.d || b.score - a.score)
    .slice(0, maxPatterns);
}

export function fmtNenStarRatio(r: number): string {
  return r.toFixed(3);
}

function toRatio(price: number, chartMin: number, chartMax: number): number {
  const range = Math.max(1e-9, chartMax - chartMin);
  return (chartMax - price) / range;
}

type VisHelpers = {
  visTime: (visible: Candle[], i: number) => number;
  visIdx: (visible: Candle[], i: number) => number;
  xiNorm: (idx: number, lastVi: number) => number;
};

/**
 * TradingView 스타일: 진한 파란 외곽 X-A-B-C-D, 흰 점선 + 비율 박스, 중앙 패턴명, D 강조, D 이후 연장 화살표(반투명)
 */
export function nenStarHitsToOverlays(visible: Candle[], hits: NenStarHarmonicHit[], minP: number, maxP: number, H: VisHelpers): OverlayItem[] {
  const out: OverlayItem[] = [];
  const lastVi = Math.max(1, visible.length - 1);
  const solid = 'rgba(6,9,187,0.94)';
  const dashStroke = 'rgba(248,250,252,0.72)';
  const ratioBoxBg = 'rgba(37,99,235,0.88)';
  const ratioBoxFg = '#f8fafc';

  hits.forEach((h, patIdx) => {
    const idBase = `harm-nenStar-${h.bias}-${h.x}-${h.a}-${h.b}-${h.c}-${h.d}-${patIdx}`;
    const pathPts: Array<{ idx: number; price: number; L: string }> = [
      { idx: h.x, price: h.xPrice, L: 'X' },
      { idx: h.a, price: h.aPrice, L: 'A' },
      { idx: h.b, price: h.bPrice, L: 'B' },
      { idx: h.c, price: h.cPrice, L: 'C' },
      { idx: h.d, price: h.dPrice, L: 'D' },
    ];

    for (let k = 0; k < pathPts.length - 1; k++) {
      const u = pathPts[k];
      const v = pathPts[k + 1];
      const ui = H.visIdx(visible, u.idx);
      const vi = H.visIdx(visible, v.idx);
      out.push({
        id: `${idBase}-perim-${k}`,
        kind: 'harmonicLeg',
        label: '',
        x1: H.xiNorm(u.idx, lastVi),
        y1: toRatio(u.price, minP, maxP),
        x2: H.xiNorm(v.idx, lastVi),
        y2: toRatio(v.price, minP, maxP),
        time1: H.visTime(visible, ui),
        time2: H.visTime(visible, vi),
        confidence: Math.round(70 + h.score * 25),
        color: solid,
        lineLabelColor: NEN_STAR_LINE_HEX,
        category: 'harmonic',
        price1: u.price,
        price2: v.price,
        lineStrokeWidth: 1.15,
        noProject: true,
      });
    }

    for (const pt of pathPts) {
      if (pt.L === 'D') continue;
      const pi = H.visIdx(visible, pt.idx);
      out.push({
        id: `${idBase}-pt-${pt.L}`,
        kind: 'label',
        label: pt.L,
        x1: H.xiNorm(pt.idx, lastVi),
        y1: toRatio(pt.price, minP, maxP),
        time1: H.visTime(visible, pi),
        price1: pt.price,
        confidence: 72,
        color: NEN_STAR_LINE_HEX,
        labelBackgroundColor: 'rgba(6,9,187,0.88)',
        labelTextColor: '#e0e7ff',
        category: 'harmonic',
      });
    }

    const pushDashed = (
      idSuf: string,
      i1: number,
      p1: number,
      i2: number,
      p2: number,
      label: string
    ) => {
      const u = H.visIdx(visible, i1);
      const v = H.visIdx(visible, i2);
      out.push({
        id: `${idBase}-dash-${idSuf}`,
        kind: 'harmonicLeg',
        label,
        x1: H.xiNorm(i1, lastVi),
        y1: toRatio(p1, minP, maxP),
        x2: H.xiNorm(i2, lastVi),
        y2: toRatio(p2, minP, maxP),
        time1: H.visTime(visible, u),
        time2: H.visTime(visible, v),
        confidence: 68,
        color: dashStroke,
        lineLabelColor: ratioBoxFg,
        labelBackgroundColor: ratioBoxBg,
        labelTextColor: ratioBoxFg,
        category: 'harmonic',
        price1: p1,
        price2: p2,
        lineDash: '2 5',
        lineStrokeWidth: 0.95,
        noProject: true,
      });
    };

    const { retracementB, extensionC, extensionD, adOverXa } = h.ratios;
    pushDashed('xb', h.x, h.xPrice, h.b, h.bPrice, fmtNenStarRatio(retracementB));
    pushDashed('ac', h.a, h.aPrice, h.c, h.cPrice, fmtNenStarRatio(extensionC));
    pushDashed('xd', h.x, h.xPrice, h.d, h.dPrice, fmtNenStarRatio(adOverXa));
    pushDashed('bd', h.b, h.bPrice, h.d, h.dPrice, fmtNenStarRatio(extensionD));

    const midIdx = Math.floor((h.b + h.c) / 2);
    const midPrice = (h.bPrice + h.cPrice) / 2;
    const midI = H.visIdx(visible, midIdx);
    const patName = h.bias === 'bullish' ? 'Bullish Nen-Star' : 'Bearish Nen-Star';
    out.push({
      id: `${idBase}-title`,
      kind: 'label',
      label: patName,
      x1: H.xiNorm(midIdx, lastVi),
      y1: toRatio(midPrice, minP, maxP),
      time1: H.visTime(visible, midI),
      price1: midPrice,
      confidence: 75,
      color: '#94a3b8',
      labelBackgroundColor: 'rgba(71,85,105,0.82)',
      labelTextColor: '#f1f5f9',
      category: 'harmonic',
    });

    const dClamped = Math.max(0, Math.min(h.d, lastVi));
    const dI = H.visIdx(visible, dClamped);
    out.push({
      id: `${idBase}-d-cap`,
      kind: 'label',
      label: 'D',
      x1: H.xiNorm(dClamped, lastVi),
      y1: toRatio(h.dPrice, minP, maxP),
      time1: H.visTime(visible, dI),
      price1: h.dPrice,
      confidence: 78,
      color: h.bias === 'bullish' ? '#22c55e' : '#ef4444',
      labelBackgroundColor: h.bias === 'bullish' ? 'rgba(21,128,61,0.9)' : 'rgba(153,27,27,0.88)',
      labelTextColor: h.bias === 'bullish' ? '#ecfccb' : '#fecaca',
      category: 'harmonic',
    });

    const projBars = Math.max(2, Math.min(18, Math.round(visible.length * 0.04)));
    const dEnd = Math.min(visible.length - 1, h.d + projBars);
    const t0 = H.visTime(visible, H.visIdx(visible, h.d));
    const t1 = H.visTime(visible, H.visIdx(visible, dEnd));
    const span = h.cPrice - h.bPrice;
    const projPrice =
      h.bias === 'bullish' ? h.dPrice + Math.abs(span) * 0.55 : h.dPrice - Math.abs(span) * 0.55;
    out.push({
      id: `${idBase}-proj`,
      kind: 'harmonicLeg',
      label: '',
      x1: H.xiNorm(h.d, lastVi),
      y1: toRatio(h.dPrice, minP, maxP),
      x2: H.xiNorm(dEnd, lastVi),
      y2: toRatio(projPrice, minP, maxP),
      time1: t0,
      time2: t1,
      price1: h.dPrice,
      price2: projPrice,
      confidence: 55,
      color: h.bias === 'bullish' ? NEN_STAR_PROJ_BULL : NEN_STAR_PROJ_BEAR,
      lineLabelColor: h.bias === 'bullish' ? '#4ade80' : '#f87171',
      category: 'harmonic',
      lineDash: '10 6',
      lineStrokeWidth: 3.2,
      noProject: true,
    });
  });

  return out;
}

function clampIdx(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function nenStarHitsToEngineMarkers(
  visible: Candle[],
  hits: NenStarHarmonicHit[]
): Array<{ time: number; bias: 'bullish' | 'bearish'; candleConfirm: boolean }> {
  return hits.map((h) => {
    const bar = visible[clampIdx(h.d, 0, visible.length - 1)];
    return {
      time: (bar?.time as number) ?? 0,
      bias: h.bias,
      candleConfirm: h.candleConfirm,
    };
  });
}
