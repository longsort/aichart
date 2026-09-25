/**
 * 선물용 AVWAP·피보 **근접 정밀 타점**.
 * 깊은 0.5/0.618(대형 레그 중간)은 참고만 — 현재가±N·ATR 안 합류만 E/SL 후보.
 * 확정 승률·수익 보장 문구 없음.
 */
import type { Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskAnchoredVwapPack } from '@/lib/mergedDeskAnchoredVwap';

/** avwapFibConfluence와 동일 팔레트 (순환 import 방지) */
const COLORS = {
  highExt: '#4ade80',
  highOpen: '#f87171',
  lowExt: '#38bdf8',
  lowOpen: '#a78bfa',
} as const;

/** 현재가에서 이 ATR 배수 밖 = 깊은 되돌림(참고만) */
export const AVWAP_PRECISION_NEAR_ATR = 2.2;
/** 정밀 밴드 반폭(ATR) — 선물 MAE 축소 */
export const AVWAP_PRECISION_BAND_ATR = 0.28;
const MIN_RR = 1.8;

export type AvwapPrecisionSide = 'LONG' | 'SHORT' | 'WAIT';

export type AvwapPrecisionFibLegIn = {
  role: 'high' | 'low';
  fibHigh: number;
  fibLow: number;
  lastVwap: number | null;
};

export type AvwapPrecisionCandidate = {
  side: AvwapPrecisionSide;
  entry: number;
  stopLoss: number;
  tp1: number;
  rr: number;
  mid: number;
  bandTop: number;
  bandBot: number;
  labelsKo: string[];
  evidenceCount: number;
  deepRefOnly: boolean;
  noteKo: string;
};

export type AvwapPrecisionEntryPack = {
  candidates: AvwapPrecisionCandidate[];
  /** 차트 전폭 가격선 — 근접 타점만 */
  priceLines: AtlasPulsePriceLine[];
  overlays: OverlayItem[];
  summaryKo: string;
};

function atrApprox(candles: Candle[], end: number): number {
  const n = Math.min(14, end);
  if (n < 2) return Math.abs(Number(candles[end]?.close) || 1) * 0.004;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, end - n + 1); i <= end; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[end]?.close) || 1) * 0.004;
}

