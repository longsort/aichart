/**
 * 서버 크론 — analyze + desk → unifiedTradePlan 타점.
 */
import type { AnalyzeResponse } from '@/types';
import { buildUnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';
import { resolveUnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { TelegramServerDeskBundle } from '@/lib/telegramServerDeskEval';
import { unifiedLevelsFromAnalysis } from '@/lib/telegramServerDeskEval';
import { sanitizeTelegramTradeLevels } from '@/lib/telegramSymbolPriceGuard';

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
    const scrub = sanitizeTelegramTradeLevels(
      String(analysis.symbol || ''),
      analysis.currentPrice ?? bundle.levels.close,
      fallback
    );
    return {
      entry: scrub.entry,
      sl: scrub.sl,
      tp1: scrub.tp1,
      tp2: scrub.tp2,
      tp3: scrub.tp3,
      sourceKo: 'analyze · MonthDesk',
    };
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
    const scrubFb = sanitizeTelegramTradeLevels(
      String(analysis.symbol || ''),
      analysis.currentPrice ?? bundle.levels.close,
      fallback
    );
    return {
      entry: scrubFb.entry,
      sl: scrubFb.sl,
      tp1: scrubFb.tp1,
      tp2: scrubFb.tp2,
      tp3: scrubFb.tp3,
      sourceKo: plan.sourceKo || 'analyze · MonthDesk',
    };
  }

  const raw = {
    entry: plan.entry,
    sl: plan.stopLoss > 0 ? plan.stopLoss : fallback.sl,
    tp1: plan.tp1 > 0 ? plan.tp1 : fallback.tp1,
    tp2: plan.tp2 > 0 ? plan.tp2 : fallback.tp2,
    tp3: plan.tp3 > 0 ? plan.tp3 : fallback.tp3,
  };
  const scrub = sanitizeTelegramTradeLevels(
    String(analysis.symbol || ''),
    analysis.currentPrice ?? bundle.levels.close,
    raw
  );
  const scrubFb = sanitizeTelegramTradeLevels(
    String(analysis.symbol || ''),
    analysis.currentPrice ?? bundle.levels.close,
    fallback
  );
  return {
    entry: scrub.entry ?? scrubFb.entry,
    sl: scrub.sl ?? scrubFb.sl,
    tp1: scrub.tp1 ?? scrubFb.tp1,
    tp2: scrub.tp2,
    tp3: scrub.tp3,
    sourceKo: plan.sourceKo,
  };
}
