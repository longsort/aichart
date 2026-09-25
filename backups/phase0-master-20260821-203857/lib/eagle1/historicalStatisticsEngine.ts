/**
 * HistoricalStatisticsEngine — measured MFE/MAE / reach / TP-SL order.
 * Missing or n<30 → 통계 부족. Never invent %.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { SetupOutcome } from './zoneExpectancy';

const REACH_PCTS = [0.5, 1, 2, 3, 5] as const;

export type ReachRow = {
  pct: number;
  label: string;
  rate: number | null;
  note: string;
};

export type HistoricalOutcomeReport = {
  totalSample: number;
  meanMfe: number | null;
  medianMfe: number | null;
  meanMae: number | null;
  medianMae: number | null;
  meanMfePct: number | null;
  medianMfePct: number | null;
  meanMaePct: number | null;
  medianMaePct: number | null;
  reach: ReachRow[];
  tpBeforeSl: number | null;
  slBeforeTp: number | null;
  meanReactionSec: number | null;
  meanReactionLabel: string;
  label: 'ok' | '통계 부족' | '데이터 없음';
};

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function runHistoricalStatistics(params: {
  outcomes: SetupOutcome[];
  tfSec?: number;
}): HistoricalOutcomeReport {
  const rows = params.outcomes ?? [];
  const n = rows.length;
  if (n <= 0) {
    return {
      totalSample: 0,
      meanMfe: null,
      medianMfe: null,
      meanMae: null,
      medianMae: null,
      meanMfePct: null,
      medianMfePct: null,
      meanMaePct: null,
      medianMaePct: null,
      reach: REACH_PCTS.map((pct) => ({ pct, label: `+${pct}%`, rate: null, note: '데이터 없음' })),
      tpBeforeSl: null,
      slBeforeTp: null,
      meanReactionSec: null,
      meanReactionLabel: '데이터 없음',
      label: '데이터 없음',
    };
  }
  const short = n < EAGLE1_MIN_STAT_SAMPLE;
  const note = short ? '통계 부족' : '';
  const mfe = rows.map((r) => r.mfe).filter((x) => Number.isFinite(x));
  const mae = rows.map((r) => r.mae).filter((x) => Number.isFinite(x));
  const mfePct = rows.map((r) => r.mfePct).filter((x): x is number => x != null && Number.isFinite(x));
  const maePct = rows.map((r) => r.maePct).filter((x): x is number => x != null && Number.isFinite(x));
  const tpN = rows.filter((r) => r.tpFirst).length;
  const slN = rows.filter((r) => r.slFirst).length;
  const decided = tpN + slN;
  const reactionBars = rows.map((r) => r.reactionBars).filter((x): x is number => x != null && x > 0);
  const tfSec = params.tfSec && params.tfSec > 0 ? params.tfSec : null;
  const meanBars = mean(reactionBars);
  const meanReactionSec = !short && meanBars != null && tfSec != null ? meanBars * tfSec : null;

  const reach: ReachRow[] = REACH_PCTS.map((pct) => {
    if (short || mfePct.length < EAGLE1_MIN_STAT_SAMPLE) {
      return { pct, label: `+${pct}%`, rate: null, note: n <= 0 ? '데이터 없음' : '통계 부족' };
    }
    const hit = mfePct.filter((x) => x >= pct).length;
    return { pct, label: `+${pct}%`, rate: hit / mfePct.length, note: '' };
  });

  return {
    totalSample: n,
    meanMfe: short ? null : mean(mfe),
    medianMfe: short ? null : median(mfe),
    meanMae: short ? null : mean(mae),
    medianMae: short ? null : median(mae),
    meanMfePct: short || mfePct.length < EAGLE1_MIN_STAT_SAMPLE ? null : mean(mfePct),
    medianMfePct: short || mfePct.length < EAGLE1_MIN_STAT_SAMPLE ? null : median(mfePct),
    meanMaePct: short || maePct.length < EAGLE1_MIN_STAT_SAMPLE ? null : mean(maePct),
    medianMaePct: short || maePct.length < EAGLE1_MIN_STAT_SAMPLE ? null : median(maePct),
    reach,
    tpBeforeSl: short || decided < EAGLE1_MIN_STAT_SAMPLE ? null : tpN / n,
    slBeforeTp: short || decided < EAGLE1_MIN_STAT_SAMPLE ? null : slN / n,
    meanReactionSec,
    meanReactionLabel:
      meanReactionSec == null ? (n <= 0 ? '데이터 없음' : '통계 부족') : '',
    label: short ? '통계 부족' : 'ok',
  };
}

export function formatReactionTime(sec: number | null, fallback: string): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return fallback;
  if (sec < 3600) return `${Math.round(sec / 60)}분`;
  return `${(sec / 3600).toFixed(1)} H`;
}
