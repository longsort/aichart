/**
 * PHASE 10/11 — Internal ML. No external LLM. Chronological fit only.
 * Raw longScore is never a probability. n<30 → 통계 부족.
 */
import type { SetupFamily, SetupOutcome } from './zoneExpectancy';
import { chronologicalSplit, rejectShuffledSplit } from './chronologicalSplit';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { Eagle1Regime } from './structureEngine';

export type Eagle1MlTask =
  | 'direction'
  | 'zone_hold'
  | 'zone_break'
  | 'breakout'
  | 'reaction_magnitude';

export type Eagle1MlQuery = {
  regime: Eagle1Regime | string;
  family: SetupFamily;
  direction: 'LONG' | 'SHORT';
  grossRr: number | null;
  asOfIndex?: number;
};

export type Eagle1MlTaskResult = {
  task: Eagle1MlTask;
  sampleSize: number;
  trainN: number;
  holdoutN: number;
  probability: number | null;
  calibratedProbability: number | null;
  expectedMoveR: number | null;
  calibrationError: number | null;
  label: '검증확률' | '통계 부족';
  note: string;
};

export type Eagle1MlReport = {
  available: boolean;
  backend: 'logistic-ts';
  tasks: Eagle1MlTaskResult[];
  directionProbability: number | null;
  calibratedProbability: number | null;
  calibratedLabel: '검증확률' | '통계 부족';
  expectedMoveR: number | null;
  note: string;
};

const MIN = EAGLE1_MIN_STAT_SAMPLE;
const HOLD_MIN = 10;
const CALIB_MAX = 0.2;

function causal(rows: SetupOutcome[], asOfIndex?: number): SetupOutcome[] {
  const ordered = [...rows].sort((a, b) => a.index - b.index);
  if (asOfIndex == null || !Number.isFinite(asOfIndex)) return ordered;
  return ordered.filter((r) => r.index < asOfIndex);
}

function encode(row: { regime: string; family: string; direction: string; grossRr: number | null }): number[] {
  const rr = row.grossRr != null && Number.isFinite(row.grossRr) ? Math.min(4, Math.max(0, row.grossRr)) / 4 : 0.5;
  return [
    row.direction === 'LONG' ? 1 : 0,
    String(row.regime).includes('BULL') ? 1 : 0,
    String(row.regime).includes('BEAR') ? 1 : 0,
    row.family === 'ob_retest' ? 1 : 0,
    row.family === 'fvg_retest' ? 1 : 0,
    row.family.startsWith('poc') ? 1 : 0,
    row.family === 'sweep_reversal' ? 1 : 0,
    rr,
  ];
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

function fitLogistic(X: number[][], y: number[]): { w: number[]; b: number } {
  const d = X[0]?.length ?? 0;
  const w = Array(d).fill(0);
  let b = 0;
  const lr = 0.25;
  const steps = 64;
  const n = X.length || 1;
  for (let s = 0; s < steps; s++) {
    const gw = Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const xi = X[i]!;
      let z = b;
      for (let j = 0; j < d; j++) z += w[j]! * xi[j]!;
      const e = sigmoid(z) - y[i]!;
      for (let j = 0; j < d; j++) gw[j] += e * xi[j]!;
      gb += e;
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * gw[j]!) / n;
    b -= (lr * gb) / n;
  }
  return { w, b };
}

function predictOne(model: { w: number[]; b: number }, x: number[]): number {
  let z = model.b;
  for (let j = 0; j < model.w.length; j++) z += model.w[j]! * (x[j] ?? 0);
  return sigmoid(z);
}

function emptyTask(task: Eagle1MlTask, n: number, note: string): Eagle1MlTaskResult {
  return {
    task,
    sampleSize: n,
    trainN: 0,
    holdoutN: 0,
    probability: null,
    calibratedProbability: null,
    expectedMoveR: null,
    calibrationError: null,
    label: '통계 부족',
    note,
  };
}

