/**
 * assets 레퍼런스 기반 — 통합·분석 자동 ZONE (카드/HUD 없음).
 * 순서: 1 Base S/D → 2 OB+FVG → 3 Sweep+EQ → 4 닮은꼴 횡보 → 5 Fib스탑헌팅×VP
 * 고정 승률·확정 수익 문구 금지. 지지·저항 각 ≤3.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
  mergedWorkCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import { mergedDeskAutoZoneDetectCandles } from '@/lib/mergedDesk4hReference';
import {
  detectSmcStructureOrderBlocks,
  isObBrokenByClose,
  isObMitigated,
} from '@/lib/smcStructureOrderBlocks';
import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import { detectMergedDeskAssetAutoZonesRemain } from '@/lib/mergedDeskAssetAutoZonesRemain';

export type AssetAutoZonesPack = {
  overlays: OverlayItem[];
  summaryKo: string;
  counts: {
    baseSd: number;
    ob: number;
    fvg: number;
    sweep: number;
    eq: number;
    fractal: number;
    fibVp: number;
    harmonic: number;
    killZone: number;
    channel: number;
    srFlip: number;
    premiumDiscount: number;
    breaker: number;
    wedge: number;
    doubleTopBot: number;
  };
};

const EXTRA = 'merged-desk-asset-auto-zone';

function atr(candles: Candle[], end: number, period = 14): number {
  if (end < 1) return Math.abs(candles[end]?.close ?? 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - period + 1);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n += 1;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]!.close) * 0.01;
}

function fmt(p: number): string {
  if (!(p > 0)) return '—';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function pushZone(
  overlays: OverlayItem[],
  candles: Candle[],
  opts: {
    id: string;
    kind: 'demandZone' | 'supplyZone' | 'zone' | 'keyLevel' | 'fvg' | 'ob';
    label: string;
    top: number;
    bot: number;
    timePref: number;
    score: number;
    color: string;
    tip: string;
    extra: string;
    isLong?: boolean;
    mitigated?: boolean;
    asLine?: boolean;
  }
): void {
  const { top, bot } = opts;
  if (!(top > bot) || !Number.isFinite(top) || !Number.isFinite(bot)) return;
  if (opts.asLine) {
    const mid = (top + bot) / 2;
    const t = Number(candles[candles.length - 1]?.time);
    overlays.push({
      id: opts.id,
      kind: 'keyLevel',
      label: opts.label,
      zoneFaceBase: opts.label,
      labelTooltip: opts.tip,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: (Number.isFinite(opts.timePref) ? opts.timePref : t) as UTCTimestamp,
      time2: t as UTCTimestamp,
      price1: mid,
      confidence: opts.score,
      color: opts.color,
      lineLabelColor: opts.isLong === false ? '#fecaca' : '#bbf7d0',
      labelBackgroundColor:
        opts.isLong === false ? 'rgba(127,29,29,0.9)' : 'rgba(6,78,59,0.9)',
      labelTextColor: '#f8fafc',
      category: 'structure',
      lineDash: '5 4',
      lineStrokeWidth: 1.5,
      overlayZoneExtraClass: `${EXTRA} ${opts.extra}`.trim(),
    });
    return;
  }
  const formT = findMergedDeskZoneFormationBarTime(candles, top, bot, opts.timePref);
  const zoneTimes = mergedDeskAnalyzedZoneSpanTimes(candles, {
    id: opts.id,
    time1: formT,
    price1: top,
    price2: bot,
  });
  if (!zoneTimes) return;
  const isLong = opts.isLong !== false && opts.kind !== 'supplyZone';
  overlays.push({
    id: opts.id,
    kind: opts.kind,
    label: opts.label,
    zoneFaceBase: opts.label,
    labelTooltip: opts.tip,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: zoneTimes.t1,
    time2: zoneTimes.t2,
    price1: top,
    price2: bot,
    confidence: opts.score,
    color: opts.color,
    category: 'zones',
    zonePulse: opts.score >= 78 && !opts.mitigated,
    zoneFillPreserve: true,
    obMitigated: opts.mitigated,
    lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
    labelBackgroundColor: isLong ? 'rgba(6,78,59,0.92)' : 'rgba(127,29,29,0.92)',
    labelTextColor: '#f8fafc',
    overlayZoneExtraClass: [
      EXTRA,
      opts.extra,
      'merged-desk-zone-caption-clean',
      'merged-desk-pill-zone',
      'merged-desk-zone-pro-hero',
      isLong ? 'overlay-zone--asset-auto-long' : 'overlay-zone--asset-auto-short',
      opts.mitigated ? 'merged-desk-asset-auto-mitigated' : '',
    ]
      .filter(Boolean)
      .join(' '),
  });
}

/** 1) Base S/D — RBD / DBR / RBR / DBD */
function detectBaseSd(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const n = candles.length;
  if (n < 30) return 0;
  const impulseMin = atrVal * 1.25;
  const baseMax = atrVal * 1.8;
  type Hit = {
    id: string;
    pattern: 'DBR' | 'RBD' | 'RBR' | 'DBD';
    side: 'LONG' | 'SHORT';
    top: number;
    bot: number;
    i0: number;
    i1: number;
    score: number;
  };
  const hits: Hit[] = [];

  for (let i = 8; i < n - 4; i++) {
    // base window 2~5 bars ending at i
    for (let w = 2; w <= 5; w++) {
      const i0 = i - w + 1;
      if (i0 < 3) continue;
      let bHi = -Infinity;
      let bLo = Infinity;
      let bodySum = 0;
      for (let k = i0; k <= i; k++) {
        const c = candles[k]!;
        bHi = Math.max(bHi, c.high);
        bLo = Math.min(bLo, c.low);
        bodySum += Math.abs(c.close - c.open);
      }
      const baseH = bHi - bLo;
      if (!(baseH > 0) || baseH > baseMax) continue;
      if (bodySum / w > atrVal * 0.55) continue;

      const pre = candles[i0 - 1]!;
      const pre2 = candles[Math.max(0, i0 - 3)]!;
      const postEnd = Math.min(n - 1, i + 3);
      const post = candles[postEnd]!;
      const rallyBefore = pre.close - pre2.low > impulseMin * 0.7;
      const dropBefore = pre2.high - pre.close > impulseMin * 0.7;
      const rallyAfter = post.high - bHi > impulseMin * 0.85;
      const dropAfter = bLo - post.low > impulseMin * 0.85;
      const t = Number(candles[i0]!.time);

      if (dropBefore && rallyAfter) {
        hits.push({
          id: `merged-desk-asset-dbr-${t}`,
          pattern: 'DBR',
          side: 'LONG',
          top: bHi,
          bot: bLo,
          i0,
          i1: i,
          score: 72 + Math.min(18, ((post.high - bHi) / atrVal) * 4),
        });
      } else if (rallyBefore && dropAfter) {
        hits.push({
          id: `merged-desk-asset-rbd-${t}`,
          pattern: 'RBD',
          side: 'SHORT',
          top: bHi,
          bot: bLo,
          i0,
          i1: i,
          score: 72 + Math.min(18, ((bLo - post.low) / atrVal) * 4),
        });
      } else if (rallyBefore && rallyAfter) {
        hits.push({
          id: `merged-desk-asset-rbr-${t}`,
          pattern: 'RBR',
          side: 'LONG',
          top: bHi,
          bot: bLo,
          i0,
          i1: i,
          score: 68 + Math.min(14, ((post.high - bHi) / atrVal) * 3),
        });
      } else if (dropBefore && dropAfter) {
        hits.push({
          id: `merged-desk-asset-dbd-${t}`,
          pattern: 'DBD',
          side: 'SHORT',
          top: bHi,
          bot: bLo,
          i0,
          i1: i,
          score: 68 + Math.min(14, ((bLo - post.low) / atrVal) * 3),
        });
      }
    }
  }

  // merge nearby + cap 3 each side
  hits.sort((a, b) => b.score - a.score);
  const kept: Hit[] = [];
  for (const h of hits) {
    if (kept.some((k) => k.side === h.side && Math.abs((k.top + k.bot) / 2 - (h.top + h.bot) / 2) < atrVal * 0.9)) {
      continue;
    }
    kept.push(h);
    if (kept.filter((x) => x.side === 'LONG').length >= 3 && kept.filter((x) => x.side === 'SHORT').length >= 3) break;
  }
  const longs = kept.filter((x) => x.side === 'LONG').slice(0, 3);
  const shorts = kept.filter((x) => x.side === 'SHORT').slice(0, 3);
  for (const h of [...longs, ...shorts]) {
    const label =
      h.side === 'LONG'
        ? h.pattern === 'DBR'
          ? '세력매수ZONE·DBR'
          : '세력매수ZONE·RBR'
        : h.pattern === 'RBD'
          ? '세력매도ZONE·RBD'
          : '세력매도ZONE·DBD';
    pushZone(overlays, candles, {
      id: h.id,
      kind: h.side === 'LONG' ? 'demandZone' : 'supplyZone',
      label,
      top: h.top,
      bot: h.bot,
      timePref: Number(candles[h.i0]!.time),
      score: Math.min(96, h.score),
      color:
        h.side === 'LONG' ? 'rgba(16,185,129,0.2)' : 'rgba(248,113,113,0.18)',
      tip: `${h.pattern} Base · ${fmt(h.bot)}~${fmt(h.top)} · assets S/D (참고)`,
      extra: `merged-desk-asset-base-sd merged-desk-asset-base-sd--${h.pattern.toLowerCase()}`,
      isLong: h.side === 'LONG',
    });
  }
  return longs.length + shorts.length;
}

