/**

 * 마감·안착 — 차트 캔들 마커 (가이드 모듈 위임).

 */

import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

import {

  buildMonthDeskSettleChartGuide,

  type MonthDeskSettleChartMarker,

} from '@/lib/monthDeskSettleChartGuide';



export type { MonthDeskSettleChartMarker };



/** 마감·안착 모드 — 캔들 위 1·2·3·가짜·리테스트 마커 */

export function buildMonthDeskSettleChartMarkers(

  candles: Candle[],

  pack: OverlayItem[],

  opts?: {

    timeframe?: string;

    analysis?: AnalyzeResponse | null;

    tailBars?: number;

  }

): MonthDeskSettleChartMarker[] {

  const built = buildMonthDeskSettleChartGuide(candles, pack, opts);

  return built?.markers ?? [];

}


