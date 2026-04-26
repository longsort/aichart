import playbookRaw from '@/lib/smcPlaybook/playbook.steps.json';
import type { PlaybookStepsFile, SmcPlaybookStep, SmcPlaybookStepId } from '@/lib/smcPlaybook/types';

export const PLAYBOOK_STEPS: PlaybookStepsFile = playbookRaw as PlaybookStepsFile;

/**
 * JSON 단계 정의 + 엔진에서 계산한 완료 맵 → UI용 스텝 배열.
 * 라벨·순서만 바꿀 때는 `playbook.steps.json` 만 수정.
 */
export function mergeStepsWithCompletion(
  branch: 'short' | 'long',
  completion: Partial<Record<SmcPlaybookStepId, boolean>>
): SmcPlaybookStep[] {
  const defs = PLAYBOOK_STEPS[branch];
  return defs.map((d) => ({
    order: d.order,
    id: d.id as SmcPlaybookStepId,
    labelKo: d.labelKo,
    done: completion[d.id as SmcPlaybookStepId] === true,
  }));
}

export function idleStepsPlaceholder(): SmcPlaybookStep[] {
  return mergeStepsWithCompletion('short', {});
}
