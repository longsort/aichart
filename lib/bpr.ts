/**
 * BPR (Balanced Price Range) — ICT식.
 * 상승 FVG ∩ 하락 FVG 겹침 구간 = 균형가격대.
 * 이미지처럼 주황 네모로 작도 · 재터치 타점 후보.
 * 확정 수익·승률 아님. 리페인트 방지: 마감봉 기준 형성.
 */
import type { Candle, OverlayItem } from '@/types';
import {
  computePriceBandSrProb,
  appendSrProbToLabel,
} from '@/lib/zoneSupportResistProb';

export type BprFvgInput = {
  bias: 'bullish' | 'bearish';
  index: number;
  low: number;
  high: number;
  valid: boolean;
};

export type BPRZone = {
  top: number;
  bottom: number;
  midpoint: number;
  strength: number;
  index: number;
  /** ICT: 겹친 롱/숏 FVG */
  mode?: 'ict' | 'cluster';
  bias?: 'bullish' | 'bearish' | 'neutral';
  bullIndex?: number;
  bearIndex?: number;
};

export type IctBprZone = {
  top: number;
  bottom: number;
  midpoint: number;
  /** 형성 완료 봉 인덱스 (두 FVG 중 늦은 쪽) */
  formedIndex: number;
  /** 빠른 쪽 FVG 시작 */
  startIndex: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  bullIndex: number;
  bearIndex: number;
  noteKo: string;
};

function atrApprox(candles: Candle[], end: number): number {
  const n = Math.max(1, Math.min(candles.length, end));
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    c += 1;
  }
  const last = Number(candles[n - 1]?.close) || 1;
  return c > 0 ? s / c : last * 0.004;
}

