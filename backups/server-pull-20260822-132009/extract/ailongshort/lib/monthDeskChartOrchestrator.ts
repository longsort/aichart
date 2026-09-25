/**
 * 마감·안착 차트 — zone·line·캔들 분석 단일 오케스트레이터.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';
import {
  analyzeMonthDeskCandleZoneIntel,
  mergeIntelIntoSettleCandlePaint,
  type MonthDeskCandleZoneIntel,
} from '@/lib/monthDeskCandleZoneIntel';
import {
  dedupeStrikePriorityLines,
  filterMonthDeskLayersByMode,
  resolveMonthDeskChartLayerMode,
  type MonthDeskChartLayerMode,
} from '@/lib/monthDeskChartLayerPolicy';
import { collectMonthDeskSettleCandlePaint, type MonthDeskSettleCandleCell } from '@/lib/monthDeskSettleCandlePaint';
import { buildMonthDeskSettleChartGuide } from '@/lib/monthDeskSettleChartGuide';
import { dedupeMonthDeskEntryLines } from '@/lib/monthDeskOverlayPipeline';
import { filterMonthDeskEssentialZonesOnly, organizeMonthStartDeskOverlays } from '@/lib/monthDeskChartTidy';
import { softenMonthDeskZoneOverlays, harmonizeMonthDeskOverlayStack } from '@/lib/monthDeskOverlayHarmonize';
import { extendMonthDeskHorizontalPlanLines } from '@/lib/monthDeskChartTailSpacing';
import { declutterMonthDeskTailOverlays } from '@/lib/monthDeskTailDeclutter';
import { simplifyMonthDeskZoneOverlayLabels } from '@/lib/monthDeskZoneShortLabels';
import { applyMonthDeskProChartLayout } from '@/lib/monthDeskProChartLayout';
import { capMonthDeskDiagonalTrendLines } from '@/lib/monthDeskTrendLineCap';
import { applyMonthDeskCleanIconOverlayStrip } from '@/lib/monthDeskCleanZoneLineSignals';
import { filterOverlaysForAtlasPulseDesk } from '@/lib/monthDeskAtlasPulseDesk';
import { filterOverlaysForUnifiedPulseEngine } from '@/lib/monthDeskUnifiedPulseEngine';

export type MonthDeskChartOrchestratorInput = {
  items: OverlayItem[];
  candles: Candle[];
  timeframe: string;
  settlePack: OverlayItem[];
  typeomPack: OverlayItem[];
  settings: UserSettings;
  analysis?: AnalyzeResponse | null;
  analysisMatches: boolean;
  overlayClear: boolean;
  uiMode?: string;
};

export type MonthDeskChartOrchestratorOutput = {
  overlays: OverlayItem[];
  layerMode: MonthDeskChartLayerMode;
  candleIntel: MonthDeskCandleZoneIntel;
  settleCandlePaint: Map<number, MonthDeskSettleCandleCell> | null;
  settleGuide: ReturnType<typeof buildMonthDeskSettleChartGuide> | null;
};

/** 통합엔진 ON — settle·캔들 intel만, 무거운 overlay 파이프라인 생략 */
export function buildMonthDeskChartOrchestratorLite(
  input: MonthDeskChartOrchestratorInput
): MonthDeskChartOrchestratorOutput {
  const layerMode = resolveMonthDeskChartLayerMode(input.settings, input.uiMode);
  const candleIntel = analyzeMonthDeskCandleZoneIntel(input.candles, input.settlePack, {
    timeframe: input.timeframe,
    analysis: input.analysisMatches ? input.analysis : null,
  });
  let settleCandlePaint: Map<number, MonthDeskSettleCandleCell> | null = null;
  if (input.settings.chartMonthDeskSettleCandlePaint === true && input.candles.length >= 4) {
    const base = collectMonthDeskSettleCandlePaint(
      input.candles,
      input.settlePack,
      input.analysisMatches ? input.analysis : null,
      input.timeframe
    );
    const merged = mergeIntelIntoSettleCandlePaint(base, candleIntel);
    settleCandlePaint = merged.size > 0 ? merged : null;
  }
  const settleGuide =
    input.settings.chartMonthDeskSettleCandlePaint === true
      ? buildMonthDeskSettleChartGuide(input.candles, input.settlePack, {
          timeframe: input.timeframe,
          analysis: input.analysisMatches ? input.analysis : null,
        })
      : null;
  return {
    overlays: [],
    layerMode,
    candleIntel,
    settleCandlePaint,
    settleGuide,
  };
}

