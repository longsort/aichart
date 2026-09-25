/**
 * PHASE 14 — Calibration gate.
 * Setup Score ≠ Historical Win Rate. Walk-forward only when sample ≥ min.
 * Never invent win rates; never copy setupScore/100 into historicalWinRate.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type CalibrationLabel = 'LOW_SAMPLE' | 'WALK_FORWARD' | 'UNAVAILABLE';

export type CalibrationGateReport = {
  label: CalibrationLabel;
  setupScore: number | null;
  /** 0..1 or null — NEVER a copy of setupScore/100 */
  historicalWinRate: number | null;
  sampleSize: number;
  minSample: number;
  scoresEqualForbidden: true;
  note: string;
  summaryKo: string;
};

function finiteOrNull(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? Number(n) : null;
}

/**
 * Accept rate 0..1 or percent 0..100. Reject NaN / out-of-range.
 * Values > 100 are invalid (not a win rate).
 */
export function normalizeHistoricalWinRate(raw: number | null | undefined): number | null {
  const v = finiteOrNull(raw);
  if (v == null) return null;
  if (v < 0) return null;
  if (v <= 1) return v;
  if (v <= 100) return v / 100;
  return null;
}

/** True when hist rate (0..1) would display as the same integer % as setupScore. */
export function setupScoreEqualsWinRatePct(
  setupScore: number | null,
  winRate01: number | null
): boolean {
  if (setupScore == null || winRate01 == null) return false;
  if (!Number.isFinite(setupScore) || !Number.isFinite(winRate01)) return false;
  return Math.round(winRate01 * 100) === Math.round(setupScore);
}

export function runCalibrationGate(params: {
  setupScore: number | null | undefined;
  /** rate 0-1 OR percent 0-100 — normalize carefully; if looks like same as setupScore, force null */
  historicalWinRate: number | null | undefined;
  sampleSize: number | null | undefined;
  minSample?: number;
}): CalibrationGateReport {
  const minSample = params.minSample ?? EAGLE1_MIN_STAT_SAMPLE;
  const sampleSize = Math.max(0, Math.floor(Number(params.sampleSize) || 0));
  const setupScore = finiteOrNull(params.setupScore);
  let historicalWinRate = normalizeHistoricalWinRate(params.historicalWinRate);
  const notes: string[] = [];

  if (setupScoreEqualsWinRatePct(setupScore, historicalWinRate)) {
    historicalWinRate = null;
    notes.push('setupScore≠histWinRate: equality stripped');
  }

  let label: CalibrationLabel;
  if (sampleSize <= 0 && historicalWinRate == null) {
    label = 'UNAVAILABLE';
    notes.push('no sample');
  } else if (sampleSize < minSample) {
    label = 'LOW_SAMPLE';
    notes.push(`n=${sampleSize}<${minSample}`);
  } else {
    label = 'WALK_FORWARD';
    notes.push(`n=${sampleSize} walk-forward`);
  }

  const histTxt =
    historicalWinRate == null
      ? 'hist UNAVAILABLE'
      : `hist ${(historicalWinRate * 100).toFixed(0)}%`;
  const setupTxt = setupScore == null ? 'setup —' : `setup ${Math.round(setupScore)}`;

  return {
    label,
    setupScore,
    historicalWinRate,
    sampleSize,
    minSample,
    scoresEqualForbidden: true,
    note: notes.join(' · '),
    summaryKo: `${label} · ${setupTxt} · ${histTxt} · n=${sampleSize}`,
  };
}

export function calibrationGateAcceptance(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];

  const low = runCalibrationGate({
    setupScore: 70,
    historicalWinRate: 0.55,
    sampleSize: 10,
  });
  if (low.label !== 'LOW_SAMPLE') notes.push(`low→${low.label}`);
  if (!low.scoresEqualForbidden) notes.push('scoresEqualForbidden');

  const eq = runCalibrationGate({
    setupScore: 60,
    historicalWinRate: 0.6,
    sampleSize: 50,
  });
  if (eq.historicalWinRate != null) notes.push('eq rate must null');
  if (eq.setupScore !== 60) notes.push('setup must stay');
  if (eq.label !== 'WALK_FORWARD') notes.push(`eq label→${eq.label}`);

  const eqPct = runCalibrationGate({
    setupScore: 60,
    historicalWinRate: 60,
    sampleSize: 50,
  });
  if (eqPct.historicalWinRate != null) notes.push('eq percent must null');

  const wf = runCalibrationGate({
    setupScore: 70,
    historicalWinRate: 0.55,
    sampleSize: 40,
  });
  if (wf.label !== 'WALK_FORWARD') notes.push(`wf→${wf.label}`);
  if (wf.historicalWinRate !== 0.55) notes.push('wf rate');
  if (wf.setupScore === Math.round((wf.historicalWinRate ?? -1) * 100)) {
    notes.push('setup must not equal hist pct on happy path');
  }

  const un = runCalibrationGate({
    setupScore: null,
    historicalWinRate: null,
    sampleSize: 0,
  });
  if (un.label !== 'UNAVAILABLE') notes.push(`un→${un.label}`);

  // Never invent: missing hist stays null even with large sample
  const noHist = runCalibrationGate({
    setupScore: 80,
    historicalWinRate: null,
    sampleSize: 100,
  });
  if (noHist.historicalWinRate != null) notes.push('invented hist');
  if (noHist.label !== 'WALK_FORWARD') notes.push('large sample without hist still WF label');

  return { ok: notes.length === 0, notes };
}
