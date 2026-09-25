/**
 * 마감·안착 — 확정·연합·MTF·통합 $$$$ 정보를 **차트 zone/선/라벨**로만 표시.
 * (좌측 HTML 카드 대신)
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';
import type { MonthDeskSmcMoneyPackHud } from '@/lib/monthDeskSmcMoneyPack';
import type { MonthDeskUnifiedCoreMoney } from '@/lib/monthDeskUnifiedCoreMoney';
import type { TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import {
  buildMonthDeskChartDeckOverlay,
  MONTH_DESK_CHART_DECK_VISIBLE,
} from '@/lib/monthDeskChartLabelDeck';
import { buildMonthDeskChartSignalPins } from '@/lib/monthDeskChartSignalPins';
import {
  buildBreakoutFollowPathOverlays,
  type BreakoutFollowChain,
} from '@/lib/breakoutFollowChain';
import { buildMonthDeskAdvancedChartPath } from '@/lib/monthDeskAdvancedChartPath';
import { buildMonthDeskLinRegTrendlineOverlays } from '@/lib/monthDeskLinRegTrendlines';
import { loadSettings } from '@/lib/settings';

export type MonthDeskChartAnalysisInput = {
  candles: Candle[];
  ucm: MonthDeskUnifiedCoreMoney | null;
  fusionHeadline?: string | null;
  fusionTooltip?: string | null;
  mtfSummaryKo?: string | null;
  closingRefKo?: string | null;
  analysis?: AnalyzeResponse | null;
  moneyHud?: MonthDeskSmcMoneyPackHud | null;
  planEntry?: number | null;
  overlayPack?: OverlayItem[];
  timeframe?: string;
  scenario?: ClosingEnvelopeFuturesScenario | null;
  settleRow?: TfCloseSettleRow | null;
  preferCandlePaint?: boolean;
  featureSettleLineLabels?: boolean;
  breakoutFollow?: BreakoutFollowChain | null;
  breakoutFollowPathEnabled?: boolean;
};

export function buildMonthDeskChartAnalysisOverlays(input: MonthDeskChartAnalysisInput): OverlayItem[] {
  const { candles, ucm, fusionHeadline, fusionTooltip, mtfSummaryKo, closingRefKo, analysis } = input;
  const n = candles.length;
  if (n < 8) return [];

  const out: OverlayItem[] = [];

  if (MONTH_DESK_CHART_DECK_VISIBLE) {
    const deck = buildMonthDeskChartDeckOverlay({
      candles,
      analysis,
      ucm,
      fusionHeadline,
      fusionTooltip,
      mtfSummaryKo,
      closingRefKo,
    });
    if (deck) out.push(deck);
  }

  if (
    input.breakoutFollowPathEnabled !== false &&
    input.breakoutFollow &&
    input.breakoutFollow.phase !== 'idle'
  ) {
    out.push(
      ...buildBreakoutFollowPathOverlays(input.breakoutFollow, candles, input.timeframe)
    );
  }

  const settings = loadSettings();
  const deskTf = input.timeframe ?? analysis?.timeframe ?? '1h';
  const deskDensity =
    settings.chartMonthDeskOverlayDensity === 'rich' ? ('rich' as const) : ('clear' as const);

  /** 고래 차트 팩(cptc·피벗 TL) ON이면 LinReg 3선 경로는 생략(중복·지저분함 방지) */
  const linRegDeskOn =
    settings.chartMonthDeskLinRegTrendlinesEnabled !== false &&
    settings.chartMonthDeskWhaleChartPackEnabled === false;
  if (linRegDeskOn) {
    out.push(
      ...buildMonthDeskLinRegTrendlineOverlays({
        candles,
        timeframe: deskTf,
        parkfPartial: settings.parkfEngineOpts,
        density: deskDensity,
        whaleAlrLogScale: settings.whaleAlrLogScale === true,
      })
    );
  }

  if (settings.chartMonthDeskAdvancedPathEnabled !== false && analysis) {
    const pack = buildMonthDeskAdvancedChartPath({
      candles,
      analysis,
      timeframe: deskTf,
    });
    if (pack?.overlays.length) out.push(...pack.overlays);
  }

  out.push(
    ...buildMonthDeskChartSignalPins({
      candles,
      analysis: analysis ?? null,
      moneyHud: input.moneyHud ?? null,
      pack: input.overlayPack ?? [],
      timeframe: input.timeframe,
      scenario: input.scenario ?? null,
      settleRow: input.settleRow ?? null,
      preferCandlePaint: input.preferCandlePaint === true,
      featureSettleLineLabels: input.featureSettleLineLabels === true,
    })
  );

  return out;
}
