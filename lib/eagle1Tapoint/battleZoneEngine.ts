/**
 * §8 BATTLE ZONE — 다중 독립 증거 겹침 우선.
 * 단일 피벗/존만으로 진입하지 않음.
 */
import type { TapBattleZone } from './types';
import type { TapLiqNode } from './liquidityMap';
import type { TapPriorLevel } from './pdhPdlLevels';

export type TapZoneCandidate = {
  lo: number;
  hi: number;
  kind?: string;
  tier?: string;
  label?: string;
  strength?: number;
};

export type BattleBuildInput = {
  price: number;
  zones: TapZoneCandidate[];
  liqNodes?: TapLiqNode[] | null;
  priorLevels?: TapPriorLevel[] | null;
  /** ATR 또는 가격 비율 패드 */
  mergePadPct?: number;
};

function midOf(lo: number, hi: number): number {
  return (lo + hi) / 2;
}

function overlaps(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  pad: number
): boolean {
  return !(aHi + pad < bLo || bHi + pad < aLo);
}

/**
 * 가격대 클러스터 — 존 + 유동성 노드가 겹치면 증거 수↑.
 */
export function buildBattleZone(input: BattleBuildInput): TapBattleZone | null {
  const px = input.price;
  if (!(px > 0)) return null;
  const padPct = Math.max(0.0008, Number(input.mergePadPct) || 0.0025);
  const pad = px * padPct;

  type Cluster = {
    lo: number;
    hi: number;
    sources: string[];
    score: number;
  };

  const clusters: Cluster[] = [];

  const addBand = (lo: number, hi: number, source: string, boost: number) => {
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    if (!(a > 0) || !(b > 0)) return;
    let merged = false;
    for (const c of clusters) {
      if (overlaps(c.lo, c.hi, a, b, pad)) {
        c.lo = Math.min(c.lo, a);
        c.hi = Math.max(c.hi, b);
        if (!c.sources.includes(source)) c.sources.push(source);
        c.score += boost;
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ lo: a, hi: b, sources: [source], score: boost });
    }
  };

  for (const z of input.zones || []) {
    const tierBoost = z.tier === 'S' ? 28 : z.tier === 'A' ? 20 : z.tier === 'B' ? 12 : 8;
    const kind = String(z.kind || z.label || 'zone');
    addBand(z.lo, z.hi, kind, tierBoost + (Number(z.strength) || 0) * 0.05);
  }

  for (const n of input.liqNodes || []) {
    const half = Math.max(pad * 0.8, px * 0.0006);
    addBand(n.price - half, n.price + half, n.kind, 10 + n.strength * 0.08);
  }

  for (const lv of input.priorLevels || []) {
    const half = Math.max(pad, px * 0.0008);
    addBand(lv.price - half, lv.price + half, lv.kind, 18);
  }

  if (!clusters.length) return null;

  /** 증거 2개 미만이면 Battle로 승격하지 않음(단일 피벗 금지) — 단 S티어 존 1개는 허용 */
  const ranked = clusters
    .map((c) => {
      const mid = midOf(c.lo, c.hi);
      const dist = Math.abs(px - mid) / px;
      const evidence = c.sources.length;
      const near = dist < 0.012 ? 25 : dist < 0.025 ? 10 : -40;
      const multi = evidence >= 3 ? 35 : evidence >= 2 ? 18 : 0;
      const total = c.score + near + multi + evidence * 6;
      return { ...c, mid, evidence, total, dist };
    })
    .filter((c) => c.evidence >= 2 || c.sources.some((s) => /cluster|S|합류/i.test(s)))
    .sort((a, b) => b.total - a.total || a.dist - b.dist);

  const best = ranked[0];
  if (!best) {
    /** fallback: 최근접 존 1개 — strength 낮게 · 게이트가 막을 수 있음 */
    const z0 = (input.zones || [])
      .map((z) => {
        const lo = Math.min(z.lo, z.hi);
        const hi = Math.max(z.lo, z.hi);
        const mid = midOf(lo, hi);
        return { z, lo, hi, mid, dist: Math.abs(px - mid) / px };
      })
      .filter((x) => x.lo > 0)
      .sort((a, b) => a.dist - b.dist)[0];
    if (!z0) return null;
    return {
      lo: z0.lo,
      hi: z0.hi,
      mid: z0.mid,
      labelKo: z0.z.label || z0.z.kind || '단일존(증거부족)',
      sources: [String(z0.z.kind || 'zone'), 'WEAK_SINGLE'],
      strength: Math.max(20, Math.min(55, Math.round(40 - z0.dist * 400))),
    };
  }

  /** 차트 우측 라벨 — 합류N 짧게 (면 안 가리게). 증거 종류는 sources에 유지 */
  return {
    lo: best.lo,
    hi: best.hi,
    mid: best.mid,
    labelKo:
      best.evidence >= 3
        ? `전투구간·합류${best.evidence}`
        : `전투후보·합류${best.evidence}`,
    sources: best.sources.slice(0, 8),
    strength: Math.max(
      35,
      Math.min(100, Math.round(50 + best.evidence * 12 + Math.min(20, best.score / 5)))
    ),
  };
}

/** 단일 피벗/WEAK_SINGLE 만이면 tipMissing 취급에 가깝게 */
export function battleZoneIsWeakSingle(z: TapBattleZone | null): boolean {
  if (!z) return true;
  return z.sources.includes('WEAK_SINGLE') || z.sources.length < 2;
}