/** 2) OB + FVG (신선도/완화) */
function detectObFvg(candles: Candle[], atrVal: number, overlays: OverlayItem[]): { ob: number; fvg: number } {
  const { obs, validObs } = detectSmcStructureOrderBlocks(candles);
  const pool = (validObs.length ? validObs : obs).slice(-8);
  let obN = 0;
  const seenOb: number[] = [];
  for (const o of pool) {
    if (seenOb.some((m) => Math.abs(m - (o.high + o.low) / 2) < atrVal * 0.75)) continue;
    const broken = isObBrokenByClose(o, candles);
    if (broken) continue;
    const mitigated = isObMitigated(o, candles);
    const isLong = o.bias === 'bullish';
    pushZone(overlays, candles, {
      id: `merged-desk-asset-ob-${o.index}-${o.bosIndex}`,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: mitigated
        ? isLong
          ? 'OB·매수(완화)'
          : 'OB·매도(완화)'
        : isLong
          ? 'OB·세력매수'
          : 'OB·세력매도',
      top: o.high,
      bot: o.low,
      timePref: Number(candles[o.index]!.time),
      score: mitigated ? 62 : 84,
      color: isLong
        ? mitigated
          ? 'rgba(16,185,129,0.1)'
          : 'rgba(45,212,191,0.22)'
        : mitigated
          ? 'rgba(248,113,113,0.1)'
          : 'rgba(251,113,133,0.22)',
      tip: `구조 OB · ${mitigated ? '완화됨' : '신선'} · ${fmt(o.low)}~${fmt(o.high)} (참고)`,
      extra: `merged-desk-asset-ob ${mitigated ? 'merged-desk-asset-ob--mitigated' : 'merged-desk-asset-ob--fresh'}`,
      isLong,
      mitigated,
    });
    seenOb.push((o.high + o.low) / 2);
    obN += 1;
    if (obN >= 3) break;
  }

  // FVG 3-candle
  const n = candles.length;
  type Fvg = {
    bias: 'bullish' | 'bearish';
    index: number;
    low: number;
    high: number;
    mitigated: boolean;
  };
  const fvgs: Fvg[] = [];
  for (let i = 2; i < n - 1; i++) {
    const c1 = candles[i - 2]!;
    const c3 = candles[i]!;
    if (c1.high < c3.low) {
      const gapLo = c1.high;
      const gapHi = c3.low;
      if (gapHi - gapLo < atrVal * 0.12) continue;
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (candles[j]!.low <= gapHi && candles[j]!.high >= gapLo) {
          mitigated = true;
          break;
        }
      }
      fvgs.push({ bias: 'bullish', index: i, low: gapLo, high: gapHi, mitigated });
    }
    if (c1.low > c3.high) {
      const gapLo = c3.high;
      const gapHi = c1.low;
      if (gapHi - gapLo < atrVal * 0.12) continue;
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (candles[j]!.low <= gapHi && candles[j]!.high >= gapLo) {
          mitigated = true;
          break;
        }
      }
      fvgs.push({ bias: 'bearish', index: i, low: gapLo, high: gapHi, mitigated });
    }
  }
  // prefer fresh, then recent
  fvgs.sort((a, b) => Number(a.mitigated) - Number(b.mitigated) || b.index - a.index);
  let fvgN = 0;
  for (const f of fvgs) {
    if (fvgN >= 3) break;
    // keep at least 1 fresh if any; allow 1 mitigated
    if (f.mitigated && fvgN >= 2) continue;
    const isLong = f.bias === 'bullish';
    pushZone(overlays, candles, {
      id: `merged-desk-asset-fvg-${f.index}`,
      kind: 'fvg',
      label: f.mitigated
        ? isLong
          ? 'FVG·상승(완화)'
          : 'FVG·하락(완화)'
        : isLong
          ? 'FVG·상승'
          : 'FVG·하락',
      top: f.high,
      bot: f.low,
      timePref: Number(candles[f.index]!.time),
      score: f.mitigated ? 58 : 80,
      color: isLong
        ? f.mitigated
          ? 'rgba(52,211,153,0.08)'
          : 'rgba(52,211,153,0.18)'
        : f.mitigated
          ? 'rgba(244,114,182,0.08)'
          : 'rgba(244,114,182,0.18)',
      tip: `FVG · ${f.mitigated ? '완화' : '미완화'} · ${fmt(f.low)}~${fmt(f.high)} (참고)`,
      extra: `merged-desk-asset-fvg ${f.mitigated ? 'merged-desk-asset-fvg--mitigated' : 'merged-desk-asset-fvg--fresh'}`,
      isLong,
      mitigated: f.mitigated,
    });
    fvgN += 1;
  }
  return { ob: obN, fvg: fvgN };
}

