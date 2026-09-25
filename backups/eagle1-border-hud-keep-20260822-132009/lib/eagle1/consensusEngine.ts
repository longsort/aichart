/**
 * PHASE 11 — Consensus + calibration + OOD.
 * UI 검증확률 ≠ AI score. Holdout never trains weights.
 */
import type { SetupOutcome } from './zoneExpectancy';
import { chronologicalSplit, rejectShuffledSplit } from './chronologicalSplit';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { ExpertVote } from './expertModels';
import type { SimilarityReport } from './historicalSimilarity';
import type { Eagle1MlReport } from './internalMl';
import type { Eagle1Regime } from './structureEngine';

export type Eagle1Ood = {
  flagged: boolean;
  label: 'UNKNOWN MARKET' | 'ok';
  reasons: string[];
};

export type Eagle1ConsensusReport = {
  longScore: number;
  shortScore: number;
  agreementScore: number;
  /** Heuristic 0-100. Never shown as 검증확률. */
  aiScore: number;
  calibratedProbability: number | null;
  calibratedLabel: '검증확률' | '통계 부족';
  sampleSize: number;
  votes: ExpertVote[];
  ood: Eagle1Ood;
  weightsNote: string;
  note: string;
};

const MIN = EAGLE1_MIN_STAT_SAMPLE;

function expertWeight(v: ExpertVote, trainN: number): number {
  if (v.name === 'Derivatives' && v.note === '데이터 없음') return 0;
  if (v.name === 'Historical' || v.name === 'ML') {
    return trainN >= MIN && v.vote !== 'NEUTRAL' ? 1.4 : 0.6;
  }
  if (v.vote === 'NEUTRAL') return 0.4;
  return 1;
}

export function detectOod(params: {
  regime: Eagle1Regime;
  sampleSize: number;
  similarity?: SimilarityReport | null;
  spreadBps?: number | null;
  agreementScore: number;
  qualityBlocked?: boolean;
}): Eagle1Ood {
  const reasons: string[] = [];
  if (params.regime === 'UNKNOWN' || params.regime === 'VOLATILITY_EXPANSION') reasons.push('레짐 불명/급변동');
  if (params.sampleSize < MIN) reasons.push('표본 부족');
  if (params.similarity && params.similarity.sampleSize > 0 && params.similarity.sampleSize < MIN) {
    reasons.push('유사국면 표본 부족');
  }
  if (params.similarity?.filter.includes('완화') && (params.similarity.sampleSize < 40 || params.similarity.calibratedProbability == null)) {
    reasons.push('유사도 낮음');
  }
  if (params.spreadBps != null && params.spreadBps > 12) reasons.push('스프레드 이상');
  if (params.agreementScore < 12) reasons.push('모델 합의 부족');
  if (params.qualityBlocked) reasons.push('데이터 품질');
  return {
    flagged: reasons.length > 0,
    label: reasons.length > 0 ? 'UNKNOWN MARKET' : 'ok',
    reasons,
  };
}

export function runConsensus(params: {
  votes: ExpertVote[];
  outcomes?: SetupOutcome[];
  asOfIndex?: number;
  similarity?: SimilarityReport | null;
  ml?: Eagle1MlReport | null;
  regime: Eagle1Regime;
  spreadBps?: number | null;
  qualityBlocked?: boolean;
}): Eagle1ConsensusReport {
  const ordered = [...(params.outcomes ?? [])].sort((a, b) => a.index - b.index);
  const causal =
    params.asOfIndex != null && Number.isFinite(params.asOfIndex)
      ? ordered.filter((r) => r.index < params.asOfIndex!)
      : ordered;
  const split = chronologicalSplit(causal.length);
  const shuffleErr = causal.length ? rejectShuffledSplit(split) : null;
  const trainN = shuffleErr ? 0 : split.train.length;

  let longW = 0;
  let shortW = 0;
  for (const v of params.votes) {
    const w = expertWeight(v, trainN) * v.score;
    if (v.vote === 'LONG') longW += w;
    else if (v.vote === 'SHORT') shortW += w;
  }
  const tot = longW + shortW;
  const longScore = tot > 0 ? (100 * longW) / tot : 50;
  const shortScore = tot > 0 ? (100 * shortW) / tot : 50;
  const agreementScore = Math.abs(longScore - shortScore);
  const aiScore = Math.max(longScore, shortScore);

  const simP = params.similarity?.calibratedProbability ?? null;
  const simN = params.similarity?.sampleSize ?? 0;
  const mlP = params.ml?.calibratedProbability ?? null;
  const calibratedProbability =
    simP != null && simN >= MIN ? simP : mlP != null && (params.ml?.tasks[0]?.holdoutN ?? 0) >= 10 ? mlP : null;
  const sampleSize = Math.max(simN, causal.length);

  const ood = detectOod({
    regime: params.regime,
    sampleSize,
    similarity: params.similarity,
    spreadBps: params.spreadBps,
    agreementScore,
    qualityBlocked: params.qualityBlocked,
  });

  return {
    longScore,
    shortScore,
    agreementScore,
    aiScore,
    calibratedProbability: ood.flagged ? null : calibratedProbability,
    calibratedLabel: !ood.flagged && calibratedProbability != null ? '검증확률' : '통계 부족',
    sampleSize,
    votes: params.votes,
    ood,
    weightsNote: trainN >= MIN ? `학습표본 ${trainN} · 홀드아웃 가중 미사용` : '동일가중 · 통계 부족',
    note: ood.flagged
      ? `UNKNOWN MARKET · ${ood.reasons[0]}`
      : calibratedProbability != null
        ? `합의 ${agreementScore.toFixed(0)} · 검증확률 사용`
        : `합의 ${agreementScore.toFixed(0)} · 통계 부족`,
  };
}

export function consensusShellKo(report: Eagle1ConsensusReport | null | undefined): string {
  if (!report) return '데이터 없음';
  if (report.ood.flagged) return report.note;
  return report.note;
}
