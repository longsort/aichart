#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const INTERVAL = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
  '1M': '1M',
};

const INTERVAL_MS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1M': 31 * 24 * 60 * 60 * 1000,
};

const LIMIT_PER_REQ = 1000;
const BINANCE_EARLIEST_MS = 1501545600000;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    symbol: 'BTCUSDT',
    symbols: null,
    years: 8,
    tf: '15m,1h,4h,1d,1w,1M',
    delayMs: 350,
    zigzagLen: 9,
    fibFactor: 0.33,
    minCandles: 120,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--symbol') out.symbol = String(args[++i] || out.symbol).toUpperCase();
    else if (a === '--symbols') out.symbols = String(args[++i] || '').trim();
    else if (a === '--years') out.years = Math.max(3, Math.min(15, Number(args[++i] || out.years)));
    else if (a === '--tf') out.tf = String(args[++i] || out.tf);
    else if (a === '--delay-ms') out.delayMs = Math.max(0, Math.min(5000, Number(args[++i] || out.delayMs)));
    else if (a === '--zigzag-len') out.zigzagLen = Math.max(3, Math.min(25, Number(args[++i] || out.zigzagLen)));
    else if (a === '--fib-factor') out.fibFactor = Math.max(0.05, Math.min(0.95, Number(args[++i] || out.fibFactor)));
    else if (a === '--min-candles') out.minCandles = Math.max(30, Math.min(5000, Number(args[++i] || out.minCandles)));
  }
  const symbols =
    out.symbols != null && String(out.symbols).length > 0
      ? String(out.symbols)
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : [out.symbol];
  return { ...out, symbols };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPaged(symbol, tf, bars) {
  const interval = INTERVAL[tf];
  const step = INTERVAL_MS[tf];
  const now = Date.now();
  const rawStart = now - Math.ceil(bars * step * 1.2);
  let cursor = Math.max(BINANCE_EARLIEST_MS, rawStart);
  const out = [];
  while (out.length < bars) {
    const lim = Math.min(LIMIT_PER_REQ, bars - out.length);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&limit=${lim}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) break;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) break;
    for (const r of raw) {
      out.push({
        time: Math.floor(Number(r[0]) / 1000),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5] || 0),
      });
    }
    const lastOpenMs = Number(raw[raw.length - 1][0] || 0);
    if (!Number.isFinite(lastOpenMs) || lastOpenMs <= 0) break;
    cursor = lastOpenMs + 1;
    if (raw.length < lim) break;
  }
  return out.slice(-bars);
}

