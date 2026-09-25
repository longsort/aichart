/**
 * 1분봉 분석 지시 모드 — 분봉에서 켜 둬야 할 차트 기능을 전부 켠다.
 * (사용자가 1m으로 전환해 보고·지시할 때용)
 */
import type { UserSettings } from '@/lib/settings';

/** 1m에서 기본으로 켤 오버레이·패널 키 */
export const ONE_MINUTE_ANALYSIS_SHOW_KEYS = [
  'showStructure',
  'showZones',
  'showLabels',
  'showScenario',
  'showFib',
  'showRsi',
  'showHarmonic',
  'showChartPrimeTrendChannels',
  'showPo3',
  'showCandle',
  'showBpr',
  'showRsiPanel',
  'showMacdPanel',
  'showBbPanel',
  'showVision',
  'showVisionTriangle',
  'showVisionFlag',
  'showVisionWedge',
  'showVisionReversal',
  'showVisionRange',
  'showReactionZone',
  'showWhaleZone',
  'showVolatilityTrendScore',
  'showTailongClose',
  'showTailongCloseBreakout',
  'showTailongCloseWick',
  'showTailongCloseBody',
  'showTailongCloseFlow',
  'showSmcDeskEq',
  'showSmcDeskOrderBlocks',
  'showSmcDeskStructure',
  'showSmcDeskZoneStrength',
  'showSmcDeskEntryPlaybook',
  'showSmcDeskConfluenceLs',
  'chartSmcCompositeChartDrawing',
  'chartTradeAtlasEnabled',
  'chartTradeAtlasShowHud',
  'chartTradeAtlasShowZones',
  'chartTradeAtlasShowLevels',
  'whaleHotZoneEnabled',
  'whaleCoreSrZoneEnabled',
  'whaleLiquidityBiasEnabled',
  'whaleStructureBounceEnabled',
  'whalePrecisionEntryEnabled',
  'whaleDynamicRsProEnabled',
] as const;

export type OneMinuteShowKey = (typeof ONE_MINUTE_ANALYSIS_SHOW_KEYS)[number];

/** 1m 진입 시 적용할 패치 — false였던 분석 기능을 true로 */
export function oneMinuteAnalysisFeaturePatch(
  prev: Partial<UserSettings> | Record<string, unknown>
): Partial<UserSettings> {
  const patch: Record<string, unknown> = {
    chartPrimeTrendChannelsShowLastOnly: false,
    chartTradeSetupFocus: false,
  };
  for (const k of ONE_MINUTE_ANALYSIS_SHOW_KEYS) {
    if ((prev as Record<string, unknown>)[k] !== true) patch[k] = true;
  }
  return patch as Partial<UserSettings>;
}

export function isOneMinuteTimeframe(tf: string | null | undefined): boolean {
  return String(tf || '').toLowerCase() === '1m';
}
