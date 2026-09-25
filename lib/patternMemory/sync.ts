/**
 * Incremental Bitget sync + gap repair. Never redownloads the full 3y if store has a last closed bar.
 */
import { fetchBitgetFuturesCandlesBetween, fetchBitgetFuturesCandlesRecent } from '@/lib/bitgetFuturesMarket';
import { validateRawCandles } from '@/lib/eagle1/dataQualityValidator';
import { chartCandleToEagle1Raw } from '@/lib/eagle1/canonicalCandle';
import { bitgetPerpListingStartMs } from '@/lib/bitgetFuturesMarket';
import type { Candle } from '@/types';
import {
  appendOverlayCandles,
  emptyRepair,
  lastClosedCandle,
  loadUniqueStore,
  rawToStored,
  upsertOverlayCandles,
  writeStoreMeta,
  type StoreMeta,
} from '@/lib/patternMemory/uniqueStore';
import { preferNativeOrDailyHtf } from '@/lib/patternMemory/htfFromDaily';
import { chartTfToEagle1Tf, tfStepMs } from '@/lib/patternMemory/tfMap';
import { TF_LOOKBACK_MS, type QualityRepairLog, type StoredCandle } from '@/lib/patternMemory/types';
import { PATTERN_MEMORY_TFS } from '@/lib/patternMemory/types';

function isLtfPatternSync(timeframe: string): boolean {
  return timeframe === '5m' || timeframe === '15m' || timeframe === '1h';
}

function chartToStored(c: Candle, symbol: string, timeframe: string, nowMs: number): StoredCandle | null {
  const raw = chartCandleToEagle1Raw(c, {
    symbol,
    timeframe: chartTfToEagle1Tf(timeframe),
    source: 'bitget-api',
  });
  if (!raw) return null;
  if (Number.isFinite(Number(c.quoteVolume))) raw.quote_volume = Number(c.quoteVolume);
  return rawToStored(raw, nowMs);
}

function isValidOhlc(c: StoredCandle): boolean {
  if (![c.open, c.high, c.low, c.close].every((x) => Number.isFinite(x) && x > 0)) return false;
  if (c.high < c.low) return false;
  if (c.high < c.open || c.high < c.close) return false;
  if (c.low > c.open || c.low > c.close) return false;
  return true;
}

function findGapRanges(candles: StoredCandle[], timeframe: string): { start: number; end: number }[] {
  const step = tfStepMs(timeframe);
  if (!step || candles.length < 2) return [];
  const gaps: { start: number; end: number }[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const delta = cur.openTime - prev.openTime;
    if (delta > step * 1.5) {
      gaps.push({ start: prev.openTime + step, end: Math.max(prev.openTime + step, cur.openTime - step) });
    }
  }
  return gaps;
}

async function repairWindow(
  symbol: string,
  timeframe: string,
  startMs: number,
  endMs: number,
  nowMs: number,
  repair: QualityRepairLog
): Promise<StoredCandle[]> {
  const live = await fetchBitgetFuturesCandlesBetween(symbol, timeframe, startMs, endMs);
  repair.apiPages += 1;
  return live.map((c) => chartToStored(c, symbol, timeframe, nowMs)).filter((x): x is StoredCandle => !!x);
}

export type SyncResult = {
  symbol: string;
  timeframe: string;
  logs: string[];
  candles: StoredCandle[];
  repair: QualityRepairLog;
  incremental: boolean;
  csvCount: number;
  overlayCount: number;
  htfSource?: 'native' | 'daily-aggregate';
};

