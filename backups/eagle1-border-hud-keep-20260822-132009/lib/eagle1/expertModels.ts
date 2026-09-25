/**
 * Independent expert votes. Confidence is a heuristic score, never UI 검증확률.
 */
import type { StructureSnapshot } from './structureEngine';
import type { ZoneEngineResult } from './zoneEngine';
import type { Eagle1RiskPlan } from './riskEngine';
import type { SimilarityReport } from './historicalSimilarity';
import type { Eagle1MlReport } from './internalMl';
import type { Eagle1MoneyPressure } from './moneyPressureBand';
import { moneyFlowSide } from './moneyPressureBand';

export type ExpertVoteKind = 'LONG' | 'SHORT' | 'NEUTRAL';

export type ExpertName =
  | 'Structure'
  | 'POC'
  | 'BigMoney'
  | 'Microstructure'
  | 'Derivatives'
  | 'Zone'
  | 'Historical'
  | 'ML'
  | 'Risk';

export type ExpertVote = {
  name: ExpertName;
  vote: ExpertVoteKind;
  /** 0-1 heuristic. Not a historical probability. */
  score: number;
  note: string;
};

export function voteExperts(params: {
  structure: StructureSnapshot;
  zones: ZoneEngineResult;
  risk: Eagle1RiskPlan;
  moneyPressure?: Eagle1MoneyPressure | null;
  similarity?: SimilarityReport | null;
  ml?: Eagle1MlReport | null;
  hasDerivatives?: boolean;
}): ExpertVote[] {
  const lastShift = [...params.structure.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
  const structureVote: ExpertVoteKind =
    lastShift?.bias === 'bullish' ? 'LONG' : lastShift?.bias === 'bearish' ? 'SHORT' : 'NEUTRAL';
  const poc = params.zones.profile.pocState;
  const pocVote: ExpertVoteKind =
    poc === 'RECLAIMED' || poc === 'CLOSED_ABOVE' ? 'LONG' : poc === 'LOST' || poc === 'CLOSED_BELOW' ? 'SHORT' : 'NEUTRAL';
  const flow = moneyFlowSide(params.moneyPressure?.state);
  const moneyVote: ExpertVoteKind = flow === 'long' ? 'LONG' : flow === 'short' ? 'SHORT' : 'NEUTRAL';
  const microVote: ExpertVoteKind =
    params.moneyPressure?.absorbed && moneyVote !== 'NEUTRAL' ? moneyVote : moneyVote;
  const derivVote: ExpertVoteKind = 'NEUTRAL';
  const rec = params.zones.recommended;
  const rx = params.zones.reaction;
  let zoneVote: ExpertVoteKind = rec?.bias === 'bullish' ? 'LONG' : rec?.bias === 'bearish' ? 'SHORT' : 'NEUTRAL';
  if (rx?.kind === 'HOLD' || rx?.kind === 'RECLAIM' || rx?.kind === 'RETEST') {
    zoneVote = rx.bias === 'bearish' ? 'SHORT' : 'LONG';
  }
  const sim = params.similarity;
  const histVote: ExpertVoteKind =
    sim && sim.sampleSize >= 30 && sim.calibratedProbability != null && sim.calibratedProbability >= 0.5
      ? params.risk.direction ?? 'NEUTRAL'
      : 'NEUTRAL';
  const mlVote: ExpertVoteKind =
    params.ml?.calibratedProbability != null
      ? params.ml.calibratedProbability >= 0.5
        ? params.risk.direction ?? 'NEUTRAL'
        : 'NEUTRAL'
      : 'NEUTRAL';
  const riskVote: ExpertVoteKind =
    params.risk.rrGate === 'reject' || params.risk.rrGate === 'none' ? 'NEUTRAL' : params.risk.direction ?? 'NEUTRAL';

  return [
    { name: 'Structure', vote: structureVote, score: structureVote === 'NEUTRAL' ? 0.3 : 0.7, note: lastShift ? `${lastShift.kind}` : '데이터 없음' },
    { name: 'POC', vote: pocVote, score: pocVote === 'NEUTRAL' ? 0.3 : 0.65, note: poc },
    { name: 'BigMoney', vote: moneyVote, score: moneyVote === 'NEUTRAL' ? 0.25 : 0.6, note: params.moneyPressure?.stateKo || '데이터 없음' },
    {
      name: 'Microstructure',
      vote: microVote,
      score: params.moneyPressure?.absorbed ? 0.7 : 0.4,
      note: params.moneyPressure?.note || '데이터 없음',
    },
    {
      name: 'Derivatives',
      vote: derivVote,
      score: 0,
      note: params.hasDerivatives ? '파생 입력' : '데이터 없음',
    },
    { name: 'Zone', vote: zoneVote, score: zoneVote === 'NEUTRAL' ? 0.3 : 0.65, note: rec?.labelKo || rx?.kind || '데이터 없음' },
    {
      name: 'Historical',
      vote: histVote,
      score: sim && sim.sampleSize >= 30 ? 0.8 : 0.2,
      note: sim?.calibratedLabel || '통계 부족',
    },
    { name: 'ML', vote: mlVote, score: params.ml?.calibratedProbability != null ? 0.7 : 0.15, note: params.ml?.note || '통계 부족' },
    { name: 'Risk', vote: riskVote, score: params.risk.rrGate === 'prioritize' ? 0.8 : params.risk.rrGate === 'confirm_candidate' ? 0.6 : 0.2, note: params.risk.rrGate },
  ];
}
