/**
 * PHASE 17 — Short-TTL in-process memo for runEagle1Pipeline.
 * Key: symbol|tf|closedBarTime|candleLen (forming bar excluded from closedBarTime).
 * Avoids double compute on React Strict Mode / duplicate analyze fetch (TTL ~2s).
 * Does not delete engines; returns identical causal pipeline result.
 */

import { runEagle1Pipeline, type Eagle1PipelineInput, type Eagle1PipelineResult } from './pipeline';
import {
  buildHistoricalZoneCacheKey,
  closedBarTimeFromCandles,
  fingerprintFrozenZoneBounds,
  getHistoricalZoneCache,
  setHistoricalZoneCache,
} from './historicalZoneCache';
import { EAGLE1_ENGINE_VERSION } from './rawTypes';

const MEMO_TTL_MS = 2000;

type MemoRow = {
  at: number;
  result: Eagle1PipelineResult;
};

let memoKey: string | null = null;
let memoRow: MemoRow | null = null;

function pipelineMemoId(input: Eagle1PipelineInput): string {
  const end = input.endExclusive ?? input.candles.length;
  const liveFull = input.endExclusive == null || end >= input.candles.length;
  const closed = closedBarTimeFromCandles(input.candles, {
    endExclusive: liveFull ? undefined : end,
    treatLastAsForming: liveFull,
  });
  const sym = String(input.symbol || 'BTCUSDT').toUpperCase();
  const tf = String(input.timeframe || '');
  const len = Math.min(input.candles.length, end);
  return `${sym}|${tf}|${closed}|${len}|${EAGLE1_ENGINE_VERSION}`;
}

function recordZoneCache(input: Eagle1PipelineInput, result: Eagle1PipelineResult): void {
  const end = input.endExclusive ?? input.candles.length;
  const liveFull = input.endExclusive == null || end >= input.candles.length;
  const closedBarTime = closedBarTimeFromCandles(input.candles, {
    endExclusive: liveFull ? undefined : end,
    treatLastAsForming: liveFull,
  });
  const nextKey = buildHistoricalZoneCacheKey({
    symbol: input.symbol,
    timeframe: input.timeframe,
    closedBarTime,
  });
  /** After a fresh pipeline run, always stamp fingerprint (LRU). */
  setHistoricalZoneCache({
    key: nextKey,
    zoneFingerprint: fingerprintFrozenZoneBounds(result.zones?.zones),
    coreSupportMid: result.coreZoneFusion?.support?.midpoint ?? null,
    coreResistMid: result.coreZoneFusion?.resistance?.midpoint ?? null,
    computed_at: Date.now(),
  });
}

/**
 * Same as runEagle1Pipeline, with 2s identical-key memo + historical zone cache stamp.
 * Safe for duplicate requests; new closed bar / TF / symbol always misses.
 */
export function runEagle1PipelineMemoized(input: Eagle1PipelineInput): Eagle1PipelineResult {
  const id = pipelineMemoId(input);
  const now = Date.now();
  if (memoRow && memoKey === id && now - memoRow.at <= MEMO_TTL_MS) {
    return memoRow.result;
  }
  const result = runEagle1Pipeline(input);
  memoKey = id;
  memoRow = { at: now, result };
  try {
    recordZoneCache(input, result);
  } catch {
    /* cache stamp never blocks analysis */
  }
  return result;
}

/** Selftest / process reset */
export function clearEagle1PipelineMemo(): void {
  memoKey = null;
  memoRow = null;
}

export function pipelineMemoAcceptance(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  clearEagle1PipelineMemo();

  const candles = Array.from({ length: 48 }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 10,
  }));

  const input: Eagle1PipelineInput = {
    candles,
    timeframe: '1H',
    symbol: 'BTCUSDT',
    endExclusive: 40,
  };

  const a = runEagle1PipelineMemoized(input);
  const b = runEagle1PipelineMemoized(input);
  if (a !== b) notes.push('memo should return same object within TTL');
  if (a.mainPlan?.status == null) notes.push('pipeline result missing mainPlan');

  const cacheHit = getHistoricalZoneCache(
    buildHistoricalZoneCacheKey({
      symbol: 'BTCUSDT',
      timeframe: '1H',
      closedBarTime: closedBarTimeFromCandles(candles, { endExclusive: 40 }),
    })
  );
  if (!cacheHit) notes.push('zone cache not stamped after memoized run');

  clearEagle1PipelineMemo();
  return { ok: notes.length === 0, notes };
}
