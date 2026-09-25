import type { AmzStatsFile } from './statsTypes';

/** 통계 → Zone 확률 보정 입력 (표본 부족이면 전부 null) */
export function empiricRatesFromStats(
  stats: AmzStatsFile | null,
  role?: string
): {
  hold: number | null;
  breakTrue: number | null;
  fakeBreak: number | null;
  sweep: number | null;
  range: number | null;
  flip: number | null;
  sampleSize: number;
  calibrated: boolean;
  abstainReasonKo: string | null;
} {
  if (!stats || stats.sampleLowTrust || stats.eventCount < stats.sampleTrustMin) {
    return {
      hold: null,
      breakTrue: null,
      fakeBreak: null,
      sweep: null,
      range: null,
      flip: null,
      sampleSize: stats?.eventCount ?? 0,
      calibrated: false,
      abstainReasonKo: stats ? stats.disclaimerKo : '통계 없음 — WAIT',
    };
  }
  const rows =
    role && stats.byRole[role]?.length ? stats.byRole[role]! : stats.byKind;
  const pick = (k: string) => rows.find((r) => r.kind === k)?.rate ?? null;
  return {
    hold: pick('HOLD'),
    breakTrue: pick('BREAK'),
    fakeBreak: pick('FAKE_BREAK'),
    sweep: pick('SWEEP_REVERSAL'),
    range: pick('RANGE'),
    flip: pick('FLIP'),
    sampleSize: stats.eventCount,
    calibrated: true,
    abstainReasonKo: null,
  };
}
