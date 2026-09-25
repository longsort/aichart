/**
 * Eagle1 AI 분석 ZONE — v2 chart layers (aiZonePack 기반).
 * @deprecated 직접 호출 대신 buildEagle1AiZoneChartOverlays(aiZonePack) 사용.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import {
  buildEagle1AiZoneChartOverlays,
  buildEagle1AiZonePack,
  type Eagle1AiZonePack,
} from './aiZonePack';

export type { Eagle1AiZonePack } from './aiZonePack';
export {
  buildEagle1AiZonePack,
  buildEagle1AiZoneChartOverlays,
  buildEagle1AiZonePriceLines,
  buildEagle1AiZoneClickDetail,
  resolveAiZoneSlotByOverlayId,
  formatAiZoneHoldLine,
  formatAiZoneSources,
  formatAiZoneExecPrice,
} from './aiZonePack';

export function isEagle1AiAnalysisZoneOverlayId(id: string): boolean {
  const s = String(id || '');
  return s.startsWith('eagle1-ai-zone--') || s.startsWith('eagle1-entry-zone');
}

/** 레거시 시그니처 — hotZone·pack 없으면 내부에서 pack 생성 */
export function buildEagle1AiAnalysisZoneOverlays(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  enabled: boolean;
  pack?: Eagle1AiZonePack | null;
  hotZoneEntry?: MergedDeskHotZoneEntryPack | null;
}): OverlayItem[] {
  if (!params.enabled) return [];
  if (!params.analysis && !params.pack) return [];
  const candles =
    params.candles.length >= 2
      ? params.candles
      : ((params.analysis?.eagle1SparkCandles ?? []) as Candle[]);
  if (candles.length < 2) return [];

  const pack =
    params.pack ??
    (params.analysis
      ? buildEagle1AiZonePack({
          analysis: params.analysis,
          candles,
          hotZoneEntry: params.hotZoneEntry ?? null,
        })
      : null);
  if (!pack) return [];

  return buildEagle1AiZoneChartOverlays({
    pack,
    analysis: params.analysis,
    candles,
  });
}
