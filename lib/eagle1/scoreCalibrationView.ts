/**
 * Phase 12 — AI Score ≠ Calibrated Probability 분리 뷰모델.
 * OOD/UNKNOWN → 검증확률 숨김 + WAIT 권고. 가짜 % 금지.
 * PHASE 14: Setup Score ≠ Historical Win Rate — see `calibrationGate.ts`.
 */
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1ConsensusReport } from './consensusEngine';
import { formatSamplePct, EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type ScoreCalibrationReport = {
  aiScore: number | null;
  aiScoreLabelKo: string;
  aiScoreNote: string;
  calibratedProbability: number | null;
  calibratedText: string;
  calibratedLabelKo: '검증확률' | '통계 부족' | '데이터 없음';
  oodFlagged: boolean;
  oodNote: string;
  forceWait: boolean;
  summaryKo: string;
};

export function runScoreCalibrationView(params: {
  plan?: Eagle1MainPlan | null;
  consensus?: Eagle1ConsensusReport | null;
}): ScoreCalibrationReport {
  const plan = params.plan;
  const cons = params.consensus ?? plan?.consensus ?? null;
  const oodFlagged = Boolean(cons?.ood?.flagged);
  const aiScore =
    plan?.aiScore != null && Number.isFinite(plan.aiScore)
      ? plan.aiScore
      : cons?.aiScore != null && Number.isFinite(cons.aiScore)
        ? cons.aiScore
        : null;

  const sample = plan?.sampleSize ?? 0;
  let calibratedProbability: number | null = null;
  let calibratedLabelKo: ScoreCalibrationReport['calibratedLabelKo'] = '데이터 없음';
  if (oodFlagged) {
    calibratedProbability = null;
    calibratedLabelKo = '통계 부족';
  } else if (sample < EAGLE1_MIN_STAT_SAMPLE) {
    calibratedProbability = null;
    calibratedLabelKo = sample > 0 ? '통계 부족' : '데이터 없음';
  } else if (plan?.calibratedProbability != null && Number.isFinite(plan.calibratedProbability)) {
    calibratedProbability = plan.calibratedProbability;
    calibratedLabelKo = '검증확률';
  } else {
    calibratedLabelKo = '통계 부족';
  }

  const forceWait = oodFlagged || plan?.status === 'WAIT';
  const calibratedText = formatSamplePct(sample, calibratedProbability);

  return {
    aiScore,
    aiScoreLabelKo: 'AI 점수',
    aiScoreNote: '합의·휴리스틱 점수 · 검증확률이 아님',
    calibratedProbability,
    calibratedText,
    calibratedLabelKo,
    oodFlagged,
    oodNote: oodFlagged ? cons?.ood?.reasons?.[0] || cons?.note || 'UNKNOWN MARKET' : 'OOD 없음',
    forceWait,
    summaryKo: oodFlagged
      ? `OOD · WAIT 권고 · AI ${aiScore ?? '데이터 없음'} · 검증확률 숨김`
      : `AI ${aiScore ?? '데이터 없음'} · ${calibratedLabelKo} ${calibratedText}`,
  };
}
