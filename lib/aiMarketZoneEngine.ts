/**
 * AI DYNAMIC MARKET ZONE ENGINE
 * + AI ORDER BLOCK BATTLE (OB evidence subset)
 *
 * 통합·분석 데스크 전용 신규 칩 레이어.
 * 기존 zone/OB/mirage/hotzone 엔진을 수정하지 않음 — 읽기 전용 재사용만.
 */
export { buildAiMarketZonePack } from '@/lib/aiMarketZone';
export type { BuildAmzPackParams, AmzEnginePack } from '@/lib/aiMarketZone';
export type {
  AmzMarketZone,
  AmzEvidence,
  AmzDataQuality,
  AmzZoneRole,
  AmzZoneState,
} from '@/lib/aiMarketZone/types';
export type { AmzOrderflowInput } from '@/lib/aiMarketZone/orderflowEngine';