function pivotHigh(candles: Candle[], i: number, L = 2): boolean {
  if (i < L || i + L >= candles.length) return false;
  const v = candles[i]!.high;
  for (let k = i - L; k <= i + L; k++) if (k !== i && candles[k]!.high >= v) return false;
  return true;
}
function pivotLow(candles: Candle[], i: number, L = 2): boolean {
  if (i < L || i + L >= candles.length) return false;
  const v = candles[i]!.low;
  for (let k = i - L; k <= i + L; k++) if (k !== i && candles[k]!.low <= v) return false;
  return true;
}

/** 3) Sweep + EQH/EQL */
function detectSweepEq(candles: Candle[], atrVal: number, overlays: OverlayItem[]): { sweep: number; eq: number } {
  const n = candles.length;
  const swingsH: Array<{ i: number; p: number }> = [];
  const swingsL: Array<{ i: number; p: number }> = [];
  for (let i = 3; i < n - 3; i++) {
    if (pivotHigh(candles, i)) swingsH.push({ i, p: candles[i]!.high });
    if (pivotLow(candles, i)) swingsL.push({ i, p: candles[i]!.low });
  }

  let sweepN = 0;
  const look = Math.min(n - 2, Math.max(20, n - 8));
  for (let i = Math.max(8, n - look); i < n - 1; i++) {
    const c = candles[i]!;
    const range = Math.max(c.high - c.low, atrVal * 0.05);
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    // buyside sweep: wick above prior swing high, close back below
    const prevH = [...swingsH].reverse().find((s) => s.i < i - 1 && i - s.i <= 40);
    if (prevH && c.high > prevH.p + atrVal * 0.05 && c.close < prevH.p && upper >= range * 0.35) {
      pushZone(overlays, candles, {
        id: `merged-desk-asset-sweep-buy-${Number(c.time)}`,
        kind: 'supplyZone',
        label: '유동성스윕·고',
        top: c.high,
        bot: prevH.p,
        timePref: Number(c.time),
        score: 76,
        color: 'rgba(232,121,249,0.2)',
        tip: `Buyside 유동성 스윕 · ${fmt(prevH.p)}~${fmt(c.high)} (참고)`,
        extra: 'merged-desk-asset-sweep merged-desk-asset-sweep--high',
        isLong: false,
      });
      sweepN += 1;
    }
    const prevL = [...swingsL].reverse().find((s) => s.i < i - 1 && i - s.i <= 40);
    if (prevL && c.low < prevL.p - atrVal * 0.05 && c.close > prevL.p && lower >= range * 0.35) {
      pushZone(overlays, candles, {
        id: `merged-desk-asset-sweep-sell-${Number(c.time)}`,
        kind: 'demandZone',
        label: '유동성스윕·저',
        top: prevL.p,
        bot: c.low,
        timePref: Number(c.time),
        score: 76,
        color: 'rgba(56,189,248,0.2)',
        tip: `Sellside 유동성 스윕 · ${fmt(c.low)}~${fmt(prevL.p)} (참고)`,
        extra: 'merged-desk-asset-sweep merged-desk-asset-sweep--low',
        isLong: true,
      });
      sweepN += 1;
    }
    if (sweepN >= 3) break;
  }

  let eqN = 0;
  const tol = atrVal * 0.35;
  for (let a = 0; a < swingsH.length; a++) {
    for (let b = a + 1; b < swingsH.length; b++) {
      if (Math.abs(swingsH[a]!.p - swingsH[b]!.p) > tol) continue;
      if (swingsH[b]!.i - swingsH[a]!.i < 4) continue;
      const price = Math.max(swingsH[a]!.p, swingsH[b]!.p);
      pushZone(overlays, candles, {
        id: `merged-desk-asset-eqh-${swingsH[a]!.i}-${swingsH[b]!.i}`,
        kind: 'keyLevel',
        label: 'EQH·유동성',
        top: price + atrVal * 0.08,
        bot: price - atrVal * 0.08,
        timePref: Number(candles[swingsH[a]!.i]!.time),
        score: 70,
        color: 'rgba(244,114,182,0.85)',
        tip: `Equal High 유동성 풀 · ${fmt(price)} (참고)`,
        extra: 'merged-desk-asset-eq merged-desk-asset-eqh',
        isLong: false,
        asLine: true,
      });
      eqN += 1;
      break;
    }
    if (eqN >= 2) break;
  }
  let eqlN = 0;
  for (let a = 0; a < swingsL.length; a++) {
    for (let b = a + 1; b < swingsL.length; b++) {
      if (Math.abs(swingsL[a]!.p - swingsL[b]!.p) > tol) continue;
      if (swingsL[b]!.i - swingsL[a]!.i < 4) continue;
      const price = Math.min(swingsL[a]!.p, swingsL[b]!.p);
      pushZone(overlays, candles, {
        id: `merged-desk-asset-eql-${swingsL[a]!.i}-${swingsL[b]!.i}`,
        kind: 'keyLevel',
        label: 'EQL·유동성',
        top: price + atrVal * 0.08,
        bot: price - atrVal * 0.08,
        timePref: Number(candles[swingsL[a]!.i]!.time),
        score: 70,
        color: 'rgba(56,189,248,0.85)',
        tip: `Equal Low 유동성 풀 · ${fmt(price)} (참고)`,
        extra: 'merged-desk-asset-eq merged-desk-asset-eql',
        isLong: true,
        asLine: true,
      });
      eqlN += 1;
      break;
    }
    if (eqlN >= 2) break;
  }
  return { sweep: Math.min(3, sweepN), eq: eqN + eqlN };
}

