/**
 * 서버 — analyze → TradeConfirmDesk (앱 미접속 텔레 감지용).
 */
import type { AnalyzeResponse, Candle } from '@/types';
import { buildMonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import { buildMonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { refineMonthDeskEntryLevels } from '@/lib/monthDeskBoardFusion';
import { buildMonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';
import { buildMonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import {
  buildTradeConfirmDesk,
  type ConfirmNotifyKind,
  type ConfirmPhase,
  type TradeConfirmDesk,
} from '@/lib/tradeConfirmDesk';
import { buildTemporalCompareDigest } from '@/lib/temporalCompareDigest';

export type TelegramServerDeskBundle = {
  desk: TradeConfirmDesk;
  metrics: ReturnType<typeof buildMonthDeskBoardMetrics>;
  levels: ReturnType<typeof refineMonthDeskEntryLevels>;
  ta: ReturnType<typeof buildMonthDeskTradeAction>;
  candles: Candle[];
  temporalLine: string | null;
  learningLine: string | null;
};

export function buildTelegramServerDeskBundle(
  analysis: AnalyzeResponse,
  timeframe: string
): TelegramServerDeskBundle | null {
  const candles: Candle[] = (analysis as AnalyzeResponse & { candles?: Candle[] }).candles?.length
    ? ((analysis as AnalyzeResponse & { candles?: Candle[] }).candles as Candle[])
    : [];
  const metrics = buildMonthDeskBoardMetrics({
    analysis,
    candles,
    board: null,
    timeframe,
  });
  const baseLevels = buildMonthDeskCoreLevels(analysis, metrics.ucm, metrics.closePrice);
  const levels = refineMonthDeskEntryLevels(baseLevels, {
    verdict: metrics.verdict,
    candles,
    analysis,
    ucm: metrics.ucm,
    structure: metrics.structure,
  });
  const whale = buildMonthDeskWhaleSnapshot(analysis, candles);
  const ta = buildMonthDeskTradeAction(metrics, levels, whale, analysis);
  const desk = buildTradeConfirmDesk(analysis, metrics, levels, ta);
  if (!desk) return null;

  const digest = buildTemporalCompareDigest(analysis, {
    symbol: analysis.symbol,
    timeframe,
  });
  const learning = analysis.signalLearning;
  const learningLine =
    learning && learning.longCount + learning.shortCount > 0
      ? `학습 표본 ${learning.longCount + learning.shortCount}건 · TP1 ${learning.tp1Count} SL ${learning.slCount} · ${Math.round(learning.successRate * 100)}%(검증)`
      : null;

  return {
    desk,
    metrics,
    levels,
    ta,
    candles,
    temporalLine: digest?.alignmentKo ?? null,
    learningLine,
  };
}

/** confirmed 상태에서 가격만으로 타점 진입 감지 (크론 간격 보완) */
export function detectPriceAtEntryTransition(
  prev: ConfirmPhase | null,
  bundle: TelegramServerDeskBundle
): ConfirmNotifyKind | null {
  if (prev === 'at_entry' || prev === 'invalid') return null;
  if (bundle.ta.status !== 'at_entry') return null;
  if (prev !== 'confirmed' && prev !== 'confirmed_full' && prev !== 'candidate') return null;
  return 'at_entry';
}

export function unifiedLevelsFromAnalysis(analysis: AnalyzeResponse, levels: TelegramServerDeskBundle['levels']) {
  const parse = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const entry = levels.entryMid ?? parse(analysis.entry) ?? analysis.currentPrice ?? null;
  const sl = parse(analysis.stopLoss) ?? levels.invalidation ?? null;
  const tps = levels.targets.length
    ? levels.targets
    : (analysis.targets ?? []).map(parse).filter((n): n is number => n != null);
  return {
    entry,
    sl,
    tp1: tps[0] ?? null,
    tp2: tps[1] ?? null,
    tp3: tps[2] ?? null,
  };
}
