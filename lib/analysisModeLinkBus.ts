/**
 * AI 앱 — 분석 모드 상호 연동 정책.
 * 카드/HUD보다 **ZONE · LINE(가격선) · 거래량 막대**를 공통 출력으로 쓴다.
 * 확정 수익·고정 승률 문구 금지 — 조건부 구조·리스크만.
 */
import type { UIMode } from '@/lib/settings';

/** Bitget 거래량·고래 빔·DNA를 차트(막대·구간·가격선)로 공유하는 모드 */
const BITGET_VOLUME_LINKED_MODES: ReadonlySet<UIMode> = new Set([
  'MONTH_START_DESK',
  'ZONE_LINE_PRO',
  'MERGED_ANALYSIS_DESK',
  'EAGLE1_TAP_ENGINE',
  'WHALE',
  'AI_ZONE',
  'UNIFIED_DESK',
  'FUSION_MODE',
  'HOT_ZONE',
  'SMC_DESK',
  'SMC_DESK_COMPOSITE',
  'MAX_ANALYSIS',
]);

/**
 * Strike·펄스·E/SL/TP 가격선·기관밴드를 같은 파이프로 쓰는 모드.
 * (통합·분석 / 마감·안착 / 존라인 / AI존 / 고래 / 캔들분석 / 통합작도)
 */
const DESK_PULSE_LINKED_MODES: ReadonlySet<UIMode> = new Set([
  'MONTH_START_DESK',
  'ZONE_LINE_PRO',
  'MERGED_ANALYSIS_DESK',
  'EAGLE1_TAP_ENGINE',
  'AI_ZONE',
  'WHALE',
  'CANDLE_ANALYSIS',
  'UNIFIED_DESK',
  'FUSION_MODE',
  'MAX_ANALYSIS',
]);

/** 타점·수익(E/SL/TP1~3)을 createPriceLine / LineSeries로 그리는 모드 */
const TRADE_RAIL_LINE_MODES: ReadonlySet<UIMode> = new Set([
  'MERGED_ANALYSIS_DESK',
  'EAGLE1_TAP_ENGINE',
  'MONTH_START_DESK',
  'ZONE_LINE_PRO',
  'AI_ZONE',
  'WHALE',
  'UNIFIED_DESK',
  'HOT_ZONE',
  'CANDLE_ANALYSIS',
  'FUSION_MODE',
  'MAX_ANALYSIS',
]);

export function isBitgetVolumeLinkedMode(uiMode: UIMode | string | undefined): boolean {
  if (!uiMode) return false;
  return BITGET_VOLUME_LINKED_MODES.has(uiMode as UIMode);
}

export function isDeskPulseLinkedMode(uiMode: UIMode | string | undefined): boolean {
  if (!uiMode) return false;
  return DESK_PULSE_LINKED_MODES.has(uiMode as UIMode);
}

export function isTradeRailLineMode(uiMode: UIMode | string | undefined): boolean {
  if (!uiMode) return false;
  return TRADE_RAIL_LINE_MODES.has(uiMode as UIMode);
}

/**
 * 연동 출력 우선순위 (높은 것부터 차트에 반영).
 * 카드/통계 패널은 보조 — 사용자 요청: ZONE · LINE 우선.
 */
export const ANALYSIS_LINK_OUTPUT_PRIORITY = [
  'zone',
  'trade_lines',
  'institutional_band',
  'volume_bars',
  'whale_beam_lines',
  'structure_rockets',
  'ai_stats_weight',
] as const;

export type AnalysisLinkOutput = (typeof ANALYSIS_LINK_OUTPUT_PRIORITY)[number];

/** 고래 DNA 통계 카드 UI 사용 여부 — 기본 끔(차트 ZONE/LINE만) */
export function analysisLinkPreferChartOverCards(): boolean {
  return true;
}