type RangeBox = { i0: number; i1: number; hi: number; lo: number; pivots: number[] };

function findConsolidationBoxes(candles: Candle[], atrVal: number): RangeBox[] {
  const n = candles.length;
  const out: RangeBox[] = [];
  let i = 10;
  while (i < n - 6) {
    let best: RangeBox | null = null;
    for (let len = 8; len <= 28 && i + len < n - 1; len++) {
      const i1 = i + len - 1;
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = i; k <= i1; k++) {
        hi = Math.max(hi, candles[k]!.high);
        lo = Math.min(lo, candles[k]!.low);
      }
      const h = hi - lo;
      if (h > atrVal * 3.2 || h < atrVal * 0.45) continue;
      // range-like: closes stay inside
      let outside = 0;
      for (let k = i; k <= i1; k++) {
        if (candles[k]!.high > hi + atrVal * 0.15 || candles[k]!.low < lo - atrVal * 0.15) outside += 1;
      }
      if (outside > 2) continue;
      const pivots: number[] = [];
      for (let k = i + 2; k <= i1 - 2; k++) {
        if (pivotHigh(candles, k, 1)) pivots.push(((candles[k]!.high - lo) / h) * 100);
        if (pivotLow(candles, k, 1)) pivots.push(((candles[k]!.low - lo) / h) * -100);
      }
      if (pivots.length < 3) continue;
      best = { i0: i, i1, hi, lo, pivots: pivots.slice(0, 8) };
    }
    if (best) {
      out.push(best);
      i = best.i1 + 2;
    } else {
      i += 1;
    }
  }
  return out;
}

