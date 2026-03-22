'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  addVirtualTrade,
  canEnterNew,
  getRecentFailedCount,
  getAllOpenPositions,
  updateVirtualTrade,
  checkPositionOutcome,
  recordFailedSignal,
  RECENT_FAIL_SKIP_THRESHOLD,
} from '@/lib/virtualTradeStore';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { fetchVirtualApi } from '@/lib/fetchVirtualApi';

const ANALYZE_INTERVAL_MS = 60_000;
const EXIT_CHECK_INTERVAL_MS = 30_000;

type Options = {
  enabled: boolean;
  symbols: string[];
  timeframes: string[];
  seedUsdt: number;
  onRefresh?: () => void;
};

/**
 * 백그라운드 가상매매 — 차트 무관하게 각 (심볼×TF) 조합을 주기적으로 분석하고
 * 4요소 확정 신호 시 자동 진입, 청산 조건 체크
 */
export function useVirtualTradeBackground({
  enabled,
  symbols,
  timeframes,
  seedUsdt,
  onRefresh,
}: Options) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const runAnalyze = useCallback(async () => {
    if (!enabled || symbols.length === 0 || timeframes.length === 0 || seedUsdt <= 0) return;

    const pairs: [string, string][] = [];
    for (const sym of symbols) {
      for (const tf of timeframes) {
        pairs.push([sym, tf]);
      }
    }

    for (const [symbol, timeframe] of pairs) {
      try {
        const res = await fetchWithRetry(
          `/api/analyze?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
          { cache: 'no-store', credentials: 'same-origin' },
          1
        );
        const data = await res.json();
        if (!data?.symbol || data.symbol !== symbol || data.timeframe !== timeframe) continue;

        const confirmed = data.confirmedSignal as { confirmed?: boolean; direction?: 'LONG' | 'SHORT' } | undefined;
        if (
          !confirmed?.confirmed ||
          (confirmed.direction !== 'LONG' && confirmed.direction !== 'SHORT')
        )
          continue;

        if (!canEnterNew(symbol, timeframe)) continue;
        const recentFails = getRecentFailedCount(symbol, timeframe, confirmed.direction, 24);
        if (recentFails >= RECENT_FAIL_SKIP_THRESHOLD) continue;

        const entry = parseFloat(String(data.entry ?? 0));
        const stop = parseFloat(String(data.stopLoss ?? 0));
        const targets = (data.targets ?? []).map((t: unknown) => parseFloat(String(t))).filter((n: number) => !isNaN(n));
        if (isNaN(entry) || entry <= 0 || isNaN(stop)) continue;

        const candles = data.candles as { time?: number }[] | undefined;
        const lastCandle = Array.isArray(candles) ? candles[candles.length - 1] : undefined;
        const entryTime = (lastCandle?.time ?? Math.floor(Date.now() / 1000)) as number;

        addVirtualTrade(
          {
            symbol,
            timeframe,
            direction: confirmed.direction,
            entryPrice: entry,
            stopPrice: stop,
            targetPrices: targets,
            entryTime,
          },
          seedUsdt
        );
        // 확정신호 서버 저장 (각 분·시·일·주·달 봉)
        fetchVirtualApi('/api/confirmed-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal: {
              symbol,
              timeframe,
              direction: confirmed.direction,
              entry,
              stop,
              targets,
              entryTime,
              at: Date.now(),
            },
          }),
        }).catch(() => {});
        onRefreshRef.current?.();
      } catch {
        // skip failed request
      }
    }
  }, [enabled, symbols, timeframes, seedUsdt]);

  const runExitCheck = useCallback(async () => {
    if (!enabled) return;

    const openPositions = getAllOpenPositions();
    for (const pos of openPositions) {
      try {
        const res = await fetchWithRetry(
          `/api/market?symbol=${pos.symbol}&timeframe=${pos.timeframe}`,
          { cache: 'no-store', credentials: 'same-origin' }
        );
        const data = await res.json();
        if (!data?.ok || !Array.isArray(data.candles)) continue;

        const outcome = checkPositionOutcome(pos, data.candles);
        if (outcome) {
          updateVirtualTrade(pos.id, {
            status: outcome.status,
            exitPrice: outcome.exitPrice,
            exitTime: outcome.exitTime,
            pnlPct: outcome.pnlPct,
          });
          if (outcome.status === 'hit_stop') {
            recordFailedSignal({
              symbol: pos.symbol,
              timeframe: pos.timeframe,
              direction: pos.direction,
              at: outcome.exitTime,
              patternHash: `${pos.symbol}-${pos.timeframe}-${pos.entryTime}`,
            });
          }
          onRefreshRef.current?.();
        }
      } catch {
        // skip
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    runAnalyze();
    const analyzeT = setInterval(runAnalyze, ANALYZE_INTERVAL_MS);

    runExitCheck();
    const exitT = setInterval(runExitCheck, EXIT_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(analyzeT);
      clearInterval(exitT);
    };
  }, [enabled, runAnalyze, runExitCheck]);
}