export function postProcessMonthDeskChartLayers(
  input: MonthDeskChartOrchestratorInput
): MonthDeskChartOrchestratorOutput {
  const layerMode = resolveMonthDeskChartLayerMode(input.settings, input.uiMode);
  let list = [...input.items];

  list = dedupeMonthDeskEntryLines(list);
  list = dedupeStrikePriorityLines(list);
  list = filterMonthDeskLayersByMode(list, layerMode);

  if (input.uiMode === 'ZONE_LINE_PRO') {
    const candleIntel = analyzeMonthDeskCandleZoneIntel(input.candles, input.settlePack, {
      timeframe: input.timeframe,
      analysis: input.analysisMatches ? input.analysis : null,
    });
    let settleCandlePaint: Map<number, MonthDeskSettleCandleCell> | null = null;
    if (input.settings.chartMonthDeskSettleCandlePaint === true && input.candles.length >= 4) {
      const base = collectMonthDeskSettleCandlePaint(
        input.candles,
        input.settlePack,
        input.analysisMatches ? input.analysis : null,
        input.timeframe
      );
      const merged = mergeIntelIntoSettleCandlePaint(base, candleIntel);
      settleCandlePaint = merged.size > 0 ? merged : null;
    }
    const settleGuide =
      input.settings.chartMonthDeskSettleCandlePaint === true
        ? buildMonthDeskSettleChartGuide(input.candles, input.settlePack, {
            timeframe: input.timeframe,
            analysis: input.analysisMatches ? input.analysis : null,
          })
        : null;
    if (input.settings.chartMonthDeskAtlasPulseDeskEnabled !== false) {
      list = filterOverlaysForAtlasPulseDesk(list);
    } else if (input.settings.chartMonthDeskCleanIconSignalsEnabled !== false) {
      list = applyMonthDeskCleanIconOverlayStrip(list);
    }
    return {
      overlays: list,
      layerMode,
      candleIntel,
      settleCandlePaint,
      settleGuide,
    };
  }

  list = filterMonthDeskEssentialZonesOnly(list, input.overlayClear ? 'clear' : 'rich');
  list = softenMonthDeskZoneOverlays(list, input.timeframe);
  list = harmonizeMonthDeskOverlayStack(list, { anchorItems: input.typeomPack });

  const safeTail = input.candles;
  if (safeTail.length >= 8) {
    list = extendMonthDeskHorizontalPlanLines(list, safeTail, input.timeframe);
    list = declutterMonthDeskTailOverlays(list, safeTail);
  }

  list = organizeMonthStartDeskOverlays(list);
  list = simplifyMonthDeskZoneOverlayLabels(list);
  list = applyMonthDeskProChartLayout(list, input.overlayClear ? 'clear' : 'rich');
  list = capMonthDeskDiagonalTrendLines(list);

  const candleIntel = analyzeMonthDeskCandleZoneIntel(input.candles, input.settlePack, {
    timeframe: input.timeframe,
    analysis: input.analysisMatches ? input.analysis : null,
  });

  let settleCandlePaint: Map<number, MonthDeskSettleCandleCell> | null = null;
  if (input.settings.chartMonthDeskSettleCandlePaint === true && input.candles.length >= 4) {
    const base = collectMonthDeskSettleCandlePaint(
      input.candles,
      input.settlePack,
      input.analysisMatches ? input.analysis : null,
      input.timeframe
    );
    const merged = mergeIntelIntoSettleCandlePaint(base, candleIntel);
    settleCandlePaint = merged.size > 0 ? merged : null;
  }

  const settleGuide =
    input.settings.chartMonthDeskSettleCandlePaint === true
      ? buildMonthDeskSettleChartGuide(input.candles, input.settlePack, {
          timeframe: input.timeframe,
          analysis: input.analysisMatches ? input.analysis : null,
        })
      : null;

  if (input.settings.chartMonthDeskUnifiedPulseEngineEnabled !== false) {
    list = filterOverlaysForUnifiedPulseEngine(list);
  } else if (input.settings.chartMonthDeskAtlasPulseDeskEnabled !== false) {
    list = filterOverlaysForAtlasPulseDesk(list);
  } else if (input.settings.chartMonthDeskCleanIconSignalsEnabled !== false) {
    list = applyMonthDeskCleanIconOverlayStrip(list);
  }

  return {
    overlays: list,
    layerMode,
    candleIntel,
    settleCandlePaint,
    settleGuide,
  };
}
