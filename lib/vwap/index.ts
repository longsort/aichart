/**
 * VWAP 공유 레이어 — 기존 Anchored VWAP API 유지 + 세션 VWAP·컨텍스트·작도 게이트.
 * 삭제/치환 없음. 확정 수익 문구 없음.
 *
 * 주의: Turbopack에서 `export *` + 후속 named export 조합 시
 * 클라이언트 번들에서 함수가 undefined가 될 수 있음.
 * 신규 모듈(피보·통계AI)은 소비측 **직접 경로** 권장:
 * - `@/lib/vwap/avwapFibConfluence`
 * - `@/lib/vwap/avwapStatsConfluenceHub`
 */
export * from '@/lib/mergedDeskAnchoredVwap';

export {
  computeSessionVwapSeries,
  type SessionVwapPoint,
} from './sessionVwap';

export {
  buildVwapMarketContext,
  type VwapMarketContext,
  type VwapLevelHint,
} from './context';

export {
  buildAvwapLineSignalPack,
  type AvwapLineSignalPack,
  type AvwapLineSignalMarker,
  type AvwapLineSignalBias,
} from './avwapLineSignal';

export {
  buildAvwapEntryCandidatePack,
  type AvwapEntryCandidatePack,
} from './avwapEntryCandidate';

export {
  buildAvwapEntryGuidePack,
  type AvwapEntryGuidePack,
} from './avwapEntryGuide';

export {
  shouldPaintAvwapOnChart,
  shouldLoadAvwapSupportingCandles,
  vwapMasterEnabled,
  vwapSessionEnabled,
  vwapAutoExtremeEnabled,
  vwapPlaceArmed,
  vwapPoiBandEnabled,
  vwapFibEnabled,
} from './paintGate';

/** 피보·골든·헌팅 */
export {
  buildAvwapFibConfluencePack,
  AVWAP_FIB_COLORS,
} from './avwapFibConfluence';
export type {
  AvwapFibConfluencePack,
  AvwapFibLeg,
  AvwapFibBias,
  AvwapFibSettleKo,
} from './avwapFibConfluence';

/** 선물용 근접 정밀 타점 */
export {
  buildAvwapPrecisionEntryPack,
  isAvwapFibLevelDeepRef,
  AVWAP_PRECISION_NEAR_ATR,
} from './avwapPrecisionEntry';
export type {
  AvwapPrecisionEntryPack,
  AvwapPrecisionCandidate,
} from './avwapPrecisionEntry';

/** 통계×AVWAP AI */
export {
  buildAvwapStatsConfluenceHub,
  attachAvwapAiToFeatureStatsPack,
} from './avwapStatsConfluenceHub';
export type {
  AvwapStatsConfluenceHub,
  AvwapStatsHubBias,
  AvwapStatsHubVote,
  AvwapStatsHubTargets,
} from './avwapStatsConfluenceHub';
