import type { VolumePhaseCurrentMatch } from '@/lib/volumePhaseStats';

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  const v = Math.abs(Math.round(n));
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${sign}$${v}`;
}

/** 차트 현재 봉 1줄 — 과거 전구간 통계 기반 */
export function formatVolumePhaseCurrentLabel(match: VolumePhaseCurrentMatch): string {
  const h = match.horizons.find((x) => x.bars === match.primaryHorizon) ?? match.horizons[0];
  if (!h) return match.label;
  const n = h.sampleCount;
  const prob = Math.round(h.probFavorable * 100);
  const med = fmtUsd(h.medianUsd);
  const side =
    match.eventType === 'RANGE_DIST' ? '하락' : match.eventType === 'RANGE_ACC' ? '상승' : '방향';
  const phase = match.scenarioKo
    ? match.scenarioKo
    : match.inRangePhase && match.eventType === 'RANGE_DIST'
      ? `횡보·매도${Math.round(match.sellPct * 100)}%`
      : match.inRangePhase && match.eventType === 'RANGE_ACC'
        ? `횡보·매수${Math.round((1 - match.sellPct) * 100)}%`
        : match.label;
  const trust = h.sampleLowTrust ? '·저표본' : '';
  const cv = match.candleJoint
    ? ` · 음${Math.round(match.candleJoint.bearPct * 100)}% ${match.candleJoint.volTrend === 'grow' ? '량↑' : match.candleJoint.volTrend === 'shrink' ? '량↓' : '량→'}`
    : '';
  return `${phase}${cv} · n=${n} +${h.bars} ${side} ${med} ${prob}%${trust}`;
}
