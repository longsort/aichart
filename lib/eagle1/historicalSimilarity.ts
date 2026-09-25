/**
 * Match current snapshot to past outcomes — regime first.
 * Never use raw AI score as probability. No future outcomes at T.
 */
import type { SetupFamily, SetupOutcome } from './zoneExpectancy';
import type { Eagle1Regime, StructureState } from './structureEngine';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type SimilarityQuery = {
  regime: Eagle1Regime;
  state: StructureState;
  family: SetupFamily;
  direction: 'LONG' | 'SHORT';
  /** Only outcomes with index < asOfIndex. Omit = all (tests). */
  asOfIndex?: number;
};

export type SimilarityReport = {
  sampleSize: number;
  calibratedProbability: number | null;
  calibratedLabel: '검증확률' | '통계 부족';
  tpBeforeSlRate: number | null;
  slFirstRate: number | null;
  medianMfe: number | null;
  medianMae: number | null;
  netExpectancy: number | null;
  expectedMoveR: number | null;
  calibrationError: number | null;
  filter: string;
};

const MIN = EAGLE1_MIN_STAT_SAMPLE;
const HOLD_MIN = 10;
const CALIB_MAX = 0.2;

function med(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function causalPool(rows: SetupOutcome[], asOfIndex?: number): SetupOutcome[] {
  const ordered = [...rows].sort((a, b) => a.index - b.index || a.netR - b.netR);
  if (asOfIndex == null || !Number.isFinite(asOfIndex)) return ordered;
  return ordered.filter((r) => r.index < asOfIndex);
}

function empty(filter: string, n = 0): SimilarityReport {
  return {
    sampleSize: n,
    calibratedProbability: null,
    calibratedLabel: '통계 부족',
    tpBeforeSlRate: null,
    slFirstRate: null,
    medianMfe: null,
    medianMae: null,
    netExpectancy: null,
    expectedMoveR: null,
    calibrationError: null,
    filter,
  };
}

function pickPool(rows: SetupOutcome[], q: SimilarityQuery): { pool: SetupOutcome[]; filter: string } {
  const regimeFamily = rows.filter(
    (r) => r.regime === q.regime && r.direction === q.direction && r.family === q.family
  );
  if (regimeFamily.length >= MIN) {
    return { pool: regimeFamily, filter: `레짐 ${q.regime} + ${q.family} + ${q.direction}` };
  }
  const regimeDir = rows.filter((r) => r.regime === q.regime && r.direction === q.direction);
  if (regimeDir.length >= MIN) {
    return { pool: regimeDir, filter: `레짐 ${q.regime} + ${q.direction}` };
  }
  const familyDir = rows.filter((r) => r.direction === q.direction && r.family === q.family);
  if (familyDir.length >= MIN) {
    return { pool: familyDir, filter: `${q.family} + ${q.direction}` };
  }
  const dirOnly = rows.filter((r) => r.direction === q.direction);
  return { pool: dirOnly, filter: `방향 ${q.direction} (레짐 완화)` };
}

/** Earlier bars = train, later bars = holdout. No shuffle, no validation mix. */
function oosCalibration(pool: SetupOutcome[]): { pHold: number | null; err: number | null } {
  const n = pool.length;
  const cut = Math.floor(n * 0.7);
  const train = pool.slice(0, cut);
  const hold = pool.slice(cut);
  if (hold.length < HOLD_MIN) return { pHold: null, err: null };
  const pHold = hold.filter((r) => r.tpFirst).length / hold.length;
  if (train.length < 20) return { pHold, err: null };
  const pTrain = train.filter((r) => r.tpFirst).length / train.length;
  return { pHold, err: Math.abs(pTrain - pHold) };
}

export function matchSimilarOutcomes(rows: SetupOutcome[], q: SimilarityQuery): SimilarityReport {
  const causal = causalPool(rows, q.asOfIndex);
  if (!causal.length) return empty('데이터 없음');

  const { pool, filter } = pickPool(causal, q);
  if (pool.length < MIN) return empty(filter, pool.length);

  const tp = pool.filter((r) => r.tpFirst).length;
  const sl = pool.filter((r) => r.slFirst).length;
  const inSample = tp / pool.length;
  const { pHold, err } = oosCalibration(pool);
  const oosOk = pHold != null && (err == null || err <= CALIB_MAX);
  const calibratedProbability = oosOk ? pHold : null;

  return {
    sampleSize: pool.length,
    calibratedProbability,
    calibratedLabel: calibratedProbability != null ? '검증확률' : '통계 부족',
    tpBeforeSlRate: inSample,
    slFirstRate: sl / pool.length,
    medianMfe: med(pool.map((r) => r.mfe)),
    medianMae: med(pool.map((r) => r.mae)),
    netExpectancy: pool.reduce((a, r) => a + r.netR, 0) / pool.length,
    expectedMoveR: med(pool.map((r) => r.mfe)),
    calibrationError: err,
    filter,
  };
}

export function similarityShellKo(report: SimilarityReport | null | undefined): string {
  if (!report) return '데이터 없음';
  if (report.sampleSize <= 0) return '데이터 없음';
  if (report.sampleSize < MIN || report.calibratedLabel === '통계 부족') {
    return `표본 ${report.sampleSize} · 통계 부족`;
  }
  return `표본 ${report.sampleSize} · ${report.filter}`;
}
