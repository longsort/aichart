#!/usr/bin/env npx tsx
/**
 * 분·시·일·주·월·년 TF 전부 — 횡보·매집/분산·RVOL 이벤트 → data/volume-phase-stats/*.json
 */
import { loadVolumeShockCandles } from '../lib/volumeShockCandleSource';
import { normalizeChartTimeframe } from '../lib/constants';
import { computeVolumePhaseStatsFromCandles } from '../lib/volumePhaseStats';
import { writeVolumePhaseStats } from '../lib/volumePhaseStatsStore';
import {
  parentHtfForPhaseStats,
  phaseHorizonsForTf,
  phaseLookbackDaysForTf,
  VOLUME_PHASE_STATS_TIMEFRAMES,
} from '../lib/volumePhaseTimeframes';
import { readBitgetFuturesCsv } from '../lib/bitgetFuturesCsv';
import type { Candle } from '../types';

function parseArgs() {
  const args = process.argv.slice(2);
  let symbol = 'BTCUSDT';
  let allTf = false;
  let tf = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol') symbol = String(args[++i] || symbol).toUpperCase();
    else if (args[i] === '--all-tf') allTf = true;
    else if (args[i] === '--tf') tf = String(args[++i] || '');
  }
  const timeframes = allTf || !tf.trim()
    ? [...VOLUME_PHASE_STATS_TIMEFRAMES]
    : tf.split(',').map((s) => normalizeChartTimeframe(s.trim())).filter(Boolean);
  return { symbol, timeframes };
}

async function loadHtf(symbol: string, timeframe: string): Promise<Candle[]> {
  const parent = parentHtfForPhaseStats(timeframe);
  if (!parent) return [];
  try {
    const csv = await readBitgetFuturesCsv(symbol, parent);
    if (csv.length >= 30) return csv;
  } catch {
    /* fallback */
  }
  const loaded = await loadVolumeShockCandles(symbol, parent, phaseLookbackDaysForTf(parent));
  return 'error' in loaded ? [] : loaded.candles;
}

async function main() {
  const { symbol, timeframes } = parseArgs();
  console.log(`[build] ${symbol} TF=${timeframes.join(',')}`);

  for (const timeframe of timeframes) {
    try {
      const days = phaseLookbackDaysForTf(timeframe);
      const loaded = await loadVolumeShockCandles(symbol, timeframe, days);
      if ('error' in loaded) {
        console.warn(`[skip] ${symbol} ${timeframe}: ${loaded.error}`);
        continue;
      }
      const minBars = timeframe === '1M' || timeframe === '1Y' ? 24 : timeframe === '1w' ? 40 : 120;
      if (loaded.candles.length < minBars) {
        console.warn(`[skip] ${symbol} ${timeframe}: bars=${loaded.candles.length}`);
        continue;
      }
      const htfCandles = await loadHtf(symbol, timeframe);
      const horizons = phaseHorizonsForTf(timeframe);
      const file = computeVolumePhaseStatsFromCandles(symbol, timeframe, loaded.candles, {
        htfCandles: htfCandles.length >= 30 ? htfCandles : undefined,
        horizons,
      });
      const fp = await writeVolumePhaseStats(file);
      const top = file.keys[0];
      const n0 = top?.horizons[0]?.sampleCount ?? 0;
      console.log(
        `[ok] ${timeframe} ${fp} bars=${file.totalBars} src=${loaded.source} events=${file.eventCount} keys=${file.keys.length} +${horizons.join('/')} n=${n0}`
      );
    } catch (e) {
      console.error(`[fail] ${symbol} ${timeframe}:`, e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
