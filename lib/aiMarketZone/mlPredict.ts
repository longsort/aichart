/**
 * STEP17 — Layer3 ML (프로젝트 적합형).
 * Deep/XGBoost 의존 없이 Feature kNN Soft-Vote.
 * 표본 부족·거리 멀면 abstain. Score≠확률.
 */
import type { AmzOutcomeKind } from './outcomeEngine';
import type { AmzZoneRole } from './types';
import { AMZ_FEATURE_KEYS, featureDistance, type AmzFeatureVector } from './featureVector';

export type AmzMlCase = {
  role: AmzZoneRole;
  values: number[];
  outcome: AmzOutcomeKind;
};

export type AmzMlPrediction = {
  hold: number | null;
  breakTrue: number | null;
  fakeBreak: number | null;
  sweep: number | null;
  range: number | null;
  flip: number | null;
  neighborCount: number;
  avgDistance: number | null;
  ready: boolean;
  abstainReasonKo: string | null;
  modelKo: string;
};

const OUTCOME_KEYS: AmzOutcomeKind[] = [
  'HOLD',
  'BREAK',
  'FAKE_BREAK',
  'SWEEP_REVERSAL',
  'RANGE',
  'FLIP',
];

const ML_MIN_NEIGHBORS = 12;
const ML_MAX_AVG_DIST = 0.42;

function emptyPred(reason: string, n = 0): AmzMlPrediction {
  return {
    hold: null,
    breakTrue: null,
    fakeBreak: null,
    sweep: null,
    range: null,
    flip: null,
    neighborCount: n,
    avgDistance: null,
    ready: false,
    abstainReasonKo: reason,
    modelKo: 'AMZ-kNN-v1',
  };
}

/**
 * 동일 role 우선, 부족하면 전체 풀에서 kNN.
 */
export function predictAmzMlFromCases(params: {
  features: AmzFeatureVector;
  role: AmzZoneRole;
  cases: AmzMlCase[];
  k?: number;
}): AmzMlPrediction {
  const pool = params.cases;
  if (pool.length < ML_MIN_NEIGHBORS) {
    return emptyPred(`ML 표본 ${pool.length} < ${ML_MIN_NEIGHBORS} · WAIT`, pool.length);
  }

  const q = params.features.values;
  if (q.length !== AMZ_FEATURE_KEYS.length) {
    return emptyPred('Feature 길이 불일치 · WAIT');
  }

  const sameRole = pool.filter((c) => c.role === params.role);
  const search = sameRole.length >= ML_MIN_NEIGHBORS ? sameRole : pool;
  const k = Math.min(Math.max(8, params.k ?? 20), search.length);

  const ranked = search
    .map((c) => ({ c, d: featureDistance(q, c.values) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);

  const avgD = ranked.reduce((s, x) => s + x.d, 0) / ranked.length;
  if (avgD > ML_MAX_AVG_DIST) {
    return {
      ...emptyPred(`유사사례 거리 ${avgD.toFixed(2)} 과다 · WAIT`, ranked.length),
      avgDistance: avgD,
    };
  }

  /** inverse-distance soft vote (INVALID 제외) */
  const w: Record<string, number> = {};
  let wSum = 0;
  for (const { c, d } of ranked) {
    if (c.outcome === 'INVALID' || c.outcome === 'PENDING') continue;
    const ww = 1 / (0.05 + d);
    w[c.outcome] = (w[c.outcome] ?? 0) + ww;
    wSum += ww;
  }
  if (wSum <= 0) return emptyPred('유효 outcome 이웃 없음 · WAIT', ranked.length);

  const rate = (kind: AmzOutcomeKind) => (w[kind] ?? 0) / wSum;

  return {
    hold: rate('HOLD'),
    breakTrue: rate('BREAK'),
    fakeBreak: rate('FAKE_BREAK'),
    sweep: rate('SWEEP_REVERSAL'),
    range: rate('RANGE'),
    flip: rate('FLIP'),
    neighborCount: ranked.length,
    avgDistance: avgD,
    ready: true,
    abstainReasonKo: null,
    modelKo: 'AMZ-kNN-v1',
  };
}

export { OUTCOME_KEYS, ML_MIN_NEIGHBORS };