function lastLineValue(line: Array<{ time: number; value: number }> | undefined): number | null {
  if (!line?.length) return null;
  const v = Number(line[line.length - 1]!.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function fibPrice(fibHigh: number, fibLow: number, ratio: number): number {
  return fibHigh - ratio * (fibHigh - fibLow);
}

function emaLast(candles: Candle[], period: number, end: number): number | null {
  if (end + 1 < period) return null;
  const k = 2 / (period + 1);
  let e = Number(candles[end - period + 1]!.close);
  for (let i = end - period + 2; i <= end; i++) {
    e = Number(candles[i]!.close) * k + e * (1 - k);
  }
  return Number.isFinite(e) && e > 0 ? e : null;
}

type Atom = { price: number; labelKo: string; role: 'support' | 'resistance' | 'both'; weight: number };

function pushAtom(
  out: Atom[],
  price: number,
  labelKo: string,
  role: Atom['role'],
  weight: number,
  now: number,
  atr: number
): void {
  if (!(price > 0) || !Number.isFinite(price)) return;
  const dist = Math.abs(price - now) / Math.max(atr, 1e-9);
  if (dist > AVWAP_PRECISION_NEAR_ATR * 1.35) return; // 너무 먼 건 정밀 후보에서 제외
  const w = dist <= AVWAP_PRECISION_NEAR_ATR ? weight : weight * 0.45;
  out.push({ price, labelKo, role, weight: w });
}

function cluster(atoms: Atom[], mergeDist: number): Array<{ mid: number; lo: number; hi: number; atoms: Atom[] }> {
  const sorted = [...atoms].sort((a, b) => a.price - b.price);
  const clusters: Array<{ mid: number; lo: number; hi: number; atoms: Atom[] }> = [];
  for (const a of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && a.price - last.hi <= mergeDist) {
      last.atoms.push(a);
      last.lo = Math.min(last.lo, a.price);
      last.hi = Math.max(last.hi, a.price);
      last.mid = last.atoms.reduce((s, x) => s + x.price * x.weight, 0) / last.atoms.reduce((s, x) => s + x.weight, 0);
    } else {
      clusters.push({ mid: a.price, lo: a.price, hi: a.price, atoms: [a] });
    }
  }
  return clusters;
}

/**
 * 현재가 근처 합류만 골라 정밀 E/SL/TP1 후보.
 */
export function buildAvwapPrecisionEntryPack(params: {
  candles: Candle[];
  timeframe: string;
  legs: AvwapPrecisionFibLegIn[];
  highPack?: MergedDeskAnchoredVwapPack | null;
  lowPack?: MergedDeskAnchoredVwapPack | null;
}): AvwapPrecisionEntryPack {
  const candles = params.candles ?? [];
  const empty: AvwapPrecisionEntryPack = {
    candidates: [],
    priceLines: [],
    overlays: [],
    summaryKo: '정밀타점 · 대기',
  };
  if (candles.length < 40) return empty;

  const end = Math.max(0, candles.length - 2);
  const price = Number(candles[end]!.close);
  const atr = atrApprox(candles, end);
  if (!(price > 0) || !(atr > 0)) return empty;

  const atoms: Atom[] = [];

  for (const leg of params.legs) {
    const tag = leg.role === 'high' ? 'AVWAP고' : 'AVWAP저';
    /** 얕은 되돌림만 정밀 — 0.236 / 0.382 */
    for (const r of [0.236, 0.382] as const) {
      const p = fibPrice(leg.fibHigh, leg.fibLow, r);
      pushAtom(
        atoms,
        p,
        `${tag}·얕은${r}`,
        leg.role === 'low' ? 'support' : 'resistance',
        r === 0.382 ? 14 : 11,
        price,
        atr
      );
    }
    if (leg.lastVwap != null) {
      pushAtom(
        atoms,
        leg.lastVwap,
        `${tag}·AVWAP`,
        leg.role === 'low' ? 'support' : 'resistance',
        16,
        price,
        atr
      );
    }
  }

  const hiV =
    lastLineValue(params.highPack?.extremeLine) ?? lastLineValue(params.highPack?.openLine);
  const loV = lastLineValue(params.lowPack?.extremeLine) ?? lastLineValue(params.lowPack?.openLine);
  if (hiV != null) pushAtom(atoms, hiV, 'AVWAP고줄', 'resistance', 13, price, atr);
  if (loV != null) pushAtom(atoms, loV, 'AVWAP저줄', 'support', 13, price, atr);

  const e20 = emaLast(candles, 20, end);
  const e50 = emaLast(candles, 50, end);
  if (e20 != null) pushAtom(atoms, e20, 'EMA20', 'both', 9, price, atr);
  if (e50 != null) pushAtom(atoms, e50, 'EMA50', 'both', 11, price, atr);

  /** 최근 스윙 (확정봉만) */
  const L = 2;
  const R = 2;
  for (let i = Math.max(L, end - 36); i <= end - R; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    let isH = true;
    let isL = true;
    for (let j = i - L; j <= i + R; j++) {
      if (j === i) continue;
      if (Number(candles[j]!.high) >= h) isH = false;
      if (Number(candles[j]!.low) <= l) isL = false;
    }
    if (isH) pushAtom(atoms, h, '스윙고', 'resistance', 10, price, atr);
    if (isL) pushAtom(atoms, l, '스윙저', 'support', 10, price, atr);
  }

  const mergeDist = Math.max(atr * 0.35, price * 0.0008);
  const clusters = cluster(atoms, mergeDist).filter((c) => {
    const dist = Math.abs(c.mid - price) / atr;
    return dist <= AVWAP_PRECISION_NEAR_ATR;
  });

  const half = Math.max(atr * AVWAP_PRECISION_BAND_ATR, price * 0.00035);
  const tLast = Number(candles[candles.length - 1]!.time);
  const barSec = candleBarDurationSec(params.timeframe, tLast);
  const t1 = Number(candles[Math.max(0, candles.length - 36)]!.time);
  const t2 = tLast + 6 * barSec;

  const candidates: AvwapPrecisionCandidate[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const overlays: OverlayItem[] = [];

  const below = clusters
    .filter((c) => c.mid <= price * 1.002)
    .sort((a, b) => b.atoms.reduce((s, x) => s + x.weight, 0) - a.atoms.reduce((s, x) => s + x.weight, 0) || Math.abs(a.mid - price) - Math.abs(b.mid - price))
    .slice(0, 2);
  const above = clusters
    .filter((c) => c.mid >= price * 0.998)
    .sort((a, b) => b.atoms.reduce((s, x) => s + x.weight, 0) - a.atoms.reduce((s, x) => s + x.weight, 0) || Math.abs(a.mid - price) - Math.abs(b.mid - price))
    .slice(0, 2);

  const makeCand = (
    c: { mid: number; lo: number; hi: number; atoms: Atom[] },
    side: 'LONG' | 'SHORT'
  ): AvwapPrecisionCandidate | null => {
    const labelsKo = [...new Set(c.atoms.map((a) => a.labelKo))].slice(0, 5);
    const evidenceCount = new Set(c.atoms.map((a) => a.labelKo.split('·')[0])).size;
    if (evidenceCount < 2 && c.atoms.length < 2) return null;

    const mid = c.mid;
    const bandBot = Math.min(c.lo, mid) - half * 0.4;
    const bandTop = Math.max(c.hi, mid) + half * 0.4;
    const entry = mid;
    const stopLoss =
      side === 'LONG'
        ? Math.min(bandBot, entry - atr * 0.45)
        : Math.max(bandTop, entry + atr * 0.45);
    const risk = Math.max(Math.abs(entry - stopLoss), atr * 0.25);
    const tp1 = side === 'LONG' ? entry + risk * MIN_RR : entry - risk * MIN_RR;
    const rr = risk > 0 ? Math.abs(tp1 - entry) / risk : 0;
    if (rr < MIN_RR * 0.95) return null;

    const distAtr = Math.abs(mid - price) / atr;
    return {
      side,
      entry,
      stopLoss,
      tp1,
      rr: Math.round(rr * 100) / 100,
      mid,
      bandTop,
      bandBot,
      labelsKo,
      evidenceCount,
      deepRefOnly: false,
      noteKo:
        distAtr <= 0.85
          ? `근접합류×${evidenceCount} · RR≈${rr.toFixed(1)} (조건부)`
          : `근접합류×${evidenceCount} · ${distAtr.toFixed(1)}ATR (터치 대기)`,
    };
  };

  for (const c of below) {
    const cand = makeCand(c, 'LONG');
    if (cand) candidates.push(cand);
  }
  for (const c of above) {
    const cand = makeCand(c, 'SHORT');
    if (cand) candidates.push(cand);
  }

  /** 깊은 0.5/0.618은 가격선 1줄 참고만 (진입 금지 표기) */
  for (const leg of params.legs) {
    const tag = leg.role === 'high' ? 'AVWAP고' : 'AVWAP저';
    for (const r of [0.5, 0.618] as const) {
      const p = fibPrice(leg.fibHigh, leg.fibLow, r);
      const dist = Math.abs(p - price) / atr;
      if (dist <= AVWAP_PRECISION_NEAR_ATR) continue;
      if (dist > 8) continue;
      priceLines.push({
        price: p,
        color: leg.role === 'high' ? COLORS.highOpen : COLORS.lowOpen,
        title: `${tag}·깊은${r}(참고)`,
        lineWidth: 1,
        lineStyle: 'dotted',
        axisLabel: false,
      });
    }
  }

  for (const cand of candidates) {
    const isLong = cand.side === 'LONG';
    const col = isLong ? COLORS.lowExt : COLORS.highOpen;
    priceLines.push({
      price: cand.entry,
      color: col,
      title: isLong ? `정밀롱E·${cand.labelsKo[0] ?? ''}` : `정밀숏E·${cand.labelsKo[0] ?? ''}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: false,
    });
    priceLines.push({
      price: cand.stopLoss,
      color: '#f87171',
      title: isLong ? '정밀롱SL' : '정밀숏SL',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: false,
    });
    priceLines.push({
      price: cand.tp1,
      color: '#4ade80',
      title: isLong ? '정밀롱TP1' : '정밀숏TP1',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: false,
    });
    overlays.push({
      id: `avwap-precision-${cand.side}-${Math.round(cand.mid)}`,
      kind: 'zone',
      label: isLong ? `정밀롱×${cand.evidenceCount}` : `정밀숏×${cand.evidenceCount}`,
      zoneFaceBase: isLong ? '정밀롱' : '정밀숏',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: cand.bandTop,
      price2: cand.bandBot,
      confidence: Math.min(90, 58 + cand.evidenceCount * 8),
      color: isLong ? 'rgba(56,189,248,0.22)' : 'rgba(248,113,113,0.22)',
      lineLabelColor: col,
      category: 'chartPrimeTrendChannels',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'merged-desk-avwap-precision merged-desk-trendline-keep',
      labelTooltip: `${cand.noteKo} · ${cand.labelsKo.join('·')} · 확정 아님`,
      structureBias: isLong ? 'bullish' : 'bearish',
    });
  }

  const nL = candidates.filter((c) => c.side === 'LONG').length;
  const nS = candidates.filter((c) => c.side === 'SHORT').length;
  const summaryKo =
    nL + nS > 0
      ? `정밀타점 롱${nL}·숏${nS} (≤${AVWAP_PRECISION_NEAR_ATR}ATR · 깊은피보≠진입)`
      : `정밀타점 · 근접합류 없음 (깊은0.5/0.618은 참고)`;

  return { candidates, priceLines, overlays, summaryKo };
}

/** 레그 GP/0.5가 현재가에서 너무 멀면 진입 후보로 쓰지 말 것 */
export function isAvwapFibLevelDeepRef(price: number, level: number, atr: number): boolean {
  if (!(atr > 0) || !(price > 0) || !(level > 0)) return true;
  return Math.abs(level - price) / atr > AVWAP_PRECISION_NEAR_ATR;
}
