#!/usr/bin/env node
/**
 * BTC/SOL 15m CSV → 기관밴드1·2+READY 이벤트 BT. 스윕2 별도 n.
 * npx tsx scripts/runInstBand15mEventBacktest.ts
 */
import fs from 'fs';
import path from 'path';
import { loadEagle1RawCandles } from '../lib/eagle1/historicalDatabase';
import type { Eagle1Bar } from '../lib/eagle1/structureEngine';
import { runInstBand15mEventBacktest } from '../lib/eagle1Tapoint/instBand15mEventBacktester';

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

function slim(r: ReturnType<typeof runInstBand15mEventBacktest>) {
  return {
    symbol: r.symbol,
    timeframe: r.timeframe,
    bars: r.bars,
    livePromote: r.livePromote,
    noteKo: r.noteKo,
    bandFireN: r.bandFireN,
    sweep2N: r.sweep2N,
    sweep2: r.sweep2,
    band: r.band,
    holdout: r.holdout,
    overfitOk: r.overfitOk,
    overfitNoteKo: r.overfitNoteKo,
    maxRiskPct: r.maxRiskPct,
    waitCounts: r.waitCounts,
  };
}

function runOne(symbol: string) {
  const cap = Math.max(400, Number(process.env.EVENT_BT_MAX_BARS) || 2500);
  let candles = rawToBars(loadEagle1RawCandles(symbol, '15m'));
  if (!candles.length) {
    console.log(JSON.stringify({ skip: true, symbol, timeframe: '15m', n: 0, noteKo: 'CSV 없음' }));
    return;
  }
  if (candles.length > cap) candles = candles.slice(-cap);
  const report = runInstBand15mEventBacktest({ symbol, candles });
  const dir = path.join(process.cwd(), 'data', 'eagle1', 'stats');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `inst_band_15m_${symbol}.json`),
    JSON.stringify({ ...slim(report), trades: report.trades }, null, 2),
    'utf8'
  );
  const paperDir = path.join(process.cwd(), 'data', 'eagle1', 'paper');
  fs.mkdirSync(paperDir, { recursive: true });
  const jsonl = report.trades
    .filter((t) => t.engine === 'BAND12')
    .map((t) => JSON.stringify({ mode: 'PAPER', live: false, ...t }))
    .join('\n');
  fs.writeFileSync(
    path.join(paperDir, `INST_BAND_15M_${symbol}_15m.jsonl`),
    jsonl ? jsonl + '\n' : '',
    'utf8'
  );
  console.log(JSON.stringify(slim(report)));
}

runOne('BTCUSDT');
runOne('SOLUSDT');