function pivotSeqScore(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length, 6);
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const da = Math.sign(a[i]!);
    const db = Math.sign(b[i]!);
    if (da === db) s += 1;
    const mag = 1 - Math.min(1, Math.abs(Math.abs(a[i]!) - Math.abs(b[i]!)) / 40);
    s += mag;
  }
  return s / (n * 2);
}

/** 4) 타이롱 닮은꼴 횡보 */
function detectFractalSideways(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const boxes = findConsolidationBoxes(candles, atrVal);
  if (boxes.length < 2) return 0;
  const recent = boxes[boxes.length - 1]!;
  let best: { box: RangeBox; score: number } | null = null;
  for (let i = 0; i < boxes.length - 1; i++) {
    const b = boxes[i]!;
    const sc = pivotSeqScore(b.pivots, recent.pivots);
    if (sc < 0.62) continue;
    if (!best || sc > best.score) best = { box: b, score: sc };
  }
  if (!best) return 0;
  // draw both: historical template + current twin
  for (const [tag, box] of [
    ['과거', best.box],
    ['현재', recent],
  ] as const) {
    pushZone(overlays, candles, {
      id: `merged-desk-asset-fractal-${tag}-${Number(candles[box.i0]!.time)}`,
      kind: 'zone',
      label: tag === '현재' ? '닮은꼴횡보ZONE' : '닮은꼴원본ZONE',
      top: box.hi,
      bot: box.lo,
      timePref: Number(candles[box.i0]!.time),
      score: Math.round(60 + best.score * 35),
      color: tag === '현재' ? 'rgba(248,113,113,0.16)' : 'rgba(251,146,60,0.12)',
      tip: `타이롱 닮은꼴 · 유사도 ${(best.score * 100).toFixed(0)}% · ${fmt(box.lo)}~${fmt(box.hi)} (참고)`,
      extra: `merged-desk-asset-fractal merged-desk-asset-fractal--${tag === '현재' ? 'live' : 'ref'}`,
      isLong: true,
    });
  }
  return 2;
}

