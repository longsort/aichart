import type { VolumeShockHorizonStat, VolumeShockStat, VolumeShockUsdBand } from '@/lib/volumeShockForecast';

export function fmtVolPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtVolUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function fmtUsdBandKo(band: VolumeShockUsdBand | null | undefined, side: 'long' | 'short'): string {
  if (!band) return '—';
  const lo = side === 'short' ? Math.min(band.p10, band.p25) : Math.min(band.p25, band.median);
  const hi = side === 'short' ? Math.max(band.p75, band.p90) : Math.max(band.median, band.p90);
  const med = band.median;
  return `${fmtVolUsd(lo)} ~ ${fmtVolUsd(hi)} (중앙 ${fmtVolUsd(med)})`;
}

export function bestVolumeShockStat(stats: VolumeShockStat[]): VolumeShockStat | null {
  if (!stats.length) return null;
  return stats.reduce((a, b) => (a.sampleCount >= b.sampleCount ? a : b));
}

export function horizonAt(stat: VolumeShockStat | null, bars: number): VolumeShockHorizonStat | null {
  if (!stat) return null;
  return stat.horizons.find((h) => h.bars === bars) ?? stat.horizons[0] ?? null;
}
