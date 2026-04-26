/**
 * SMC 엔트리 플레이북 — 공개 API.
 * 단계 정의: `playbook.steps.json` (schemaVersion, short/long 라벨·순서).
 * TP1~3: `tieredTargetsLong/Short` — 분석 targets·지지/저항 정렬. API `ls-plan-*`(computeTradePlan)와 별개.
 */
export type {
  EngineSlice,
  PlaybookStepDef,
  PlaybookStepsFile,
  SmcEntryPlaybook,
  SmcPlaybookStep,
  SmcPlaybookStepId,
} from '@/lib/smcPlaybook/types';

export { FIB_HI, FIB_LO } from '@/lib/smcPlaybook/constants';
export { PLAYBOOK_STEPS, idleStepsPlaceholder, mergeStepsWithCompletion } from '@/lib/smcPlaybook/steps';
export { computeSmcEntryPlaybook } from '@/lib/smcPlaybook/evaluate';
export { buildSmcEntryPlaybookOverlays } from '@/lib/smcPlaybook/overlays';
