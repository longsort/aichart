'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import { useTradePracticalBundle } from '@/app/components/useTradePracticalBundle';
import { buildMonthDeskSettleBoardStats } from '@/lib/monthDeskSettleBoardStats';
import { buildMonthDeskConfirmDisplay } from '@/lib/monthDeskConfirmDisplay';
import { buildMonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import { buildTradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import { computeMonthDeskPrecisionAnalysis } from '@/lib/monthDeskPrecisionAnalysis';
import {
  applyExternalToMonthDeskBriefing,
  buildMonthDeskUnifiedBriefingSnapshot,
} from '@/lib/monthDeskUnifiedPrecisionBriefing';
import { useMonthDeskMtfAnalyzes } from '@/lib/useMonthDeskMtfAnalyzes';
import { useUnifiedBriefingExternal } from '@/lib/useUnifiedBriefingExternal';
import { buildMonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import styles from '../MonthDeskAnalysisBoard.module.css';

type Props = {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  chartVerdictValidation?: MonthDeskVerdictValidationSummary | null;
};

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

/** 우측 트레이드 패널 — 좌측 통합 브리핑과 동일 엔진·실시간 연동 표시 */
export default function MonthDeskBriefingSyncStrip({
  symbol,
  timeframe,
  analysis,
  candles,
  chartVerdictValidation,
}: Props) {
  const { metrics: m, levels, whale, board } = useTradePracticalBundle(analysis, candles, symbol, timeframe);
  const { rows: mtfRows, loading: mtfLoading } = useMonthDeskMtfAnalyzes(symbol, timeframe, analysis);

  const baseSnapshot = useMemo(() => {
    if (!analysis) return null;
    const ta = buildMonthDeskTradeAction(m, levels, whale, analysis);
    const confirmDesk = buildTradeConfirmDesk(analysis, m, levels, ta);
    const confirmDisplay = buildMonthDeskConfirmDisplay(confirmDesk, m, analysis);
    const precision = computeMonthDeskPrecisionAnalysis(analysis, m, levels, m.structure);
    const settleStats = buildMonthDeskSettleBoardStats({
      board,
      metrics: m,
      chartVerdictValidation: chartVerdictValidation ?? null,
      timeframe,
    });
    const strikeBundle =
      candles && candles.length >= 12
        ? buildMonthDeskStrikeDeskBundle({
            candles,
            timeframe,
            swingPivot: 2,
            scenario: null,
            stCore: null,
            analyzeVerdict:
              analysis.verdict === 'LONG' || analysis.verdict === 'SHORT' ? analysis.verdict : null,
            analyzeFusion: {
              currentPrice: analysis.currentPrice,
              atr: analysis.indicators?.atr?.[analysis.indicators.atr.length - 1],
              longScore: analysis.longScore,
              shortScore: analysis.shortScore,
              verdict: analysis.verdict,
            },
            analysis,
          })
        : null;

    return buildMonthDeskUnifiedBriefingSnapshot({
      symbol,
      chartTf: timeframe,
      analysis,
      metrics: m,
      levels,
      strikeBundle,
      settleBoard: board,
      settleStats,
      tradeAction: ta,
      confirmDisplay,
      precision,
      mtfAnalyzes: mtfRows,
      actionLine: ta.actionKo,
    });
  }, [symbol, timeframe, analysis, m, levels, whale, board, candles, mtfRows, chartVerdictValidation]);

  const externalHook = useUnifiedBriefingExternal({
    symbol,
    chartTf: timeframe,
    currentPrice: levels.close ?? analysis?.currentPrice ?? null,
    masterDirection: baseSnapshot?.masterDirection ?? 'NEUTRAL',
    enabled: !!analysis,
  });

  const snapshot = useMemo(
    () => (baseSnapshot ? applyExternalToMonthDeskBriefing(baseSnapshot, externalHook.context) : null),
    [baseSnapshot, externalHook.context]
  );

  if (!snapshot) return null;

  return (
    <div className={styles.unifiedBriefSyncStrip} aria-label="통합 브리핑 연동">
      <span className={styles.unifiedBriefSyncLive}>
        {mtfLoading || externalHook.loading ? '동기화…' : 'LIVE'}
      </span>
      <strong>
        통합 {dirKo(snapshot.masterDirection)} · {snapshot.masterGrade} · 연동 {snapshot.gauges.syncPct}%
      </strong>
      <span>
        L{snapshot.gauges.longPct}% S{snapshot.gauges.shortPct}% · 확정 {Math.round(snapshot.gauges.gatesPct)}%
      </span>
      {snapshot.external?.news?.level === 'HIGH' ? (
        <span>⚠ 매크로</span>
      ) : null}
      {snapshot.external?.signalHistory && !snapshot.external.signalHistory.alignedWithMaster ? (
        <span>히스토리 엇갈림</span>
      ) : null}
      {snapshot.mtfStatistics ? (
        <span>
          통계 {snapshot.mtfStatistics.statisticalVerdict === 'LONG' ? '롱' : snapshot.mtfStatistics.statisticalVerdict === 'SHORT' ? '숏' : '관망'}{' '}
          {snapshot.mtfStatistics.weightedLongPct}%
        </span>
      ) : null}
      <span className={styles.unifiedBriefSyncHint}>↔ 좌측 AI 정밀 브리핑 · Strike · 핵심보드 동일</span>
    </div>
  );
}
