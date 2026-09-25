/**
 * 벤치마크 · LWC 순수 프로필 — Lightweight Charts 철학 (캔들 + 볼륨 + 선택 RSI).
 * 존·Atlas·HUD 없음. TradingView LWC 코어 + ailongshort HTML 오버레이 분리.
 */

export const REFERENCE_DESK_LWC_PROFILE = {
  id: 'lwc-pure',
  title: 'LWC 순수 프로필',
  subtitle: '캔들 · 볼륨 · Atlas · 구조·존·패턴·MTF(토글) · RSI(선택)',
  stack: ['Lightweight Charts', 'HistogramSeries', 'RSI 패널(옵션)'],
  attribution: 'Charts powered by TradingView Lightweight Charts™',
  attributionUrl: 'https://www.tradingview.com/',
  layersOff: [
    'PHZ·핫존·마감·안착 과밀',
    '고래·SMC 풀스택',
    '로켓·실행 HUD',
  ],
  layersOn: ['캔들스틱', '볼륨', 'Trade Atlas E/SL/TP', '구조·존·패턴·MTF(토글)', 'RSI·Vol MA(옵션)'],
} as const;

/** LWC 벤치마크에서 끄는 것 — Trade Atlas(롱존·TP)는 유지 */
export const REFERENCE_DESK_LWC_SUPPRESSED = {
  htmlOverlaysExceptTradeAtlas: true,
  lsRocketLayer: true,
  executionOverlay: true,
  featureProbGauge: true,
  analyzeEntrySlTpPriceLines: true,
  phzMonthDeskSmcClutter: true,
} as const;

export type ReferenceDeskLwcHudStats = {
  candleCount: number;
  overlayCount: number;
  structureOn: boolean;
  zonesOn: boolean;
  patternsOn: boolean;
  mtfOn: boolean;
  assetsDrawingGuideOn: boolean;
  volumeOn: boolean;
  volumeMaOn: boolean;
  volumeIntelOn: boolean;
  rsiOn: boolean;
  symbol: string;
  timeframe: string;
};

export function buildReferenceDeskLwcHudStats(input: {
  candleCount: number;
  overlayCount: number;
  structureOn: boolean;
  zonesOn: boolean;
  patternsOn: boolean;
  mtfOn: boolean;
  assetsDrawingGuideOn: boolean;
  volumeMaOn: boolean;
  volumeIntelOn: boolean;
  rsiOn: boolean;
  symbol: string;
  timeframe: string;
}): ReferenceDeskLwcHudStats {
  return {
    candleCount: input.candleCount,
    overlayCount: input.overlayCount,
    structureOn: input.structureOn,
    zonesOn: input.zonesOn,
    patternsOn: input.patternsOn,
    mtfOn: input.mtfOn,
    assetsDrawingGuideOn: input.assetsDrawingGuideOn,
    volumeOn: input.candleCount >= 2,
    volumeMaOn: input.volumeMaOn,
    volumeIntelOn: input.volumeIntelOn,
    rsiOn: input.rsiOn,
    symbol: input.symbol,
    timeframe: input.timeframe,
  };
}
