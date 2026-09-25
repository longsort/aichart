/**
 * PHASE 14 — Walk-forward backtest. Holdout never updates weights.
 */
import type { SetupOutcome } from './zoneExpectancy';
import { chronologicalSplit, rejectShuffledSplit } from './chronologicalSplit';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type Eagle1WalkFold = {
  fold: number;
  trainN: number;
  testN: number;
  netEv: number | null;
  profitFactor: number | null;
  maxDd: number | null;
  tpBeforeSlRate: number | null;
  usedForWeights: boolean;
};

export type Eagle1WalkForwardReport = {
  folds: Eagle1WalkFold[];
  holdoutN: number;
  holdoutNetEv: number | null;
  holdoutPf: number | null;
  holdoutMaxDd: number | null;
  holdoutCalibration: number | null;
  holdoutUsedForWeights: false;
  sampleSize: number;
  label: '검증확률' | '통계 부족';
  note: string;
};

const MIN = EAGLE1_MIN_STAT_SAMPLE;

function metrics(rows: SetupOutcome[]): { netEv: number | null; pf: number | null; maxDd: number | null; tp: number | null } {
  const n = rows.length;
  if (n < MIN) return { netEv: null, pf: null, maxDd: null, tp: null };
  const nets = rows.map((r) => r.netR);
  const netEv = nets.reduce((a, b) => a + b, 0) / n;
  const wins = nets.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const losses = Math.abs(nets.filter((x) => x < 0).reduce((a, b) => a + b, 0));
  const pf = losses > 0 ? wins / losses : wins > 0 ? null : null;
  let eq = 0;
  let peak = 0;
  let maxDd = 0;
  for (const x of nets) {
    eq += x;
    if (eq > peak) peak = eq;
    maxDd = Math.max(maxDd, peak - eq);
  }
  const tp = rows.filter((r) => r.tpFirst).length / n;
  return { netEv, pf, maxDd, tp };
}

export function walkForwardBacktest(rows: SetupOutcome[]): Eagle1WalkForwardReport {
  const ordered = [...rows].sort((a, b) => a.index - b.index);
  const empty: Eagle1WalkForwardReport = {
    folds: [],
    holdoutN: 0,
    holdoutNetEv: null,
    holdoutPf: null,
    holdoutMaxDd: null,
    holdoutCalibration: null,
    holdoutUsedForWeights: false,
    sampleSize: ordered.length,
    label: '통계 부족',
    note: ordered.length ? '통계 부족' : '데이터 없음',
  };
  if (ordered.length < MIN) return empty;

  const split = chronologicalSplit(ordered.length);
  const bad = rejectShuffledSplit(split);
  if (bad) return { ...empty, note: '통계 부족' };

  const trainVal = [...split.train, ...split.validation].map((i) => ordered[i]!).filter(Boolean);
  const hold = split.holdout.map((i) => ordered[i]!).filter(Boolean);
  const folds: Eagle1WalkFold[] = [];
  const step = Math.max(MIN, Math.floor(trainVal.length / 3));
  let fold = 0;
  for (let end = MIN; end <= trainVal.length; end += step) {
    const train = trainVal.slice(0, Math.max(MIN, end - Math.floor(step / 2)));
    const test = trainVal.slice(train.length, end);
    if (test.length < 8) continue;
    const m = metrics(test);
    folds.push({
      fold: fold++,
      trainN: train.length,
      testN: test.length,
      netEv: m.netEv,
      profitFactor: m.pf,
      maxDd: m.maxDd,
      tpBeforeSlRate: m.tp,
      usedForWeights: true,
    });
  }

  const holdM = metrics(hold);
  const trainM = metrics(trainVal);
  const calib =
    trainM.tp != null && holdM.tp != null ? Math.abs(trainM.tp - holdM.tp) : null;
  const ok = hold.length >= 10 && holdM.netEv != null;
  return {
    folds,
    holdoutN: hold.length,
    holdoutNetEv: holdM.netEv,
    holdoutPf: holdM.pf,
    holdoutMaxDd: holdM.maxDd,
    holdoutCalibration: calib,
    holdoutUsedForWeights: false,
    sampleSize: ordered.length,
    label: ok ? '검증확률' : '통계 부족',
    note: ok
      ? `홀드아웃 ${hold.length} · 가중 미사용 · EV ${holdM.netEv!.toFixed(2)}R`
      : '통계 부족',
  };
}

export function walkForwardShellKo(report: Eagle1WalkForwardReport | null | undefined): string {
  if (!report) return '데이터 없음';
  return report.note;
}