function emptyReport(note: string): Eagle1MlReport {
  return {
    available: false,
    backend: 'logistic-ts',
    tasks: [],
    directionProbability: null,
    calibratedProbability: null,
    calibratedLabel: '통계 부족',
    expectedMoveR: null,
    note,
  };
}

function runBinaryTask(
  task: Eagle1MlTask,
  rows: SetupOutcome[],
  yOf: (r: SetupOutcome) => number,
  query: Eagle1MlQuery
): Eagle1MlTaskResult {
  if (rows.length < MIN) return emptyTask(task, rows.length, '통계 부족');
  const split = chronologicalSplit(rows.length);
  const shuffleErr = rejectShuffledSplit(split);
  if (shuffleErr) return emptyTask(task, rows.length, '통계 부족');
  const train = split.train.map((i) => rows[i]!).filter(Boolean);
  const hold = split.holdout.map((i) => rows[i]!).filter(Boolean);
  if (train.length < MIN) return emptyTask(task, rows.length, '통계 부족');
  const X = train.map((r) => encode(r));
  const y = train.map(yOf);
  const model = fitLogistic(X, y);
  const qx = encode({
    regime: query.regime,
    family: query.family,
    direction: query.direction,
    grossRr: query.grossRr,
  });
  const raw = predictOne(model, qx);
  let calibrated: number | null = null;
  let err: number | null = null;
  if (hold.length >= HOLD_MIN) {
    const pHold = hold.map(yOf).reduce((a, b) => a + b, 0) / hold.length;
    const pTrain = y.reduce((a, b) => a + b, 0) / y.length;
    err = Math.abs(pTrain - pHold);
    calibrated = err <= CALIB_MAX ? pHold : null;
  }
  const mag = train.map((r) => r.mfe).sort((a, b) => a - b);
  const mid = mag[Math.floor(mag.length / 2)] ?? null;
  return {
    task,
    sampleSize: rows.length,
    trainN: train.length,
    holdoutN: hold.length,
    probability: raw,
    calibratedProbability: calibrated,
    expectedMoveR: task === 'reaction_magnitude' ? mid : null,
    calibrationError: err,
    label: calibrated != null ? '검증확률' : '통계 부족',
    note: calibrated != null ? `홀드아웃 ${hold.length}` : '통계 부족',
  };
}

export function runInternalMl(rows: SetupOutcome[], query: Eagle1MlQuery): Eagle1MlReport {
  const pool = causal(rows, query.asOfIndex);
  if (pool.length < MIN) return emptyReport(pool.length ? '통계 부족' : '데이터 없음');

  const holdFam = new Set(['poc_hold', 'poc_reclaim', 'ob_retest', 'fvg_retest']);
  const direction = runBinaryTask('direction', pool, (r) => (r.tpFirst ? 1 : 0), query);
  const zoneHold = runBinaryTask(
    'zone_hold',
    pool.filter((r) => holdFam.has(r.family)),
    (r) => (r.tpFirst ? 1 : 0),
    query
  );
  const zoneBreak = runBinaryTask('zone_break', pool, (r) => (r.slFirst ? 1 : 0), query);
  const breakout = runBinaryTask('breakout', pool, (r) => (r.mfe >= 1.5 ? 1 : 0), query);
  const magnitude = runBinaryTask('reaction_magnitude', pool, (r) => (r.mfe >= 1 ? 1 : 0), query);

  const calibrated = direction.calibratedProbability;
  return {
    available: true,
    backend: 'logistic-ts',
    tasks: [direction, zoneHold, zoneBreak, breakout, magnitude],
    directionProbability: direction.probability,
    calibratedProbability: calibrated,
    calibratedLabel: calibrated != null ? '검증확률' : '통계 부족',
    expectedMoveR: magnitude.expectedMoveR,
    note: calibrated != null ? '내부 로지스틱 · 홀드아웃 보정' : '내부 로지스틱 · 통계 부족',
  };
}

export function mlShellKo(report: Eagle1MlReport | null | undefined): string {
  if (!report) return '데이터 없음';
  if (!report.available || report.calibratedLabel === '통계 부족') {
    return report.note || '통계 부족';
  }
  return report.note;
}
