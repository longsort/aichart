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

/** 페이징 시 window 추정용(월봉은 캘린더 월이라 근사) */
const INTERVAL_MS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1M': 31 * 24 * 60 * 60 * 1000,
};

const LIMIT_PER_REQ = 1000;

/** BTCUSDT 현물 대략 최초 구간(그 이전으로 잡으면 startTime 음수·빈 응답) */
const BINANCE_EARLIEST_MS = 1501545600000;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function bodyRatio(c) {
  const range = Math.max(1e-9, c.high - c.low);
  return clamp01(Math.abs(c.close - c.open) / range);
}
function upperWickRatio(c) {
  const range = Math.max(1e-9, c.high - c.low);
  const top = Math.max(c.open, c.close);
  return clamp01((c.high - top) / range);
}
function lowerWickRatio(c) {
  const range = Math.max(1e-9, c.high - c.low);
  const bot = Math.min(c.open, c.close);
  return clamp01((bot - c.low) / range);
}
function dirSign(c) {
  return c.close >= c.open ? 1 : -1;
}
function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}
function stdev(nums, mu) {
  if (!nums.length) return 1;
  const v = nums.reduce((s, x) => s + (x - mu) * (x - mu), 0) / nums.length;
  return Math.sqrt(v) || 1;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** lib/pre3PatternMemory.ts 스키마 2와 동일: 직전 3봉 몸통·꼬리를 각 봉 ATR로 정규화 */
function computeAtrSeries(candles, period = 14) {
  const n = candles.length;
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const prevC = i > 0 ? candles[i - 1].close : c.open;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - prevC), Math.abs(c.low - prevC));
  }
  const atr = new Array(n).fill(0);
  const p = Math.max(1, Math.min(period, 96));
  for (let i = 0; i < n; i++) {
    if (i < p - 1) {
      let s = 0;
      for (let k = 0; k <= i; k++) s += tr[k];
      atr[i] = s / (i + 1);
    } else if (i === p - 1) {
      let s = 0;
      for (let k = 0; k < p; k++) s += tr[k];
      atr[i] = s / p;
    } else {
      atr[i] = (atr[i - 1] * (p - 1) + tr[i]) / p;
    }
  }
  return atr;
}

function buildPre3FeatureSchema2(candles, i3, i2, i1, volMu, volSigma, atrSeries) {
  const idxs = [i3, i2, i1];
  const vols = idxs.map((i) => (candles[i].volume - volMu) / Math.max(1e-9, volSigma));
  const out = [];
  for (const i of idxs) {
    const c = candles[i];
    const range = Math.max(1e-9, c.high - c.low);
    const atr = Math.max(atrSeries[i] || 0, range * 0.02, 1e-9);
    const body = clamp(Math.abs(c.close - c.open) / atr, 0, 8);
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);
    out.push(body, clamp((c.high - top) / atr, 0, 8), clamp((bot - c.low) / atr, 0, 8), dirSign(c));
  }
  out.push(...vols);
  return out;
}

/** lib/pre3PatternMemory.ts 스키마 3: 스키마2 + 장대봉 형태·거래량·직전3봉 합 대비 */
function buildPre3FeatureSchema3(candles, bigIdx, volMu, volSigma, atrSeries) {
  const i3 = bigIdx - 3;
  const i2 = bigIdx - 2;
  const i1 = bigIdx - 1;
  const base = buildPre3FeatureSchema2(candles, i3, i2, i1, volMu, volSigma, atrSeries);
  const big = candles[bigIdx];
  const range = Math.max(1e-9, big.high - big.low);
  const atrB = Math.max(atrSeries[bigIdx] || 0, range * 0.02, 1e-9);
  const body = clamp(Math.abs(big.close - big.open) / atrB, 0, 8);
  const top = Math.max(big.open, big.close);
  const bot = Math.min(big.open, big.close);
  const uwick = clamp((big.high - top) / atrB, 0, 8);
  const lwick = clamp((bot - big.low) / atrB, 0, 8);
  const bigVolZ = (Number(big.volume || 0) - volMu) / Math.max(1e-9, volSigma);
  const rangeAtr = clamp(range / atrB, 0, 8);
  const preVolSum =
    Number(candles[i3].volume || 0) + Number(candles[i2].volume || 0) + Number(candles[i1].volume || 0);
  const preVolSumZ = (preVolSum - 3 * volMu) / Math.max(1e-9, volSigma * 1.732050808);
  const bv = Math.max(0, Number(big.volume || 0));
  const preToBigVolRatio = clamp(Math.log1p(preVolSum) - Math.log1p(bv), -4, 4);
  return [...base, body, uwick, lwick, dirSign(big), rangeAtr, bigVolZ, clamp(preVolSumZ, -6, 6), preToBigVolRatio];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    symbol: 'BTCUSDT',
    symbols: null,
    years: 5,
    tf: '15m,1h,4h',
    delayMs: 350,
    fullHistory: false,
    maxBars: 500000,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--symbol') out.symbol = String(args[++i] || out.symbol).toUpperCase();
    else if (a === '--symbols') out.symbols = String(args[++i] || '').trim();
    else if (a === '--years') out.years = Math.max(3, Math.min(15, Number(args[++i] || out.years)));
    else if (a === '--tf') out.tf = String(args[++i] || out.tf);
    else if (a === '--delay-ms') out.delayMs = Math.max(0, Math.min(5000, Number(args[++i] || out.delayMs)));
    else if (a === '--full-history') out.fullHistory = true;
    else if (a === '--max-bars') out.maxBars = Math.max(5000, Math.min(800000, Number(args[++i] || out.maxBars)));
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

async function fetchPaged(symbol, tf, bars) {
  const interval = INTERVAL[tf];
  const step = INTERVAL_MS[tf];
  const now = Date.now();
  let rawStart = now - Math.ceil(bars * step * 1.2);
  /** 월봉 등 긴 step이면 bars*step > now → 음수 startTime → klines 0건 */
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
    /** 다음 배치 시작(월봉 등 가변 간격에도 안전) */
    cursor = lastOpenMs + 1;
    if (raw.length < lim) break;
  }
  return out.slice(-bars);
}

