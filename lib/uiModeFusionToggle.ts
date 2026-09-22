import type { UIMode } from '@/lib/settings';

/** 켜 두면 레일·저장 복원에서 융합 모드를 노출하지 않고 대체 모드로 되돌립니다. */
export const FUSION_MODE_UI_HIDDEN = true;

const FUSION_FALLBACK_UI_MODE: UIMode = 'AI_ZONE';

export function normalizeUiModeIfFusionHidden(mode: UIMode): UIMode {
  if (!FUSION_MODE_UI_HIDDEN) return mode;
  return mode === 'FUSION_MODE' ? FUSION_FALLBACK_UI_MODE : mode;
}
