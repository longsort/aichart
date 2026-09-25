#!/usr/bin/env node
/**
 * Walk Bitget CSV (causal prefixes) → setup outcomes + family stats + RR walk-forward.
 * Does not fill missing bars. Writes data/eagle1/stats.
 * Live RR gates are not mutated here.
 */
import { loadEagle1RawCandles } from '../lib/eagle1/historicalDatabase';
import {
  walkSetupOutcomes,
  summarizeFamilies,
  calibrationError,
  walkForwardRrGates,
} from '../lib/eagle1/zoneExpectancy';
import { saveExpectancyCatalog, saveSetupOutcomes } from '../lib/eagle1/freezeStore';
import type { Eagle1Bar } from '../lib/eagle1/structureEngine';

function rawToBars(
  rows: Array<{ open_time: number; open: number; high: number; low: number; close: number; base_volume: number }>
): Eagle1Bar[] {
  return rows.map((r) => ({
    time: Math.floor(r.open_time / 1000),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.base_volume,
  }));
}

function runTf(symbol: string, timeframe: string, keep: number, stride: number, maxPrefixes: number) {
  const raw = loadEagle1RawCandles(symbol, timeframe);
  if (raw.length < 120) {
    console.log('skip', timeframe, 'bars', raw.length);
    return;
  }
  const bars = rawToBars(raw).slice(-keep);
  console.log('walk', timeframe, 'bars', bars.length, 'stride', stride);
  const t0 = Date.now();
  const rows = walkSetupOutcomes({ candles: bars, stride, maxPrefixes, horizon: 20 });
  const wf = walkForwardRrGates(rows);
  const cat = {
    symbol,
    timeframe,
    families: summarizeFamilies(rows),
    holdoutCalibrationError: calibrationError(rows),
    rrWalkForward: wf,
    calculated_at: Date.now(),
    bar_count: bars.length,
  };
  saveSetupOutcomes(symbol, timeframe, rows);
  saveExpectancyCatalog(cat);
  console.log(
    'done',
    timeframe,
    'outcomes',
    rows.length,
    'ms',
    Date.now() - t0,
    'families',
    cat.families.filter((f) => f.sampleSize).map((f) => `${f.family}:${f.sampleSize}`).join(','),
    'rr',
    wf.reason
  );
}

const symbol = 'BTCUSDT';
runTf(symbol, '1H', 10000, 12, 280);
runTf(symbol, '15m', 6000, 16, 200);
runTf(symbol, '4H', 5000, 8, 220);
console.log('eagle1 stats build ok');
