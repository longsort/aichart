'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';
import { buildMonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import { buildMonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { refineMonthDeskEntryLevels } from '@/lib/monthDeskBoardFusion';
import { useMonthDeskWhaleSnapshot } from '@/app/components/monthDesk/MonthDeskWhalePanel';

/** 모든 모드 공통 — 실전 카드용 메트릭·레벨·고래 스냅샷 */
export function useTradePracticalBundle(
  analysis: AnalyzeResponse | null,
  candles: Candle[] | null,
  symbol: string,
  timeframe: string
) {
  const { board } = useTfCloseSettleBoard(symbol, true);

  const metrics = useMemo(
    () => buildMonthDeskBoardMetrics({ analysis, candles, board, timeframe }),
    [analysis, candles, board, timeframe]
  );

  const levels = useMemo(() => {
    const base = buildMonthDeskCoreLevels(analysis, metrics.ucm, metrics.closePrice);
    return refineMonthDeskEntryLevels(base, {
      verdict: metrics.verdict,
      candles,
      analysis,
      ucm: metrics.ucm,
      structure: metrics.structure,
    });
  }, [analysis, metrics.ucm, metrics.closePrice, metrics.verdict, metrics.structure, candles]);

  const whale = useMonthDeskWhaleSnapshot(analysis, candles, symbol, timeframe);

  return { metrics, levels, whale, board };
}