/** 바이낸스 상장일 근처부터 현재까지 순방향 페이징(전 구간 메모리용) */
async function fetchFromGenesis(symbol, tf, delayMs, maxBars) {
  const interval = INTERVAL[tf];
  let cursor = BINANCE_EARLIEST_MS;
  const out = [];
  let guard = 0;
  while (out.length < maxBars && guard < 50000) {
    guard += 1;
    const lim = Math.min(LIMIT_PER_REQ, maxBars - out.length);
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
    const nextCursor = lastOpenMs + 1;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
    if (raw.length < lim) break;
    if (delayMs > 0) await sleep(delayMs);
  }
  return out;
}

function spanYearsApprox(candles) {
  if (candles.length < 2) return 0;
  const t0 = candles[0].time;
  const t1 = candles[candles.length - 1].time;
  return Math.max(0, (t1 - t0) / (365.25 * 86400));
}

function buildMemory(symbol, tf, yearsMeta, candles) {
  const volArr = candles.map((c) => Number(c.volume || 0));
  const volMu = mean(volArr);
  const volSigma = stdev(volArr, volMu);
  const atrSeries = computeAtrSeries(candles, 14);
  const rows = [];
  const bodyThr = 0.62;
  const volZThr = 0.9;

  for (let i = 3; i < candles.length - 1; i++) {
    const big = candles[i];
    const br = bodyRatio(big);
    const vz = (big.volume - volMu) / Math.max(1e-9, volSigma);
    if (br < bodyThr || vz < volZThr) continue;
    rows.push({
      direction: big.close >= big.open ? 'bull' : 'bear',
      feature: buildPre3FeatureSchema3(candles, i, volMu, volSigma, atrSeries),
    });
  }

  return {
    symbol,
    timeframe: tf,
    version: 1,
    featureSchema: 3,
    generatedAt: Date.now(),
    years: yearsMeta,
    thresholds: { bodyRatio: bodyThr, volumeZ: volZThr },
    totalCandles: candles.length,
    totalBigCandles: rows.length,
    rows,
  };
}

async function main() {
  const { symbols, years, tf, delayMs, fullHistory, maxBars } = parseArgs();
  const tfs = tf.split(',').map((x) => x.trim()).filter((x) => x in INTERVAL);
  if (!tfs.length) throw new Error('no valid tf. use --tf 15m,1h,4h,1d,1w,1M');
  if (!symbols.length) throw new Error('no symbols. use --symbol BTCUSDT or --symbols BTCUSDT,ETHUSDT,SOLUSDT');

  const outDir = path.join(process.cwd(), 'data', 'pre3-memory');
  await fs.mkdir(outDir, { recursive: true });

  let job = 0;
  const totalJobs = symbols.length * tfs.length;
  for (const symbol of symbols) {
    for (const oneTf of tfs) {
      job += 1;
      let candles;
      let yearsMeta = years;
      if (fullHistory) {
        console.log(
          `[pre3] (${job}/${totalJobs}) ${symbol} ${oneTf}: full history from Binance spot (max ${maxBars.toLocaleString()} bars, featureSchema 3: pre3+OB+vol)...`
        );
        candles = await fetchFromGenesis(symbol, oneTf, delayMs, maxBars);
      } else {
        const barsPerYear = Math.round((365.25 * 24 * 60 * 60 * 1000) / INTERVAL_MS[oneTf]);
        const bars = Math.max(1000, Math.min(220000, barsPerYear * years));
        console.log(`[pre3] (${job}/${totalJobs}) ${symbol} ${oneTf}: fetching ${bars.toLocaleString()} bars...`);
        candles = await fetchPaged(symbol, oneTf, bars);
      }
      if (candles.length < 100) {
        console.warn(`[pre3] skip ${symbol} ${oneTf}: too few candles (${candles.length})`);
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
      if (fullHistory) yearsMeta = Math.round(spanYearsApprox(candles) * 10) / 10;
      const mem = buildMemory(symbol, oneTf, yearsMeta, candles);
      const fp = path.join(outDir, `${symbol}_${oneTf}.json`);
      await fs.writeFile(fp, JSON.stringify(mem), 'utf8');
      console.log(`[pre3] saved ${fp} rows=${mem.rows.length.toLocaleString()} candles=${mem.totalCandles.toLocaleString()}`);
      if (delayMs > 0 && job < totalJobs) await sleep(delayMs);
    }
  }
  console.log(`[pre3] done. symbols=${symbols.join(',')} tfs=${tfs.join(',')}`);
}

main().catch((e) => {
  console.error('[pre3] failed:', e?.message || e);
  process.exit(1);
});