/** 5) Fib 스탑헌팅(1.13/1.272) × HVP/LVP(VRVP) */
function detectFibVp(
  candles: Candle[],
  atrVal: number,
  vrvp: MergedVrvpProfile | null | undefined,
  overlays: OverlayItem[]
): number {
  const n = candles.length;
  if (n < 30) return 0;
  // last major swing
  let swingHi = -Infinity;
  let swingLo = Infinity;
  let hiI = n - 2;
  let loI = n - 2;
  const from = Math.max(5, n - 80);
  for (let i = from; i < n - 1; i++) {
    if (candles[i]!.high >= swingHi) {
      swingHi = candles[i]!.high;
      hiI = i;
    }
    if (candles[i]!.low <= swingLo) {
      swingLo = candles[i]!.low;
      loI = i;
    }
  }
  const range = swingHi - swingLo;
  if (!(range > atrVal * 2)) return 0;

  const nodes: number[] = [];
  if (vrvp?.poc != null && vrvp.poc > 0) nodes.push(vrvp.poc);
  if (vrvp?.vaHigh != null) nodes.push(vrvp.vaHigh);
  if (vrvp?.vaLow != null) nodes.push(vrvp.vaLow);
  // LVP proxy: edges outside VA
  if (vrvp?.vaHigh != null && vrvp.priceMax > vrvp.vaHigh) {
    nodes.push((vrvp.vaHigh + vrvp.priceMax) / 2);
  }
  if (vrvp?.vaLow != null && vrvp.priceMin < vrvp.vaLow) {
    nodes.push((vrvp.vaLow + vrvp.priceMin) / 2);
  }
  if (!nodes.length) {
    nodes.push(swingLo + range * 0.5);
  }

  const levels: Array<{ ratio: number; price: number; side: 'above' | 'below' }> = [];
  // extensions beyond swing high / low
  for (const r of [1.13, 1.272]) {
    levels.push({ ratio: r, price: swingLo + range * r, side: 'above' });
    levels.push({ ratio: r, price: swingHi - range * r, side: 'below' });
  }

  let nHit = 0;
  for (const lv of levels) {
    const near = nodes.some((nd) => Math.abs(nd - lv.price) <= atrVal * 0.55);
    if (!near) continue;
    const isAbove = lv.side === 'above';
    const half = atrVal * 0.28;
    pushZone(overlays, candles, {
      id: `merged-desk-asset-fibvp-${lv.ratio}-${lv.side}`,
      kind: isAbove ? 'supplyZone' : 'demandZone',
      label: isAbove
        ? `스탑헌팅ZONE·${lv.ratio}`
        : `스탑헌팅ZONE·${lv.ratio}`,
      top: lv.price + half,
      bot: lv.price - half,
      timePref: Number(candles[isAbove ? hiI : loI]!.time),
      score: 82,
      color: isAbove ? 'rgba(251,191,36,0.2)' : 'rgba(125,211,252,0.2)',
      tip: `Fib ${lv.ratio} × VRVP 합류 · ${fmt(lv.price)} · 스탑헌팅 후보 (참고)`,
      extra: `merged-desk-asset-fibvp merged-desk-asset-fibvp--${String(lv.ratio).replace('.', '')}`,
      isLong: !isAbove,
    });
    nHit += 1;
    if (nHit >= 3) break;
  }
  return nHit;
}

