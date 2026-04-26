'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  addVirtualTrade,
  canEnterNew,
  computeRr,
  getRecentFailedCount,
  getRecentFailedPatternCount,
  isFailedContextAllowed,
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
const TF_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
  '1Y': 31536000,
};

type Options = {
  enabled: boolean;
  symbols: string[];
  timeframes: string[];
  seedUsdt: number;
  targetProfitPct: number;
  tpSlMode: 'auto' | 'manual';
  manualStopPct: number;
  manualTp1Pct: number;
  manualTp2Pct: number;
  manualTp3Pct: number;
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
  targetProfitPct,
  tpSlMode,
  manualStopPct,
  manualTp1Pct,
  manualTp2Pct,
  manualTp3Pct,
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

        const div = data.rsiDivergenceSignal as
          | {
              verdict?: 'LONG' | 'SHORT' | 'WATCH' | 'NONE';
              reasons?: string[];
              signalBarTime?: number;
            }
          | undefined;
        // 사용자 요구: 차트의 L/S 신호가 실제로 뜬 경우에만 자동 진입
        const direction = div?.verdict === 'LONG' || div?.verdict === 'SHORT' ? div.verdict : null;
        if (!direction) continue;
        const settlement = data?.settlementZone as
          | { state?: 'none' | 'candidate' | 'confirmed' | 'failed'; direction?: 'LONG' | 'SHORT' | 'NONE'; score?: number }
          | undefined;
        // 강화 규칙: 안착확인 ZONE + L/S 방향 일치일 때만 진입
        if (!settlement || settlement.state !== 'confirmed') continue;
        if (settlement.direction !== direction) continue;
        if (!isFinite(Number(settlement.score)) || Number(settlement.score) < 70) continue;
        const candles = data.candles as { time?: number; high?: number; low?: number; close?: number }[] | undefined;
        const lastCandle = Array.isArray(candles) ? candles[candles.length - 1] : undefined;
        const lastTime = Number(lastCandle?.time ?? 0);
        const utcHour = Number.isFinite(lastTime) && lastTime > 0 ? new Date(lastTime * 1000).getUTCHours() : -1;
        const volBucket = (() => {
          if (!Array.isArray(candles) || candles.length < 6) return 'mid';
          const seg = candles.slice(-20);
          const avg = seg.reduce((s, c) => s + Math.abs((Number(c.high) - Number(c.low)) / Math.max(1e-9, Number(c.close))), 0) / Math.max(1, seg.length);
          if (avg >= 0.012) return 'high';
          if (avg <= 0.005) return 'low';
          return 'mid';
        })();
        const grade = Number(settlement.score) >= 85 ? 'A' : Number(settlement.score) >= 70 ? 'B' : 'C';
        const contextKey = `${symbol}|${timeframe}|${direction}|h${utcHour}|vol:${volBucket}|g:${grade}`;
        const signalBarTime = Number(div?.signalBarTime ?? 0);
        const tfSec = TF_SEC[timeframe] ?? 60;
        // 최근 1봉 이내 신호만 허용 (오래된 과거 신호로 재진입 방지)
        const isFreshSignal =
          Number.isFinite(signalBarTime) &&
          signalBarTime > 0 &&
          Number.isFinite(lastCandle?.time) &&
          Math.abs((lastCandle!.time as number) - signalBarTime) <= tfSec;
        if (!isFreshSignal) continue;

        if (!canEnterNew(symbol, timeframe)) continue;
        const recentFails = getRecentFailedCount(symbol, timeframe, direction, 24);
        if (recentFails >= RECENT_FAIL_SKIP_THRESHOLD) continue;
        const recentContextFails = getRecentFailedPatternCount(contextKey, 72);
        if (recentContextFails >= 2 && !isFailedContextAllowed(contextKey)) continue;

        const entry = parseFloat(String(data.entry ?? 0));
        const autoStop = parseFloat(String(data.stopLoss ?? 0));
        const autoTargets = (data.targets ?? []).map((t: unknown) => parseFloat(String(t))).filter((n: number) => !isNaN(n));
        let stop = autoStop;
        let targets = autoTargets;
        if (tpSlMode === 'manual' && isFinite(entry) && entry > 0) {
          const stopPct = Math.max(0.1, manualStopPct);
          const tp1Pct = Math.max(0.1, manualTp1Pct);
          const tp2Pct = Math.max(tp1Pct, manualTp2Pct);
          const tp3Pct = Math.max(tp2Pct, manualTp3Pct);
          if (direction === 'LONG') {
            stop = entry * (1 - stopPct / 100);
            targets = [
              entry * (1 + tp1Pct / 100),
              entry * (1 + tp2Pct / 100),
              entry * (1 + tp3Pct / 100),
            ];
          } else {
            stop = entry * (1 + stopPct / 100);
            targets = [
              entry * (1 - tp1Pct / 100),
              entry * (1 - tp2Pct / 100),
              entry * (1 - tp3Pct / 100),
            ];
          }
        }
        if (isNaN(entry) || entry <= 0 || isNaN(stop)) continue;
        // 방향 안전장치: 손절은 반드시 반대 방향(롱=아래, 숏=위)에 있어야 함
        if (direction === 'LONG' && stop >= entry) continue;
        if (direction === 'SHORT' && stop <= entry) continue;
        // 방향 안전장치: 목표가는 반드시 이익 방향에 있어야 함
        const directionalTargets = targets.filter((t) =>
          direction === 'LONG' ? t > entry : t < entry
        );
        if (directionalTargets.length === 0) continue;
        const rr = computeRr(direction, entry, stop, directionalTargets[0]);
        if (!isFinite(rr)) continue;

        const entryTime = (lastCandle?.time ?? Math.floor(Date.now() / 1000)) as number;
        const signalReasons = [
          ...(div?.reasons ?? []).slice(0, 3),
          `안착확인 ${Math.round(Number(settlement.score) || 0)}점`,
        ];

        addVirtualTrade(
          {
            symbol,
            timeframe,
            direction,
            entryPrice: entry,
            stopPrice: stop,
            targetPrices: directionalTargets,
            entryTime,
            rr,
            signalReasons,
            tpSlMode,
            patternHash: contextKey,
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
              direction,
              entry,
              stop,
              targets: directionalTargets,
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
  }, [enabled, symbols, timeframes, seedUsdt, tpSlMode, manualStopPct, manualTp1Pct, manualTp2Pct, manualTp3Pct]);

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

        const outcome = checkPositionOutcome(pos, data.candles, targetProfitPct);
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
              patternHash: pos.patternHash ?? `${pos.symbol}-${pos.timeframe}-${pos.entryTime}`,
              contextKey: pos.patternHash,
            });
          }
          onRefreshRef.current?.();
        }
      } catch {
        // skip
      }
    }
  }, [enabled, targetProfitPct]);

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
