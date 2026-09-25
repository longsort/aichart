import type { VolumeShockForecastResult, VolumeShockStat } from '@/lib/volumeShockForecast';
import { horizonAt } from '@/lib/volumeShockFormat';
import { pickVolumeShockStatForSide } from '@/lib/volumeShockMetrics';

export type VolumeShockGuideHorizon = {
  bars: number;
  probFavorablePct: number;
  medianUsd: number;
  bandLoUsd: number;
  bandHiUsd: number;
};

export type VolumeShockChartGuide = {
  side: 'long' | 'short' | 'none';
  close: number;
  volume: number;
  sampleCount: number;
  horizons: VolumeShockGuideHorizon[];
};

function pickActiveStat(vs: VolumeShockForecastResult): { stat: VolumeShockStat; side: 'long' | 'short' } | null {
  const c = vs.current;
  const buyHit = c.hitThresholdsBuy.length + c.hitThresholdsBull.length > 0;
  const sellHit = c.hitThresholdsBear.length + c.hitThresholdsSell.length > 0;
  let side: 'long' | 'short' =
    buyHit && !sellHit
      ? 'long'
      : sellHit && !buyHit
        ? 'short'
        : c.isBear && !c.isBull
          ? 'short'
          : 'long';
  const stat = pickVolumeShockStatForSide(side, vs);
  if (!stat || stat.sampleCount < 3) {
    const altSide = side === 'long' ? 'short' : 'long';
    const alt = pickVolumeShockStatForSide(altSide, vs);
    if (alt && alt.sampleCount >= 3) return { stat: alt, side: altSide };
    return null;
  }
  return { stat, side };
}

function horizonGuide(
  stat: VolumeShockStat,
  side: 'long' | 'short',
  bars: number,
  close: number
): VolumeShockGuideHorizon | null {
  const h = horizonAt(stat, bars);
  if (!h) return null;
  const med =
    h.medianMoveUsd ??
    (Number.isFinite(h.medianPct) ? (h.medianPct / 100) * close : 0);
  const band = h.usdBand;
  let bandLo = med;
  let bandHi = med;
  if (band) {
    if (side === 'long') {
      bandLo = band.p25;
      bandHi = band.p90;
    } else {
      bandLo = band.p10;
      bandHi = band.p75;
    }
  }
  return {
    bars,
    probFavorablePct: Math.round(h.probFavorable * 100),
    medianUsd: med,
    bandLoUsd: bandLo,
    bandHiUsd: bandHi,
  };
}

/** 과거 분포 → 현재 봉 기준 USD 가격 가이드 (확정 예측 아님) */
export function buildVolumeShockChartGuide(vs: VolumeShockForecastResult): VolumeShockChartGuide | null {
  const picked = pickActiveStat(vs);
  if (!picked) return null;
  const { stat, side } = picked;
  const close = vs.current.close;
  if (!Number.isFinite(close) || close <= 0) return null;

  const horizons = [1, 4, 12]
    .map((b) => horizonGuide(stat, side, b, close))
    .filter((x): x is VolumeShockGuideHorizon => x != null);

  if (!horizons.length) return null;

  return {
    side,
    close,
    volume: vs.current.volume,
    sampleCount: stat.sampleCount,
    horizons,
  };
}

/** 가격축 라벨 — 숫자(USD)만 */
export function volumeShockGuidePriceLevels(
  guide: VolumeShockChartGuide,
  focusBars = 4
): Array<{ price: number; title: string; color: string; kind: 'median' | 'band' }> {
  const h = guide.horizons.find((x) => x.bars === focusBars) ?? guide.horizons[0];
  if (!h) return [];
  const base = guide.close;
  const isLong = guide.side === 'long';
  const medPrice = base + h.medianUsd;
  const loPrice = base + h.bandLoUsd;
  const hiPrice = base + h.bandHiUsd;
  const colMed = isLong ? 'rgba(34,197,94,0.88)' : 'rgba(248,113,113,0.88)';
  const colBand = isLong ? 'rgba(34,211,238,0.55)' : 'rgba(251,191,36,0.55)';
  const fmt = (p: number) => Math.round(p).toLocaleString('en-US');
  const out = [
    { price: base, title: fmt(base), color: 'rgba(148,163,184,0.75)', kind: 'band' as const },
    { price: medPrice, title: fmt(medPrice), color: colMed, kind: 'median' as const },
    { price: loPrice, title: fmt(loPrice), color: colBand, kind: 'band' as const },
    { price: hiPrice, title: fmt(hiPrice), color: colBand, kind: 'band' as const },
  ].filter((x) => Number.isFinite(x.price) && x.price > 0);
  const seen = new Set<number>();
  return out.filter((x) => {
    const k = Math.round(x.price);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
