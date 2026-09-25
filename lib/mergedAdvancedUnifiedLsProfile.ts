import type { UnifiedSignalProfile } from '@/lib/unifiedSignalTypes';

/**
 * 통합 고급 전용: 구조·존·유동성·종가·패턴 가중을 올려 다채널 합성 롱/숏 지표가
 * 일반 패널 프로필보다 공격적으로 벌어지도록(참고용, 확정·승률 아님).
 */
export const MERGED_ADVANCED_UNIFIED_LS_PROFILE: Partial<UnifiedSignalProfile> = {
  familyWeights: {
    structure: 1.32,
    zone: 1.28,
    liquidity: 1.22,
    pattern: 1.18,
    momentum: 1.12,
    close: 1.18,
    micro: 1.05,
    execution: 1.08,
  },
  featureWeights: {
    omni_chart_fusion: 1.42,
    structure_scores: 1.15,
    zone_signal: 1.12,
    zone_nearest: 1.08,
  },
  channelWeights: {
    core_structure: 1.3,
    zone: 1.25,
    liquidity: 1.2,
    momentum: 1.1,
    close: 1.12,
    briefing: 1.08,
    misc: 1.06,
  },
  thresholds: {
    leanEdge: 9,
    watchEdge: 4,
    confirmEdge: 17,
    confirmSideMin: 54,
    conflictSideMin: 51,
    conflictMaxEdge: 11,
  },
};
