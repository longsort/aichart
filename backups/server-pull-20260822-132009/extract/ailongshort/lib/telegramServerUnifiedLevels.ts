/**
 * 서버 크론 — analyze + desk → unifiedTradePlan 타점.
 */
import type { AnalyzeResponse } from '@/types';
import { buildUnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';
import { resolveUnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { TelegramServerDeskBundle } from '@/lib/telegramServerDeskEval';
import { unifiedLevelsFromAnalysis } from '@/lib/telegramServerDeskEval';

export type ServerUnifiedLevels = {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  sourceKo: string;
};

export function resolveServerUnifiedLevels(
  analysis: AnalyzeResponse,
  bundle: TelegramServerDeskBundle
): ServerUnifiedLevels {
  const fallback = unifiedLevelsFromAnalysis(analysis, bundle.levels);
  const dir = bundle.desk.direction;
  if (dir !== 'LONG' && dir !== 'SHORT') {
    return { ...fallback, sourceKo: 'analyze · MonthDesk' };
  }

  const chartFeatures = buildUnifiedChartFeatureContext({
    direction: dir,
    currentPrice: analysis.currentPrice ?? bundle.levels.close,
    candles: bundle.candles,
    analysis,
    tradeEntry: fallback.entry,
    tradeSl: fallback.sl,
    tradeTp1: fallback.tp1,
  });

  const plan = resolveUnifiedDeskTradePlan({
    masterDirection: dir,
    trade: null,
    analysis,
    judgment: null,
    currentPrice: analysis.currentPrice ?? bundle.levels.close,
    chartFeatures,
  });

  if (plan.entry <= 0) {
    return { ...fallback, sourceKo: plan.sourceKo || 'analyze · MonthDesk' };
  }

  return {
    entry: plan.entry,
    sl: plan.stopLoss > 0 ? plan.stopLoss : fallback.sl,
    tp1: plan.tp1 > 0 ? plan.tp1 : fallback.tp1,
    tp2: plan.tp2 > 0 ? plan.tp2 : fallback.tp2,
    tp3: plan.tp3 > 0 ? plan.tp3 : fallback.tp3,
    sourceKo: plan.sourceKo,
  };
}
