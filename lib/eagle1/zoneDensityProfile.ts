/**
 * ZoneDensityProfile — 가격축 bin에 Evidence 밀도를 쌓아 CORE 구간을 압축한다.
 * min~max 전체 합치기 금지. 밀도 peak 구간만 선택.
 */

import type { Eagle1Zone, ZoneSource } from './zoneEngine';
import type { MarketZone } from './marketZone';
import { eagle1ZoneToMarketZone } from './marketZone';

export type DensityEvidencePoint = {
  id: string;
  source: string;
  lower: number;
  upper: number;
  /** bin 가중치 — 승률/확률 아님 */
  weight: number;
  direction: 'bullish' | 'bearish' | 'neutral';
};

export type DensityBin = {
  index: number;
  lower: number;
  upper: number;
  mid: number;
  score: number;
  hitCount: number;
  sources: string[];
};

export type ZoneDensityProfile = {
  binWidth: number;
  bins: DensityBin[];
  peakScore: number;
  /** 밀도 peak 연속 구간 (CORE 후보) */
  peakBand: { lower: number; upper: number; score: number; sources: string[] } | null;
  evidenceCount: number;
  note: string;
};

/** 소스별 휴리스틱 가중치 (고정 승률 아님 — 캘리브레이션 가능 초기값) */
const SOURCE_WEIGHT: Partial<Record<ZoneSource, number>> = {
  poc: 3.2,
  hvn: 2.4,
  vah: 2.0,
  val: 2.0,
  ob: 2.6,
  fvg: 2.2,
  bpr: 2.4,
  breaker: 2.3,
  demand: 2.0,
  supply: 2.0,
  sr: 1.4,
  liquidity: 1.8,
  lvn: 1.2,
};

export function evidenceWeightForSource(source: string): number {
  return SOURCE_WEIGHT[source as ZoneSource] ?? 1.0;
}

export function zonesToDensityEvidence(
  zones: Array<Eagle1Zone | MarketZone>,
  symbol = ''
): DensityEvidencePoint[] {
  const out: DensityEvidencePoint[] = [];
  for (const raw of zones) {
    const z: MarketZone =
      'sourceTimeframe' in raw && 'id' in raw && !('zone_id' in raw)
        ? (raw as MarketZone)
        : eagle1ZoneToMarketZone(raw as Eagle1Zone, { symbol });
    if (!(z.upper > z.lower) || !Number.isFinite(z.upper) || !Number.isFinite(z.lower)) continue;
    if (z.state === 'INVALID' || z.state === 'DELETED' || z.state === 'BROKEN') continue;
    const w = evidenceWeightForSource(String(z.type));
    out.push({
      id: z.id,
      source: String(z.type),
      lower: z.lower,
      upper: z.upper,
      weight: w * (z.tier === 'S' ? 1.25 : z.tier === 'A' ? 1.1 : 1),
      direction: z.direction,
    });
  }
  return out;
}

/**
 * 가격축을 bin으로 나누고 evidence 겹침 점수를 합산.
 * peak 연속 bin을 CORE 구간으로 압축.
 */
export function buildZoneDensityProfile(params: {
  evidence: DensityEvidencePoint[];
  /** 대략 bin 폭 — 미지정이면 evidence span / 48 */
  binWidth?: number;
  /** peak로 인정할 최소 점수 비율 (peak 대비) */
  peakRatio?: number;
}): ZoneDensityProfile {
  const evidence = params.evidence.filter(
    (e) => e.upper > e.lower && Number.isFinite(e.lower) && Number.isFinite(e.upper) && e.weight > 0
  );
  if (evidence.length === 0) {
    return {
      binWidth: 0,
      bins: [],
      peakScore: 0,
      peakBand: null,
      evidenceCount: 0,
      note: 'UNAVAILABLE',
    };
  }

  const lo = Math.min(...evidence.map((e) => e.lower));
  const hi = Math.max(...evidence.map((e) => e.upper));
  const span = Math.max(hi - lo, 1e-9);
  const binWidth = params.binWidth && params.binWidth > 0 ? params.binWidth : span / 48;
  const nBins = Math.max(8, Math.min(96, Math.ceil(span / binWidth)));
  const step = span / nBins;
  const peakRatio = params.peakRatio ?? 0.55;

  const bins: DensityBin[] = [];
  for (let i = 0; i < nBins; i++) {
    const bl = lo + i * step;
    const bu = i === nBins - 1 ? hi : lo + (i + 1) * step;
    bins.push({
      index: i,
      lower: bl,
      upper: bu,
      mid: (bl + bu) / 2,
      score: 0,
      hitCount: 0,
      sources: [],
    });
  }

  for (const e of evidence) {
    for (const b of bins) {
      const overlap = Math.min(e.upper, b.upper) - Math.max(e.lower, b.lower);
      if (overlap <= 0) continue;
      const frac = overlap / Math.max(e.upper - e.lower, 1e-12);
      b.score += e.weight * frac;
      b.hitCount += 1;
      if (!b.sources.includes(e.source)) b.sources.push(e.source);
    }
  }

  const peakScore = bins.reduce((m, b) => Math.max(m, b.score), 0);
  if (!(peakScore > 0)) {
    return {
      binWidth: step,
      bins,
      peakScore: 0,
      peakBand: null,
      evidenceCount: evidence.length,
      note: 'UNAVAILABLE',
    };
  }

  const thresh = peakScore * peakRatio;
  const hot = bins.map((b) => b.score >= thresh);
  /** 최고점 bin을 포함하는 최장 연속 hot 구간 */
  let bestStart = -1;
  let bestEnd = -1;
  let bestLen = 0;
  let peakIdx = bins.findIndex((b) => b.score === peakScore);
  if (peakIdx < 0) peakIdx = 0;

  let i = 0;
  while (i < hot.length) {
    if (!hot[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < hot.length && hot[j + 1]) j += 1;
    const coversPeak = peakIdx >= i && peakIdx <= j;
    const len = j - i + 1;
    if (coversPeak && len >= bestLen) {
      bestStart = i;
      bestEnd = j;
      bestLen = len;
    }
    i = j + 1;
  }

  if (bestStart < 0) {
    bestStart = peakIdx;
    bestEnd = peakIdx;
  }

  const bandBins = bins.slice(bestStart, bestEnd + 1);
  const sources = [...new Set(bandBins.flatMap((b) => b.sources))];
  const peakBand = {
    lower: bandBins[0]!.lower,
    upper: bandBins[bandBins.length - 1]!.upper,
    score: bandBins.reduce((s, b) => s + b.score, 0) / bandBins.length,
    sources,
  };

  return {
    binWidth: step,
    bins,
    peakScore,
    peakBand,
    evidenceCount: evidence.length,
    note: `density peak · ${sources.join('+') || 'n/a'}`,
  };
}

/** Acceptance A용: 방향 필터 후 density */
export function densityPeakForDirection(
  evidence: DensityEvidencePoint[],
  direction: 'bullish' | 'bearish',
  opts?: { binWidth?: number; peakRatio?: number }
): ZoneDensityProfile {
  const filtered = evidence.filter(
    (e) => e.direction === direction || e.direction === 'neutral' || e.source === 'poc'
  );
  return buildZoneDensityProfile({ evidence: filtered, ...opts });
}