export function detectMergedDeskAssetAutoZones(
  candlesIn: Candle[],
  timeframe: string,
  vrvp?: MergedVrvpProfile | null
): AssetAutoZonesPack {
  const work = mergedWorkCandles(candlesIn, timeframe);
  const candles = mergedDeskAutoZoneDetectCandles(work, timeframe);
  const empty: AssetAutoZonesPack = {
    overlays: [],
    summaryKo: 'assets ZONE 감지용 봉 부족',
    counts: {
      baseSd: 0,
      ob: 0,
      fvg: 0,
      sweep: 0,
      eq: 0,
      fractal: 0,
      fibVp: 0,
      harmonic: 0,
      killZone: 0,
      channel: 0,
      srFlip: 0,
      premiumDiscount: 0,
      breaker: 0,
      wedge: 0,
      doubleTopBot: 0,
    },
  };
  if (candles.length < 30) return empty;

  const last = candles.length - 1;
  const atrVal = Math.max(atr(candles, last, 14), Math.abs(candles[last]!.close) * 0.0008);
  const overlays: OverlayItem[] = [];

  const baseSd = detectBaseSd(candles, atrVal, overlays);
  const { ob, fvg } = detectObFvg(candles, atrVal, overlays);
  const { sweep, eq } = detectSweepEq(candles, atrVal, overlays);
  const fractal = detectFractalSideways(candles, atrVal, overlays);
  const fibVp = detectFibVp(candles, atrVal, vrvp, overlays);
  const remain = detectMergedDeskAssetAutoZonesRemain(candles, atrVal);
  if (remain.overlays.length) overlays.push(...remain.overlays);

  const counts = {
    baseSd,
    ob,
    fvg,
    sweep,
    eq,
    fractal,
    fibVp,
    ...remain.counts,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const summaryKo =
    total === 0
      ? 'assets 자동 ZONE 후보 없음'
      : `assets ZONE ${overlays.length} · S/D${baseSd} OB${ob} FVG${fvg} 스윕${sweep} EQ${eq} 닮은꼴${fractal} FibVP${fibVp} · 하모닉${remain.counts.harmonic} 킬존${remain.counts.killZone} 채널${remain.counts.channel} SR${remain.counts.srFlip} P/D${remain.counts.premiumDiscount} 브레이커${remain.counts.breaker} 쐐기${remain.counts.wedge} 더블${remain.counts.doubleTopBot}`;

  return { overlays, summaryKo, counts };
}

export function summarizeMergedDeskAssetAutoZonesKo(pack: AssetAutoZonesPack): string {
  return pack.summaryKo;
}