/** 3봉 FVG — 완화 여부 포함 (BPR은 겹침이 핵심이라 완화본도 후보) */
export function collectFvgForBpr(
  candles: Candle[],
  endExclusive?: number
): BprFvgInput[] {
  const n = Math.max(
    0,
    Math.min(candles.length, endExclusive != null ? Math.floor(endExclusive) : candles.length)
  );
  const out: BprFvgInput[] = [];
  const overlaps = (c: Candle, lo: number, hi: number) =>
    Number(c.low) <= hi && Number(c.high) >= lo;
  for (let i = 2; i < n; i++) {
    const c1 = candles[i - 2]!;
    const c3 = candles[i]!;
    if (Number(c1.high) < Number(c3.low)) {
      const gapLo = Number(c1.high);
      const gapHi = Number(c3.low);
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (overlaps(candles[j]!, gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      out.push({ bias: 'bullish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
    if (Number(c1.low) > Number(c3.high)) {
      const gapLo = Number(c3.high);
      const gapHi = Number(c1.low);
      let mitigated = false;
      for (let j = i + 1; j < n; j++) {
        if (overlaps(candles[j]!, gapLo, gapHi)) {
          mitigated = true;
          break;
        }
      }
      out.push({ bias: 'bearish', index: i, low: gapLo, high: gapHi, valid: !mitigated });
    }
  }
  return out;
}

/**
 * ICT BPR: 상승 FVG와 하락 FVG의 가격 겹침.
 * 이미지 타점 — 겹침 네모(주황) · 이후 재터치 시 진입 후보.
 */
export function detectIctBpr(
  candles: Candle[],
  opts?: {
    endExclusive?: number;
    maxZones?: number;
    /** 두 FVG 인덱스 최대 거리 */
    maxIndexGap?: number;
    atr?: number;
  }
): IctBprZone[] {
  const n =
    opts?.endExclusive != null
      ? Math.max(0, Math.min(candles.length, Math.floor(opts.endExclusive)))
      : candles.length;
  if (n < 8) return [];
  const atr = opts?.atr != null && opts.atr > 0 ? opts.atr : atrApprox(candles, n);
  const maxGap = Math.max(4, Math.min(40, opts?.maxIndexGap ?? 20));
  const maxZones = Math.max(1, Math.min(5, opts?.maxZones ?? 2));
  const fvgs = collectFvgForBpr(candles, n);
  const bulls = fvgs.filter((f) => f.bias === 'bullish');
  const bears = fvgs.filter((f) => f.bias === 'bearish');
  if (!bulls.length || !bears.length) return [];

  const lastPx = Number(candles[n - 1]?.close) || 0;
  const raw: IctBprZone[] = [];

  for (const bu of bulls) {
    for (const be of bears) {
      if (Math.abs(bu.index - be.index) > maxGap) continue;
      const top = Math.min(bu.high, be.high);
      const bot = Math.max(bu.low, be.low);
      if (!(top > bot)) continue;
      const h = top - bot;
      if (h < atr * 0.04) continue;
      if (h > atr * 2.2) continue;
      const formedIndex = Math.max(bu.index, be.index);
      const startIndex = Math.min(bu.index - 2, be.index - 2, bu.index, be.index);
      /** 늦게 생긴 FVG 방향 = 최근 불균형 쪽 편향 */
      const bias: IctBprZone['bias'] =
        bu.index === be.index
          ? 'neutral'
          : bu.index > be.index
            ? 'bullish'
            : 'bearish';
      const bothFresh = bu.valid && be.valid ? 1 : 0;
      const near =
        lastPx > 0 ? 1 / (1 + Math.abs((top + bot) / 2 - lastPx) / Math.max(atr, 1e-9)) : 0.5;
      const strength = Math.min(
        98,
        55 + bothFresh * 12 + Math.round(near * 20) + Math.max(0, 8 - Math.abs(bu.index - be.index))
      );
      raw.push({
        top,
        bottom: bot,
        midpoint: (top + bot) / 2,
        formedIndex,
        startIndex: Math.max(0, startIndex),
        bias,
        strength,
        bullIndex: bu.index,
        bearIndex: be.index,
        noteKo:
          bias === 'bullish'
            ? 'BPR · 상승FVG∩하락FVG · 롱재터치후보'
            : bias === 'bearish'
              ? 'BPR · 하락FVG∩상승FVG · 숏재터치후보'
              : 'BPR · 균형겹침',
      });
    }
  }

  /** 겹치는 BPR 중 강도·최근성 우선 · 가격 근접 */
  raw.sort((a, b) => {
    const da = Math.abs(a.midpoint - lastPx);
    const db = Math.abs(b.midpoint - lastPx);
    if (Math.abs(da - db) > atr * 0.15) return da - db;
    if (b.formedIndex !== a.formedIndex) return b.formedIndex - a.formedIndex;
    return b.strength - a.strength;
  });

  const picked: IctBprZone[] = [];
  for (const z of raw) {
    if (picked.some((p) => Math.abs(p.midpoint - z.midpoint) < atr * 0.25)) continue;
    picked.push(z);
    if (picked.length >= maxZones) break;
  }
  return picked;
}

/**
 * 레거시: FVG 미드 클러스터 (eagle1·구 analyze 호환).
 * ICT 겹침이 있으면 그쪽을 BPRZone으로도 반환.
 */
export function detectBPR(
  fvgs: Array<{ low: number; high: number; index: number; valid: boolean; bias?: string }>,
  atr: number,
  maxZones = 3
): BPRZone[] {
  const withBias = fvgs as BprFvgInput[];
  const bulls = withBias.filter((f) => f.valid && f.bias === 'bullish');
  const bears = withBias.filter((f) => f.valid && f.bias === 'bearish');
  const ictLike: BPRZone[] = [];
  if (bulls.length && bears.length) {
    const maxGap = 20;
    for (const bu of bulls) {
      for (const be of bears) {
        if (Math.abs(bu.index - be.index) > maxGap) continue;
        const top = Math.min(bu.high, be.high);
        const bot = Math.max(bu.low, be.low);
        if (!(top > bot)) continue;
        const h = top - bot;
        if (atr > 0 && (h < atr * 0.04 || h > atr * 2.2)) continue;
        ictLike.push({
          top,
          bottom: bot,
          midpoint: (top + bot) / 2,
          strength: 2 + (bu.valid && be.valid ? 1 : 0),
          index: Math.max(bu.index, be.index),
          mode: 'ict',
          bias: bu.index >= be.index ? 'bullish' : 'bearish',
          bullIndex: bu.index,
          bearIndex: be.index,
        });
      }
    }
  }
  if (ictLike.length) {
    return ictLike
      .sort((a, b) => b.strength - a.strength || b.index - a.index)
      .slice(0, maxZones);
  }

  const valid = fvgs.filter((f) => f.valid);
  if (valid.length < 2) return [];

  const tol = atr * 0.3;
  const clusters: Array<{ tops: number[]; bottoms: number[]; indices: number[] }> = [];

  for (const f of valid) {
    const mid = (f.low + f.high) / 2;
    let found = false;
    for (const c of clusters) {
      const cMid = (Math.min(...c.bottoms) + Math.max(...c.tops)) / 2;
      if (Math.abs(mid - cMid) <= tol) {
        c.tops.push(f.high);
        c.bottoms.push(f.low);
        c.indices.push(f.index);
        found = true;
        break;
      }
    }
    if (!found) clusters.push({ tops: [f.high], bottoms: [f.low], indices: [f.index] });
  }

  return clusters
    .filter((c) => c.tops.length >= 2)
    .map((c) => ({
      top: Math.max(...c.tops),
      bottom: Math.min(...c.bottoms),
      midpoint: (Math.max(...c.tops) + Math.min(...c.bottoms)) / 2,
      strength: c.tops.length,
      index: Math.min(...c.indices),
      mode: 'cluster' as const,
      bias: 'neutral' as const,
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxZones);
}

/** 가격이 BPR 존에 닿았는지 (타점 게이트) */
export function priceTouchesBpr(
  price: number,
  zone: { top: number; bottom: number },
  bufPct = 0.00035
): boolean {
  if (!(price > 0) || !(zone.top > zone.bottom)) return false;
  const pad = ((zone.top + zone.bottom) / 2) * bufPct;
  return price >= zone.bottom - pad && price <= zone.top + pad;
}

/** 통합·분석 차트용 주황 BPR 네모 — 실측 지지/저항% 포함 */
export function buildMergedDeskBprOverlays(params: {
  candles: Candle[];
  timeframe?: string;
  maxZones?: number;
}): { overlays: OverlayItem[]; zones: IctBprZone[]; summaryKo: string } {
  const candles = params.candles;
  const n = candles.length;
  if (n < 10) {
    return { overlays: [], zones: [], summaryKo: 'BPR 대기 · 봉부족' };
  }
  /** 마감봉까지만 — 리페인트 방지 */
  const endEx = n >= 2 ? n - 1 : n;
  const zones = detectIctBpr(candles, {
    endExclusive: endEx,
    maxZones: params.maxZones ?? 2,
  });
  if (!zones.length) {
    return { overlays: [], zones: [], summaryKo: 'BPR 없음 · 상승·하락 FVG 겹침 대기' };
  }

  const lastT = Number(candles[n - 1]?.time) || 0;
  const overlays: OverlayItem[] = [];
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]!;
    const t1 = Number(candles[Math.max(0, z.startIndex)]?.time) || lastT;
    const t2 = lastT;
    const biasKo =
      z.bias === 'bullish' ? '롱재터치' : z.bias === 'bearish' ? '숏재터치' : '균형';
    const sr = computePriceBandSrProb(candles, z.bottom, z.top, {
      endExclusive: endEx,
    });
    const mark = Number(candles[n - 1]?.close) || z.midpoint;
    const label = appendSrProbToLabel(`BPR · ${biasKo}`, sr, {
      price: mark,
      zoneLo: z.bottom,
      zoneHi: z.top,
    });
    const pickedRole =
      mark > z.top ? 'support' : mark < z.bottom ? 'resist' : mark >= z.midpoint ? 'support' : 'resist';
    overlays.push({
      id: `merged-desk-bpr-${z.formedIndex}-${i}`,
      kind: 'bprZone',
      label,
      time1: t1,
      time2: t2,
      price1: z.top,
      price2: z.bottom,
      confidence: sr.confidence ?? Math.round(z.strength),
      supportProb: pickedRole === 'support' ? sr.supportProb : null,
      resistanceProb: pickedRole === 'resist' ? sr.resistanceProb : null,
      probSamples: sr.samples,
      color: 'rgba(249,115,22,0.28)',
      category: 'bpr',
      overlayZoneExtraClass: 'merged-desk-bpr-zone',
      noteKo: `${z.noteKo} · ${sr.labelKo}`,
      zoneFaceBase: label,
      zoneFaceSignal: sr.labelKo,
      labelTooltip: `${z.noteKo} · ${sr.labelKo} · 확정아님`,
    } as OverlayItem);
  }

  const z0 = zones[0]!;
  return {
    overlays,
    zones,
    summaryKo: `BPR ${zones.length} · ${z0.bottom.toFixed(z0.bottom >= 100 ? 1 : 4)}~${z0.top.toFixed(z0.top >= 100 ? 1 : 4)} · ${z0.noteKo}`,
  };
}
