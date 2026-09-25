/**
 * PHASE 16 — Statistics dashboard. Measured rows only. UI never invents %.
 */
import { EAGLE1_ENGINE_VERSION } from './rawTypes';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import type { SimilarityReport } from './historicalSimilarity';
import type { Eagle1MlReport } from './internalMl';
import type { Eagle1ConsensusReport } from './consensusEngine';
import type { Eagle1WalkForwardReport } from './walkForwardBacktest';
import type { Eagle1SnapshotStats } from './predictionSnapshot';
import type { ExpertVote } from './expertModels';

export type Eagle1StatRow = {
  key: string;
  labelKo: string;
  value: string;
};

export type Eagle1StatsDashboard = {
  rows: Eagle1StatRow[];
  models: Array<{ name: string; vote: string; note: string }>;
  engineVersion: string;
  sampleSize: number;
  label: '검증확률' | '통계 부족';
};

function pctOrShort(p: number | null | undefined, n: number): string {
  if (n < EAGLE1_MIN_STAT_SAMPLE || p == null || !Number.isFinite(p)) return '통계 부족';
  return `${Math.round(p * 100)}%`;
}

export function buildStatsDashboard(params: {
  similarity?: SimilarityReport | null;
  ml?: Eagle1MlReport | null;
  consensus?: Eagle1ConsensusReport | null;
  walkForward?: Eagle1WalkForwardReport | null;
  snapshotStats?: Eagle1SnapshotStats | null;
  votes?: ExpertVote[];
}): Eagle1StatsDashboard {
  const n = Math.max(
    params.similarity?.sampleSize ?? 0,
    params.walkForward?.sampleSize ?? 0,
    params.snapshotStats?.sampleSize ?? 0
  );
  const rows: Eagle1StatRow[] = [
    { key: 'sample', labelKo: '표본', value: n > 0 ? `표본 ${n}` : '데이터 없음' },
    {
      key: 'calibrated',
      labelKo: '검증확률',
      value: pctOrShort(params.consensus?.calibratedProbability ?? params.similarity?.calibratedProbability, n),
    },
    {
      key: 'ai',
      labelKo: 'AI점수',
      value: params.consensus ? `${params.consensus.aiScore.toFixed(0)} (확률 아님)` : '데이터 없음',
    },
    {
      key: 'tp',
      labelKo: 'TP선도달',
      value: pctOrShort(params.similarity?.tpBeforeSlRate ?? params.snapshotStats?.tpBeforeSlRate, n),
    },
    {
      key: 'ev',
      labelKo: '순기대',
      value:
        n >= EAGLE1_MIN_STAT_SAMPLE && params.similarity?.netExpectancy != null
          ? `${params.similarity.netExpectancy >= 0 ? '+' : ''}${params.similarity.netExpectancy.toFixed(2)}R`
          : '통계 부족',
    },
    {
      key: 'mfe',
      labelKo: 'MFE중앙',
      value:
        n >= EAGLE1_MIN_STAT_SAMPLE && params.similarity?.medianMfe != null
          ? `${params.similarity.medianMfe.toFixed(2)}R`
          : '통계 부족',
    },
    {
      key: 'wf',
      labelKo: '워크포워드',
      value: params.walkForward?.note || '데이터 없음',
    },
    {
      key: 'ml',
      labelKo: '내부ML',
      value: params.ml?.note || '데이터 없음',
    },
    {
      key: 'ood',
      labelKo: 'OOD',
      value: params.consensus?.ood.flagged ? params.consensus.note : '정상',
    },
    { key: 'ver', labelKo: '엔진', value: EAGLE1_ENGINE_VERSION },
  ];
  return {
    rows,
    models: (params.votes ?? params.consensus?.votes ?? []).map((v) => ({
      name: v.name,
      vote: v.vote,
      note: v.note,
    })),
    engineVersion: EAGLE1_ENGINE_VERSION,
    sampleSize: n,
    label: n >= EAGLE1_MIN_STAT_SAMPLE && (params.consensus?.calibratedProbability != null || params.similarity?.calibratedProbability != null)
      ? '검증확률'
      : '통계 부족',
  };
}
