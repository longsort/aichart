import type { UnifiedSignalProfile } from '@/lib/unifiedSignalTypes';
import { DEFAULT_UNIFIED_SIGNAL_PROFILE } from '@/lib/unifiedSignalTypes';

/** `HomePageContent` panelFeatures와 동형 */
export type UnifiedPanelFeatures = {
  unifiedGraph: boolean;
  signalBox: boolean;
  executionBriefing: boolean;
  focusOverlay: boolean;
  learningCard: boolean;
  virtualCard: boolean;
};

export const DEFAULT_UNIFIED_PANEL_FEATURES: UnifiedPanelFeatures = {
  unifiedGraph: true,
  signalBox: true,
  executionBriefing: true,
  focusOverlay: true,
  learningCard: true,
  virtualCard: true,
};

export type ChartFeatureHints = {
  showRsiIndicators?: boolean;
  showMacdPanel?: boolean;
  showBbPanel?: boolean;
};

/**
 * 우측 패널 칩·차트 지표 토글을 `buildUnifiedLsSignal` 프로필로 반영.
 * - 실행카드 OFF → execution 채널 0
 * - 자율학습 카드 OFF → learning_ls 0
 * - 가상매매 카드 OFF → virtual_trade 0
 * - RSI 패널/지표 OFF → momentum 채널 약화
 */
export function buildProfileFromPanelFeatures(
  panel: UnifiedPanelFeatures,
  hints?: ChartFeatureHints,
  extra?: Partial<UnifiedSignalProfile>,
): UnifiedSignalProfile {
  const channelWeights: UnifiedSignalProfile['channelWeights'] = {
    execution: panel.executionBriefing ? 1 : 0,
    learning_ls: panel.learningCard ? 1 : 0,
    virtual_trade: panel.virtualCard ? 1 : 0,
  };
  const rsiOn = hints?.showRsiIndicators !== false;
  const macdOn = hints?.showMacdPanel !== false;
  const bbOn = hints?.showBbPanel !== false;
  let mom = 1;
  if (!rsiOn) mom *= 0.45;
  if (!macdOn) mom *= 0.85;
  if (!bbOn) mom *= 0.85;
  if (mom < 1) channelWeights.momentum = mom;

  return {
    ...DEFAULT_UNIFIED_SIGNAL_PROFILE,
    ...extra,
    familyWeights: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.familyWeights, ...extra?.familyWeights },
    featureWeights: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.featureWeights, ...extra?.featureWeights },
    channelWeights: {
      ...DEFAULT_UNIFIED_SIGNAL_PROFILE.channelWeights,
      ...channelWeights,
      ...extra?.channelWeights,
    },
    thresholds: { ...DEFAULT_UNIFIED_SIGNAL_PROFILE.thresholds, ...extra?.thresholds },
  };
}