function buildZonesFromCandles(candles, tf, zigzagLen, fibFactor) {
  if (candles.length < 60) return [];
  const arr = candles;
  const stepSec = Math.max(60, Math.round(INTERVAL_MS[tf] / 1000));
  const extendBars = 10;
  const zones = [];

  const highs = [];
  const lows = [];
  let trend = 1;

  const maxIn = (from, to) => {
    let m = -Infinity;
    for (let i = from; i <= to; i++) m = Math.max(m, arr[i].high);
    return m;
  };
  const minIn = (from, to) => {
    let m = Infinity;
    for (let i = from; i <= to; i++) m = Math.min(m, arr[i].low);
    return m;
  };
  const argMaxIn = (from, to) => {
    let idx = from;
    let v = -Infinity;
    for (let i = from; i <= to; i++) {
      if (arr[i].high >= v) {
        v = arr[i].high;
        idx = i;
      }
    }
    return idx;
  };
  const argMinIn = (from, to) => {
    let idx = from;
    let v = Infinity;
    for (let i = from; i <= to; i++) {
      if (arr[i].low <= v) {
        v = arr[i].low;
        idx = i;
      }
    }
    return idx;
  };

  for (let i = zigzagLen; i < arr.length; i++) {
    const from = Math.max(0, i - zigzagLen + 1);
    const toUp = arr[i].high >= maxIn(from, i);
    const toDown = arr[i].low <= minIn(from, i);
    const prevTrend = trend;
    trend = trend === 1 && toDown ? -1 : trend === -1 && toUp ? 1 : trend;
    if (trend !== prevTrend) {
      if (trend === 1) {
        const li = argMinIn(from, i);
        lows.push({ index: li, time: arr[li].time, price: arr[li].low });
      } else {
        const hi = argMaxIn(from, i);
        highs.push({ index: hi, time: arr[hi].time, price: arr[hi].high });
      }
    }
  }

  let market = 1;
  const makeId = (prefix, t, p) => `${prefix}-${tf}-${t}-${Math.round(p * 100)}`;
  const mkZone = (id, label, t1, p1, p2, confidence, color) => ({
    id,
    label,
    time1: t1,
    time2: t1 + stepSec * extendBars,
    price1: p1,
    price2: p2,
    confidence,
    color,
  });
  const findLast = (from, to, pred) => {
    let idx = -1;
    for (let j = Math.max(0, from); j <= Math.min(arr.length - 1, to); j++) {
      if (pred(arr[j])) idx = j;
    }
    return idx;
  };

  for (let i = 1; i < Math.min(highs.length, lows.length); i++) {
    const h0 = highs[highs.length - 1 - i];
    const h1 = highs[highs.length - 2 - i];
    const l0 = lows[lows.length - 1 - i];
    const l1 = lows[lows.length - 2 - i];
    if (!h0 || !h1 || !l0 || !l1) continue;
    const prevMarket = market;
    if (market === 1 && l0.price < l1.price && l0.price < l1.price - Math.abs(h0.price - l1.price) * fibFactor) market = -1;
    else if (market === -1 && h0.price > h1.price && h0.price > h1.price + Math.abs(h1.price - l0.price) * fibFactor) market = 1;
    if (market === prevMarket) continue;

    const left = Math.max(0, Math.min(h1.index, l1.index) - zigzagLen);
    const right = Math.max(h0.index, l0.index);
    if (market === 1) {
      const obIdx = findLast(Math.min(h1.index, l0.index), Math.max(h1.index, l0.index), (c) => c.open > c.close);
      if (obIdx >= 0) {
        const c = arr[obIdx];
        zones.push(mkZone(makeId('bu-ob', c.time, c.high), 'Bu-OB', c.time, c.high, c.low, 84, 'rgba(34,197,94,0.30)'));
      }
      const bbIdx = findLast(left, Math.max(h1.index, l1.index), (c) => c.open < c.close);
      if (bbIdx >= 0) {
        const c = arr[bbIdx];
        const tag = l0.price < l1.price ? 'Bu-BB' : 'Bu-MB';
        zones.push(mkZone(makeId('bu-bb', c.time, c.high), tag, c.time, c.high, c.low, 80, 'rgba(74,222,128,0.16)'));
        zones.push(mkZone(makeId('buy-forecast', arr[right].time, c.high), 'Buy-MB', arr[right].time + stepSec, c.high, c.low, 72, 'rgba(74,222,128,0.14)'));
      }
    } else {
      const obIdx = findLast(Math.min(l1.index, h0.index), Math.max(l1.index, h0.index), (c) => c.open < c.close);
      if (obIdx >= 0) {
        const c = arr[obIdx];
        zones.push(mkZone(makeId('be-ob', c.time, c.high), 'Be-OB', c.time, c.high, c.low, 84, 'rgba(239,68,68,0.30)'));
      }
      const bbIdx = findLast(left, Math.max(h1.index, l1.index), (c) => c.open > c.close);
      if (bbIdx >= 0) {
        const c = arr[bbIdx];
        const tag = h0.price > h1.price ? 'Be-BB' : 'Be-MB';
        zones.push(mkZone(makeId('be-bb', c.time, c.high), tag, c.time, c.high, c.low, 80, 'rgba(248,113,113,0.16)'));
        zones.push(mkZone(makeId('sell-forecast', arr[right].time, c.low), 'Sell-MB', arr[right].time + stepSec, c.high, c.low, 72, 'rgba(248,113,113,0.14)'));
      }
    }
  }

  const dedup = new Map();
  for (const z of zones) dedup.set(z.id, z);
  return [...dedup.values()].sort((a, b) => a.time1 - b.time1);
}

async function main() {
  const { symbols, years, tf, delayMs, zigzagLen, fibFactor, minCandles } = parseArgs();
  const tfs = tf.split(',').map((x) => x.trim()).filter((x) => x in INTERVAL);
  if (!tfs.length) throw new Error('no valid tf. use --tf 15m,1h,4h,1d,1w,1M');
  const outDir = path.join(process.cwd(), 'data', 'whale-memory');
  await fs.mkdir(outDir, { recursive: true });
  let job = 0;
  const totalJobs = symbols.length * tfs.length;
  for (const symbol of symbols) {
    for (const oneTf of tfs) {
      job += 1;
      const barsPerYear = Math.round((365.25 * 24 * 60 * 60 * 1000) / INTERVAL_MS[oneTf]);
      const bars = Math.max(1200, Math.min(220000, barsPerYear * years));
      console.log(`[whale-memory] (${job}/${totalJobs}) ${symbol} ${oneTf}: fetching ${bars.toLocaleString()} bars...`);
      const candles = await fetchPaged(symbol, oneTf, bars);
      if (candles.length < minCandles) {
        console.warn(`[whale-memory] skip ${symbol} ${oneTf}: too few candles (${candles.length})`);
        if (delayMs > 0 && job < totalJobs) await sleep(delayMs);
        continue;
      }
      const zones = buildZonesFromCandles(candles, oneTf, zigzagLen, fibFactor);
      const out = {
        symbol,
        timeframe: oneTf,
        generatedAt: Date.now(),
        zones,
      };
      const fp = path.join(outDir, `${symbol}_${oneTf}.json`);
      await fs.writeFile(fp, JSON.stringify(out), 'utf8');
      console.log(`[whale-memory] saved ${fp} zones=${zones.length.toLocaleString()} candles=${candles.length.toLocaleString()}`);
      if (delayMs > 0 && job < totalJobs) await sleep(delayMs);
    }
  }
  console.log(`[whale-memory] done. symbols=${symbols.join(',')} tfs=${tfs.join(',')}`);
}

main().catch((e) => {
  console.error('[whale-memory] failed:', e?.message || e);
  process.exit(1);
});