export async function syncPatternMemoryTf(params: {
  symbol?: string;
  timeframe: string;
  asOfMs?: number;
  forceFull?: boolean;
  headFill?: boolean;
  /** UI 질의: 최근봉만 증분. 헤드필·갭복구는 POST sync */
  fast?: boolean;
}): Promise<SyncResult> {
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = params.timeframe;
  const nowMs = params.asOfMs ?? Date.now();
  const lookback = TF_LOOKBACK_MS[timeframe] ?? TF_LOOKBACK_MS[timeframe.toLowerCase()] ?? null;
  const listing = bitgetPerpListingStartMs(symbol);
  const lookbackStart = lookback != null ? nowMs - lookback : listing;
  const repair = emptyRepair();
  const logs: string[] = [];

  const loaded = loadUniqueStore(symbol, timeframe, { asOfMs: nowMs, lookbackMs: lookback });
  let candles = loaded.candles.filter((c) => c.openTime >= lookbackStart);
  logs.push(
    `load ${symbol} ${timeframe}: csv=${loaded.csvCount} overlay=${loaded.overlayCount} merged=${candles.length}`
  );

  const lastClosed = lastClosedCandle(candles, nowMs);
  const incremental = !params.forceFull && lastClosed != null;
  const fetchFrom = incremental
    ? lastClosed.openTime
    : Math.max(listing, lookbackStart);

  if (incremental) {
    logs.push(`incremental from lastClosed ${new Date(lastClosed.openTime).toISOString()}`);
  } else {
    logs.push(`seed/full from ${new Date(fetchFrom).toISOString()} (no last closed or forceFull)`);
  }

  const recent = await fetchBitgetFuturesCandlesRecent(symbol, timeframe, incremental ? 500 : 2000);
  repair.apiPages += 1;
  const recentStored = recent
    .map((c) => chartToStored(c, symbol, timeframe, nowMs))
    .filter((x): x is StoredCandle => !!x);
  const addedRecent = appendOverlayCandles(symbol, timeframe, recentStored);
  logs.push(`recent API bars=${recentStored.length} overlayAppend=${addedRecent}`);

  if (!incremental && candles.length < 80) {
    const hist = await fetchBitgetFuturesCandlesBetween(symbol, timeframe, fetchFrom, nowMs);
    repair.apiPages += 1;
    const histStored = hist
      .map((c) => chartToStored(c, symbol, timeframe, nowMs))
      .filter((x): x is StoredCandle => !!x);
    const n = appendOverlayCandles(symbol, timeframe, histStored);
    logs.push(`history fill bars=${histStored.length} overlayAppend=${n}`);
  } else if (incremental && lastClosed) {
    const tail = await fetchBitgetFuturesCandlesBetween(symbol, timeframe, lastClosed.openTime, nowMs);
    repair.apiPages += 1;
    const tailStored = tail
      .map((c) => chartToStored(c, symbol, timeframe, nowMs))
      .filter((x): x is StoredCandle => !!x);
    const n = appendOverlayCandles(symbol, timeframe, tailStored);
    logs.push(`tail fill bars=${tailStored.length} overlayAppend=${n}`);
  }

  if (!params.fast && (params.headFill || params.forceFull)) {
    const firstBar = candles[0];
    const step = tfStepMs(timeframe) || 900_000;
    if (firstBar && lookbackStart != null && firstBar.openTime > lookbackStart + step * 12) {
      const windowMs = 90 * 86_400_000;
      let pageEnd = firstBar.openTime;
      let pages = 0;
      const maxPages = params.forceFull ? 48 : isLtfPatternSync(timeframe) ? 2 : 6;
      const headDeadline = Date.now() + (isLtfPatternSync(timeframe) ? 12_000 : 35_000);
      while (pageEnd > lookbackStart && pages < maxPages) {
        if (Date.now() > headDeadline) {
          logs.push('history-head time-budget; remaining toward lookback');
          break;
        }
        const begin = Math.max(lookbackStart, pageEnd - windowMs);
        const head = await fetchBitgetFuturesCandlesBetween(symbol, timeframe, begin, pageEnd);
        repair.apiPages += 1;
        const headStored = head
          .map((c) => chartToStored(c, symbol, timeframe, nowMs))
          .filter((x): x is StoredCandle => !!x);
        const n = appendOverlayCandles(symbol, timeframe, headStored);
        repair.missingFilled += n;
        logs.push(`history-head ${new Date(begin).toISOString()} bars=${headStored.length} append=${n}`);
        pages += 1;
        pageEnd = begin;
        if (!headStored.length && pages > 2) continue;
      }
    }
  } else if (candles[0] && lookbackStart != null && candles[0].openTime > lookbackStart + 8 * (tfStepMs(timeframe) || 900_000)) {
    logs.push(
      `history-head skipped; first=${new Date(candles[0].openTime).toISOString()} lookback=${new Date(lookbackStart).toISOString()} — POST action=sync`
    );
  }

  const reloaded = loadUniqueStore(symbol, timeframe, { asOfMs: nowMs, lookbackMs: lookback });
  candles = reloaded.candles.filter((c) => c.openTime >= lookbackStart);
  repair.duplicateDropped += reloaded.duplicateDropped;

  if (!params.fast) {
  const invalid = candles.filter((c) => !isValidOhlc(c) || c.baseVolume < 0);
  for (const bad of invalid.slice(0, 24)) {
    const fixed = await repairWindow(symbol, timeframe, bad.openTime - 60_000, bad.openTime + 60_000, nowMs, repair);
    const hit = fixed.find((x) => x.openTime === bad.openTime);
    if (hit) {
      if (!isValidOhlc(bad)) repair.invalidOhlcRepaired += 1;
      if (bad.baseVolume < 0) repair.negativeVolumeRepaired += 1;
      upsertOverlayCandles(symbol, timeframe, [hit]);
    }
  }

  const gaps = findGapRanges(candles, timeframe);
  const gapDeadline = Date.now() + (isLtfPatternSync(timeframe) ? 18_000 : 40_000);
  const gapCap = Math.min(gaps.length, isLtfPatternSync(timeframe) ? 12 : 40);
  for (let i = 0; i < gapCap; i++) {
    if (Date.now() > gapDeadline) {
      logs.push(`gap repair time-budget; remaining=${gaps.length - i}`);
      break;
    }
    const g = gaps[i]!;
    const step = tfStepMs(timeframe) || 900_000;
    const maxSpan = 21 * 86_400_000;
    const end = Math.min(g.end, g.start + maxSpan);
    const filled = await repairWindow(symbol, timeframe, g.start - step, end + step, nowMs, repair);
    if (filled.length) {
      const n = appendOverlayCandles(symbol, timeframe, filled);
      repair.missingFilled += n;
      repair.gapWindowsRepaired += 1;
    }
  }
  if (gaps.length) logs.push(`gap starts=${gaps.length} repairedWindows=${repair.gapWindowsRepaired}`);
  } else {
    logs.push('fast-ui: skip headFill/gap-repair');
  }

  let htfSource: SyncResult['htfSource'];
  if (!params.fast && (timeframe === '1w' || timeframe === '1M')) {
    const daily = loadUniqueStore(symbol, '1d', { asOfMs: nowMs }).candles;
    const decided = preferNativeOrDailyHtf({
      native: candles,
      daily,
      tf: timeframe,
      nowMs,
    });
    htfSource = decided.used;
    if (decided.used === 'daily-aggregate') {
      candles = decided.candles;
      upsertOverlayCandles(symbol, timeframe, decided.candles);
      logs.push(`1W/1M used daily-aggregate mismatch=${decided.mismatchCount}`);
    } else {
      logs.push(`1W/1M kept native mismatch=${decided.mismatchCount}`);
    }
  }

  const finalLoad = loadUniqueStore(symbol, timeframe, { asOfMs: nowMs, lookbackMs: lookback });
  if (timeframe !== '1w' && timeframe !== '1M') {
    candles = finalLoad.candles.filter((c) => c.openTime >= lookbackStart);
  }

  const unfinished = candles.filter((c) => !c.isClosed || c.closeTime > nowMs);
  repair.unfinishedDropped = unfinished.length;
  const closed = candles.filter((c) => c.isClosed && c.closeTime <= nowMs);

  const q = validateRawCandles(
    closed.map((c) => ({
      exchange: 'bitget' as const,
      symbol,
      market_type: 'usdt-futures' as const,
      timeframe: chartTfToEagle1Tf(timeframe),
      open_time: c.openTime,
      close_time: c.closeTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      base_volume: c.baseVolume,
      quote_volume: c.quoteTurnover,
      source: 'bitget-merged' as const,
      downloaded_at: nowMs,
    })),
    { symbol, timeframe: chartTfToEagle1Tf(timeframe) }
  );

  const last = lastClosedCandle(closed, nowMs);
  const meta: StoreMeta = {
    symbol,
    timeframe,
    lastSyncAt: nowMs,
    lastClosedOpenTime: last?.openTime ?? null,
    count: closed.length,
    firstOpenTime: closed[0]?.openTime ?? null,
    lastOpenTime: closed[closed.length - 1]?.openTime ?? null,
    repair,
    incrementalLogs: logs,
  };
  writeStoreMeta(meta);
  logs.push(
    `closed=${closed.length} quality=${q.severity} gaps=${q.gap_count} dup=${q.duplicate_count} incremental=${incremental}`
  );

  return {
    symbol,
    timeframe,
    logs,
    candles: closed,
    repair,
    incremental,
    csvCount: loaded.csvCount,
    overlayCount: loaded.overlayCount,
    htfSource,
  };
}

export async function syncPatternMemoryAll(symbol = 'BTCUSDT', asOfMs?: number): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  const tfs: string[] = ['1d', ...PATTERN_MEMORY_TFS.filter((t) => t !== '1d')];
  for (const tf of tfs) {
    out.push(await syncPatternMemoryTf({ symbol, timeframe: tf, asOfMs, headFill: true }));
  }
  return out;
}
