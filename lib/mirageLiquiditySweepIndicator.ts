/**
 * Mirage Liquidity Sweep Pro v1.3.1 (WillyAlgoTrader) — Pine 포팅.
 * 유동성 스윕 · CHoCH 확인 · SL/TP · BSL/SSL · EQH/EQL.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { atrSeries, ema } from '@/lib/indicators';
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';

export const MIRAGE_LSP_VERSION = 'v1.3.1';

const MAX_STORED = 25;
const MAX_EQ_MARKS = 16;
const FORM_LEN = 10;
const LINE_FORWARD_BARS = 20;
const LINE_UPDATE_BARS = 5;

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
};

export type MirageRiskPreset = 'Conservative' | 'Balanced' | 'Aggressive' | 'Scalping' | 'Custom';

export type MirageLspOptions = {
  swingLen: number;
  lookbackBars: number;
  minScore: number;
  requireConfirm: boolean;
  minorLen: number;
  confirmWindow: number;
  useVolume: boolean;
  volLen: number;
  volMult: number;
  useHtf: boolean;
  htfTf: string;
  htfEmaLen: number;
  riskPreset: MirageRiskPreset;
  atrLenRisk: number;
  slBuffer: number;
  tp1Mult: number;
  tp2Mult: number;
  tp3Mult: number;
  useBreakEven: boolean;
  showLiquidity: boolean;
  maxLiq: number;
  liqExtendBars: number;
  showEquals: boolean;
  eqTol: number;
  showTarget: boolean;
  showSweeps: boolean;
  showSweepLine: boolean;
  sweepLineExtendBars: number;
  showSweepPen: boolean;
  maxSweepVis: number;
  showSignals: boolean;
  showSlTp: boolean;
  showSlTpLabels: boolean;
  showPctOnLabels: boolean;
  showLevel: boolean;
  showDash: boolean;
};

export const DEFAULT_MIRAGE_LSP_OPTIONS: MirageLspOptions = {
  swingLen: 21,
  lookbackBars: 80,
  minScore: 50,
  requireConfirm: true,
  minorLen: 8,
  confirmWindow: 13,
  useVolume: true,
  volLen: 21,
  volMult: 1.5,
  useHtf: true,
  htfTf: '4h',
  htfEmaLen: 50,
  riskPreset: 'Balanced',
  atrLenRisk: 14,
  slBuffer: 0.25,
  tp1Mult: 1.0,
  tp2Mult: 2.0,
  tp3Mult: 3.0,
  useBreakEven: true,
  showLiquidity: true,
  maxLiq: 6,
  liqExtendBars: 10,
  showEquals: true,
  eqTol: 0.15,
  showTarget: true,
  showSweeps: true,
  showSweepLine: true,
  sweepLineExtendBars: 8,
  showSweepPen: true,
  maxSweepVis: 15,
  showSignals: true,
  showSlTp: true,
  showSlTpLabels: true,
  showPctOnLabels: true,
  showLevel: true,
  showDash: true,
};

export type MirageSweepVis = {
  dir: 1 | -1;
  originBar: number;
  sweepBar: number;
  originTime: number;
  sweepTime: number;
  lvl: number;
  penetration: number;
  score: number;
};

export type MirageEqMark = {
  kind: 'eqh' | 'eql';
  t1: number;
  t2: number;
  lvl: number;
};

export type MirageRestingLiq = {
  side: 'bsl' | 'ssl';
  lvl: number;
  bar: number;
  time: number;
};

export type MirageTradeSnapshot = {
  dir: 1 | -1;
  entryBar: number;
  entryTime: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sweepLvl: number;
  score: number;
  tp1Reached: boolean;
  tp2Reached: boolean;
  tp3Reached: boolean;
  beActive: boolean;
  targetLvl: number | null;
  closed: boolean;
};

export type MirageDashboard = {
  headerKo: string;
  headerTone: 'bull' | 'bear' | 'flat';
  market: {
    trendKo: string;
    htfBiasKo: string;
    signalKo: string;
    lastSweepKo: string;
    timeframe: string;
  };
  trade: {
    flat: boolean;
    statusKo: string;
    sl?: string;
    tp1?: string;
    tp2?: string;
    tp3?: string;
    rr?: string;
    slDistPct?: string;
  };
  stats: {
    trades: number;
    wins: number;
    losses: number;
    winRateKo: string;
    formKo: string;
  };
};

export type MirageLspResult = {
  options: MirageLspOptions;
  activeTrade: MirageTradeSnapshot | null;
  lastClosedTrade: MirageTradeSnapshot | null;
  sweepVis: MirageSweepVis[];
  eqMarks: MirageEqMark[];
  restingLiq: MirageRestingLiq[];
  qualifiedSweepMarks: Array<{ bar: number; time: number; dir: 1 | -1; price: number; score: number }>;
  signalMarks: Array<{ bar: number; time: number; dir: 1 | -1; text: string }>;
  sweepTrend: -1 | 0 | 1;
  lastSigType: 'bull' | 'bear' | null;
  lastSigScore: number | null;
  dashboard: MirageDashboard;
  summaryKo: string;
  barDur: number;
  lineForwardSec: number;
  lineUpdateSec: number;
};

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i]!.low;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.low < lo) return false;
  }
  return true;
}

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const hi = candles[i]!.high;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.high >= hi) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.high > hi) return false;
  }
  return true;
}

function volSma(candles: Candle[], endIdx: number, len: number): number {
  const start = Math.max(0, endIdx - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    sum += candles[i]!.volume > 0 ? candles[i]!.volume : 0;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function resampleCandles(candles: Candle[], targetTf: string): Candle[] {
  const bucketMs = TF_MS[normalizeChartTimeframe(targetTf)];
  if (!bucketMs || candles.length < 4) return [];
  const buckets = new Map<number, Candle[]>();
  for (const c of candles) {
    const key = Math.floor(Math.floor(c.time * 1000 / bucketMs) * bucketMs / 1000);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  const out: Candle[] = [];
  for (const [key, arr] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    arr.sort((a, b) => a.time - b.time);
    const first = arr[0]!;
    const last = arr[arr.length - 1]!;
    out.push({
      time: key,
      open: first.open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: last.close,
      volume: arr.reduce((s, x) => s + (x.volume > 0 ? x.volume : 0), 0),
    });
  }
  return out;
}

function htfBucketTime(candleTime: number, htfTf: string): number {
  const bucketMs = TF_MS[normalizeChartTimeframe(htfTf)] ?? TF_MS['4h']!;
  return Math.floor(Math.floor(candleTime * 1000 / bucketMs) * bucketMs / 1000);
}

function buildHtfBiasSeries(candles: Candle[], htfTf: string, emaLen: number): boolean[] {
  const htf = resampleCandles(candles, htfTf);
  if (htf.length < emaLen + 2) return candles.map(() => false);
  const closes = htf.map((c) => c.close);
  const emaVals = ema(closes, emaLen);
  const bullMap = new Map<number, boolean>();
  for (let i = 0; i < htf.length; i++) {
    bullMap.set(htf[i]!.time, closes[i]! > (emaVals[i] ?? closes[i]!));
  }
  return candles.map((c) => bullMap.get(htfBucketTime(c.time, htfTf)) ?? false);
}

function riskPresetValues(preset: MirageRiskPreset, opts: MirageLspOptions): [number, number, number, number] {
  switch (preset) {
    case 'Conservative':
      return [0.5, 1.0, 2.0, 4.0];
    case 'Aggressive':
      return [0.15, 1.5, 2.5, 4.0];
    case 'Scalping':
      return [0.1, 0.8, 1.5, 2.0];
    case 'Custom':
      return [opts.slBuffer, opts.tp1Mult, opts.tp2Mult, opts.tp3Mult];
    default:
      return [0.25, 1.0, 2.0, 3.0];
  }
}

function sweepScore(
  dir: 1 | -1,
  lvl: number,
  c: Candle,
  atrv: number,
  volComp: number,
  htfComp: number
): number {
  const rng = c.high - c.low;
  if (rng <= 0 || atrv <= 0 || !Number.isFinite(lvl)) return 0;
  const wick = dir === 1 ? Math.min(c.open, c.close) - c.low : c.high - Math.max(c.open, c.close);
  const reclaim = dir === 1 ? c.close - lvl : lvl - c.close;
  const closePos = (c.close - c.low) / rng;
  const cpComp = dir === 1 ? closePos : 1 - closePos;
  const wickComp = Math.min(Math.max(wick, 0) / atrv, 1);
  const rclComp = Math.min(Math.max(reclaim, 0) / atrv, 1);
  return (wickComp * 0.3 + rclComp * 0.25 + cpComp * 0.2 + volComp * 0.15 + htfComp * 0.1) * 100;
}

function buildGauge(value: number, maxVal: number, width: number): string {
  const filled =
    maxVal <= 0 ? 0 : Math.round(Math.min(width, Math.max(0, (value / maxVal) * width)));
  let s = '';
  for (let i = 0; i < width; i++) s += i < filled ? '▰' : '▱';
  return s;
}

function fmtPctFromEntry(level: number, entry: number, show: boolean): string {
  if (!show || !Number.isFinite(level) || !Number.isFinite(entry) || entry === 0) return '';
  const pct = ((level - entry) / entry) * 100;
  const sign = pct >= 0 ? '+' : '';
  return ` (${sign}${pct.toFixed(2)}%)`;
}

function nearestOppositeTarget(
  dir: 1 | -1,
  entry: number,
  hiLvl: number[],
  loLvl: number[],
  hiUsed: boolean[],
  loUsed: boolean[]
): number | null {
  if (dir === 1) {
    let best: number | null = null;
    for (let i = 0; i < hiLvl.length; i++) {
      if (hiUsed[i]) continue;
      const lvl = hiLvl[i]!;
      if (lvl > entry && (best == null || lvl < best)) best = lvl;
    }
    return best;
  }
  let best: number | null = null;
  for (let i = 0; i < loLvl.length; i++) {
    if (loUsed[i]) continue;
    const lvl = loLvl[i]!;
    if (lvl < entry && (best == null || lvl > best)) best = lvl;
  }
  return best;
}

/** USDT-M·현물 코인 가격 표기 (BTC·알트 공통) */
export function fmtMirageCryptoPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 10_000) return n.toFixed(1);
  if (a >= 1000) return n.toFixed(2);
  if (a >= 100) return n.toFixed(2);
  if (a >= 1) return n.toFixed(4);
  if (a >= 0.01) return n.toFixed(5);
  return n.toFixed(6);
}

/** 코인 단기~장기 TF — HTF 편향·스윙 폭 프리셋 */
export function mirageOptionsForTimeframe(timeframe?: string): Partial<MirageLspOptions> {
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  /** 통합분석 칩 TF — 4h 프리셋 고정 (분·시·일·주·월 공통) */
  if (isMergedDeskChartTimeframe(tf)) {
    return { swingLen: 21, minorLen: 8, htfTf: '1d', lookbackBars: 90 };
  }
  if (tf === '1m') {
    return { swingLen: 12, minorLen: 5, lookbackBars: 48, htfTf: '15m', minScore: 48 };
  }
  if (tf === '3m') {
    return { swingLen: 13, minorLen: 5, lookbackBars: 52, htfTf: '1h', minScore: 48 };
  }
  if (tf === '5m') {
    return { swingLen: 14, minorLen: 6, lookbackBars: 58, htfTf: '1h', minScore: 50 };
  }
  if (tf === '15m') {
    return { swingLen: 16, minorLen: 6, lookbackBars: 65, htfTf: '4h' };
  }
  if (tf === '30m') {
    return { swingLen: 18, minorLen: 7, lookbackBars: 72, htfTf: '4h' };
  }
  if (tf === '1h') return { swingLen: 21, minorLen: 8, htfTf: '4h', lookbackBars: 80 };
  if (tf === '4h') return { swingLen: 21, minorLen: 8, htfTf: '1d', lookbackBars: 90 };
  if (tf === '1d') return { swingLen: 21, minorLen: 8, htfTf: '1w', lookbackBars: 100 };
  if (tf === '1w' || tf === '1M') {
    return { swingLen: 21, minorLen: 8, htfTf: '1w', lookbackBars: 120, minScore: 52 };
  }
  return { swingLen: 21, minorLen: 8, lookbackBars: 80, htfTf: '4h' };
}

/** Pine bar-by-bar 시뮬레이션 */
export function runMirageLiquiditySweep(
  candlesIn: Candle[],
  optsIn?: Partial<MirageLspOptions>,
  timeframe?: string
): MirageLspResult {
  const opts: MirageLspOptions = {
    ...DEFAULT_MIRAGE_LSP_OPTIONS,
    ...mirageOptionsForTimeframe(timeframe),
    ...optsIn,
  };
  const candles = candlesIn.filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close));
  const n = candles.length;
  const warmup = Math.max(opts.swingLen * 2, 50);
  const atrs = atrSeries(candles, opts.atrLenRisk);
  const htfBull = opts.useHtf ? buildHtfBiasSeries(candles, opts.htfTf, opts.htfEmaLen) : candles.map(() => false);
  const [effBuf, effTP1, effTP2, effTP3] = riskPresetValues(opts.riskPreset, opts);

  const hiLvl: number[] = [];
  const hiBar: number[] = [];
  const hiUsed: boolean[] = [];
  const loLvl: number[] = [];
  const loBar: number[] = [];
  const loUsed: boolean[] = [];

  let lastMinorHigh: number | null = null;
  let lastMinorLow: number | null = null;

  let pendingDir = 0;
  let pendingStartBar = 0;
  let pendingLvl: number | null = null;
  let pendingWick: number | null = null;
  let pendingScore: number | null = null;

  let activeEntry: number | null = null;
  let activeSL: number | null = null;
  let activeTP1: number | null = null;
  let activeTP2: number | null = null;
  let activeTP3: number | null = null;
  let activeDir = 0;
  let entryBar: number | null = null;
  let activeSweepLvl: number | null = null;
  let activeScore: number | null = null;
  let activeTarget: number | null = null;

  let tp1Reached = false;
  let tp2Reached = false;
  let tp3Reached = false;
  let beActive = false;

  let statWins = 0;
  let statLosses = 0;
  let formStr = '';

  let sweepTrend: -1 | 0 | 1 = 0;
  let lastSigType: 'bull' | 'bear' | null = null;
  let lastSigScore: number | null = null;

  const sweepVis: MirageSweepVis[] = [];
  const eqMarks: MirageEqMark[] = [];
  const qualifiedSweepMarks: MirageLspResult['qualifiedSweepMarks'] = [];
  const signalMarks: MirageLspResult['signalMarks'] = [];

  let lastClosedTrade: MirageTradeSnapshot | null = null;
  let displayTrade: MirageTradeSnapshot | null = null;

  const pushEq = (kind: 'eqh' | 'eql', t1: number, t2: number, lvl: number) => {
    eqMarks.push({ kind, t1, t2, lvl });
    if (eqMarks.length > MAX_EQ_MARKS) eqMarks.shift();
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const riskAtr = atrs[i] ?? 0;
    const hasVolume = c.volume > 0;
    const vSma = volSma(candles, i, opts.volLen);
    const volRatio = hasVolume && vSma > 0 ? c.volume / vSma : NaN;
    const volComp = opts.useVolume
      ? Number.isFinite(volRatio)
        ? Math.min(Math.max((volRatio - 1) / Math.max(opts.volMult - 1, 0.1), 0), 1)
        : 0.5
      : 0.5;
    const htfCompBull = opts.useHtf ? (htfBull[i] ? 1 : 0) : 0.5;
    const htfCompBear = opts.useHtf ? (htfBull[i] ? 0 : 1) : 0.5;

    if (i >= opts.minorLen * 2) {
      const mi = i - opts.minorLen;
      if (pivotHigh(candles, mi, opts.minorLen, opts.minorLen)) lastMinorHigh = candles[mi]!.high;
      if (pivotLow(candles, mi, opts.minorLen, opts.minorLen)) lastMinorLow = candles[mi]!.low;
    }

    if (i >= opts.swingLen * 2) {
      const pi = i - opts.swingLen;
      if (pivotHigh(candles, pi, opts.swingLen, opts.swingLen)) {
        const ph = candles[pi]!.high;
        hiLvl.push(ph);
        hiBar.push(pi);
        hiUsed.push(false);
        if (opts.showEquals && riskAtr > 0 && hiLvl.length >= 2) {
          const prevH = hiLvl[hiLvl.length - 2]!;
          const prevHB = hiBar[hiBar.length - 2]!;
          if (Math.abs(ph - prevH) <= riskAtr * opts.eqTol) {
            pushEq('eqh', candles[prevHB]!.time, c.time, Math.max(ph, prevH));
          }
        }
        if (hiLvl.length > MAX_STORED) {
          hiLvl.shift();
          hiBar.shift();
          hiUsed.shift();
        }
      }
      if (pivotLow(candles, pi, opts.swingLen, opts.swingLen)) {
        const pl = candles[pi]!.low;
        loLvl.push(pl);
        loBar.push(pi);
        loUsed.push(false);
        if (opts.showEquals && riskAtr > 0 && loLvl.length >= 2) {
          const prevL = loLvl[loLvl.length - 2]!;
          const prevLB = loBar[loBar.length - 2]!;
          if (Math.abs(pl - prevL) <= riskAtr * opts.eqTol) {
            pushEq('eql', candles[prevLB]!.time, c.time, Math.min(pl, prevL));
          }
        }
        if (loLvl.length > MAX_STORED) {
          loLvl.shift();
          loBar.shift();
          loUsed.shift();
        }
      }
    }

    let bullSweep = false;
    let bullLvl: number | null = null;
    let bullLvlBar: number | null = null;
    let bearSweep = false;
    let bearLvl: number | null = null;
    let bearLvlBar: number | null = null;

    for (let j = loLvl.length - 1; j >= 0; j--) {
      if (loUsed[j]) continue;
      const lvl = loLvl[j]!;
      if (i - loBar[j]! > opts.lookbackBars) continue;
      if (c.close < lvl) {
        loUsed[j] = true;
      } else if (c.low < lvl && c.close > lvl) {
        loUsed[j] = true;
        if (!bullSweep) {
          bullSweep = true;
          bullLvl = lvl;
          bullLvlBar = loBar[j]!;
        }
      }
    }

    for (let j = hiLvl.length - 1; j >= 0; j--) {
      if (hiUsed[j]) continue;
      const lvl = hiLvl[j]!;
      if (i - hiBar[j]! > opts.lookbackBars) continue;
      if (c.close > lvl) {
        hiUsed[j] = true;
      } else if (c.high > lvl && c.close < lvl) {
        hiUsed[j] = true;
        if (!bearSweep) {
          bearSweep = true;
          bearLvl = lvl;
          bearLvlBar = hiBar[j]!;
        }
      }
    }

    const bullScore = bullSweep && bullLvl != null ? sweepScore(1, bullLvl, c, riskAtr, volComp, htfCompBull) : 0;
    const bearScore = bearSweep && bearLvl != null ? sweepScore(-1, bearLvl, c, riskAtr, volComp, htfCompBear) : 0;
    const warmed = i >= warmup;
    const bullQ = bullSweep && bullScore >= opts.minScore && warmed;
    const bearQ = bearSweep && bearScore >= opts.minScore && warmed;

    if (bullQ && bullLvl != null) {
      qualifiedSweepMarks.push({ bar: i, time: c.time, dir: 1, price: c.low, score: bullScore });
      if (opts.showSweepLine || opts.showSweepPen) {
        sweepVis.push({
          dir: 1,
          originBar: bullLvlBar ?? i,
          sweepBar: i,
          originTime: candles[bullLvlBar ?? i]!.time,
          sweepTime: c.time,
          lvl: bullLvl,
          penetration: c.low,
          score: bullScore,
        });
        if (sweepVis.length > opts.maxSweepVis) sweepVis.shift();
      }
    }
    if (bearQ && bearLvl != null) {
      qualifiedSweepMarks.push({ bar: i, time: c.time, dir: -1, price: c.high, score: bearScore });
      if (opts.showSweepLine || opts.showSweepPen) {
        sweepVis.push({
          dir: -1,
          originBar: bearLvlBar ?? i,
          sweepBar: i,
          originTime: candles[bearLvlBar ?? i]!.time,
          sweepTime: c.time,
          lvl: bearLvl,
          penetration: c.high,
          score: bearScore,
        });
        if (sweepVis.length > opts.maxSweepVis) sweepVis.shift();
      }
    }

    let fireBull = false;
    let fireBear = false;
    let sigScore: number | null = null;
    let anchorExtreme: number | null = null;
    let sigLvl: number | null = null;

    if (opts.requireConfirm) {
      if (pendingDir !== 0 && i - pendingStartBar > opts.confirmWindow) pendingDir = 0;
      if (bullQ) {
        pendingDir = 1;
        pendingStartBar = i;
        pendingLvl = bullLvl;
        pendingWick = c.low;
        pendingScore = bullScore;
      }
      if (bearQ) {
        pendingDir = -1;
        pendingStartBar = i;
        pendingLvl = bearLvl;
        pendingWick = c.high;
        pendingScore = bearScore;
      }
      if (pendingDir === 1 && lastMinorHigh != null && c.close > lastMinorHigh) {
        fireBull = true;
        sigScore = pendingScore;
        anchorExtreme = pendingWick;
        sigLvl = pendingLvl;
        pendingDir = 0;
      }
      if (pendingDir === -1 && lastMinorLow != null && c.close < lastMinorLow) {
        fireBear = true;
        sigScore = pendingScore;
        anchorExtreme = pendingWick;
        sigLvl = pendingLvl;
        pendingDir = 0;
      }
    } else {
      if (bullQ) {
        fireBull = true;
        sigScore = bullScore;
        anchorExtreme = c.low;
        sigLvl = bullLvl;
      }
      if (bearQ) {
        fireBear = true;
        sigScore = bearScore;
        anchorExtreme = c.high;
        sigLvl = bearLvl;
      }
    }

    const sigConflict = fireBull && fireBear;
    const canOpen = activeDir === 0;
    const openLong = fireBull && !sigConflict && riskAtr > 0 && canOpen && anchorExtreme != null;
    const openShort = fireBear && !sigConflict && riskAtr > 0 && canOpen && anchorExtreme != null;

    if (openLong && anchorExtreme != null) {
      activeEntry = c.close;
      let rawSL = anchorExtreme - riskAtr * effBuf;
      let dist = Math.abs(activeEntry - rawSL);
      if (dist < riskAtr * 0.5) {
        rawSL = activeEntry - riskAtr * 0.5;
        dist = riskAtr * 0.5;
      }
      activeSL = rawSL;
      activeTP1 = activeEntry + dist * effTP1;
      activeTP2 = activeEntry + dist * effTP2;
      activeTP3 = activeEntry + dist * effTP3;
      activeDir = 1;
      entryBar = i;
      activeSweepLvl = sigLvl;
      activeScore = sigScore;
      activeTarget = opts.showTarget
        ? nearestOppositeTarget(1, activeEntry, hiLvl, loLvl, hiUsed, loUsed)
        : null;
      tp1Reached = false;
      tp2Reached = false;
      tp3Reached = false;
      beActive = false;
      sweepTrend = 1;
      if (opts.showSignals) {
        signalMarks.push({ bar: i, time: c.time, dir: 1, text: '롱 ▲' });
      }
    }

    if (openShort && anchorExtreme != null) {
      activeEntry = c.close;
      let rawSL = anchorExtreme + riskAtr * effBuf;
      let dist = Math.abs(rawSL - activeEntry);
      if (dist < riskAtr * 0.5) {
        rawSL = activeEntry + riskAtr * 0.5;
        dist = riskAtr * 0.5;
      }
      activeSL = rawSL;
      activeTP1 = activeEntry - dist * effTP1;
      activeTP2 = activeEntry - dist * effTP2;
      activeTP3 = activeEntry - dist * effTP3;
      activeDir = -1;
      entryBar = i;
      activeSweepLvl = sigLvl;
      activeScore = sigScore;
      activeTarget = opts.showTarget
        ? nearestOppositeTarget(-1, activeEntry, hiLvl, loLvl, hiUsed, loUsed)
        : null;
      tp1Reached = false;
      tp2Reached = false;
      tp3Reached = false;
      beActive = false;
      sweepTrend = -1;
      if (opts.showSignals) {
        signalMarks.push({ bar: i, time: c.time, dir: -1, text: '숏 ▼' });
      }
    }

    if (fireBull) {
      lastSigType = 'bull';
      lastSigScore = sigScore;
    }
    if (fireBear) {
      lastSigType = 'bear';
      lastSigScore = sigScore;
    }

    const effectiveSL = activeSL;
    const canCheckHit = activeDir !== 0 && entryBar != null && i > entryBar;
    const slHit =
      canCheckHit &&
      effectiveSL != null &&
      activeEntry != null &&
      (activeDir === 1 ? c.low <= effectiveSL : c.high >= effectiveSL);
    const tp1Hit =
      canCheckHit &&
      activeTP1 != null &&
      (activeDir === 1 ? c.high >= activeTP1 : c.low <= activeTP1);
    const tp2Hit =
      canCheckHit &&
      activeTP2 != null &&
      (activeDir === 1 ? c.high >= activeTP2 : c.low <= activeTP2);
    const tp3Hit =
      canCheckHit &&
      activeTP3 != null &&
      (activeDir === 1 ? c.high >= activeTP3 : c.low <= activeTP3);

    const tp1First = tp1Hit && !tp1Reached && !slHit;
    const tp2First = tp2Hit && !tp2Reached && !slHit;
    const tp3First = tp3Hit && !tp3Reached && !slHit;

    if (tp1First) tp1Reached = true;
    if (tp2First) tp2Reached = true;
    if (tp3First) tp3Reached = true;

    if (opts.useBreakEven && tp1First && !beActive && activeEntry != null) {
      activeSL = activeEntry;
      beActive = true;
    }

    if ((slHit || tp3Hit) && activeDir !== 0 && activeEntry != null) {
      const tradeWin = tp1Reached;
      if (tradeWin) statWins += 1;
      else statLosses += 1;
      formStr += tradeWin ? '▰' : '▱';
      if (formStr.length > FORM_LEN) formStr = formStr.slice(-FORM_LEN);

      lastClosedTrade = {
        dir: activeDir as 1 | -1,
        entryBar: entryBar!,
        entryTime: candles[entryBar!]!.time,
        entry: activeEntry,
        sl: effectiveSL ?? activeEntry,
        tp1: activeTP1!,
        tp2: activeTP2!,
        tp3: activeTP3!,
        sweepLvl: activeSweepLvl ?? activeEntry,
        score: activeScore ?? 0,
        tp1Reached,
        tp2Reached,
        tp3Reached,
        beActive,
        targetLvl: activeTarget,
        closed: true,
      };

      activeDir = 0;
      activeSL = null;
      activeTP1 = null;
      activeTP2 = null;
      activeTP3 = null;
      activeEntry = null;
      entryBar = null;
      activeSweepLvl = null;
      activeScore = null;
      activeTarget = null;
      tp1Reached = false;
      tp2Reached = false;
      tp3Reached = false;
      beActive = false;
    }

    if (activeDir !== 0 && activeEntry != null && entryBar != null) {
      displayTrade = {
        dir: activeDir as 1 | -1,
        entryBar,
        entryTime: candles[entryBar]!.time,
        entry: activeEntry,
        sl: activeSL ?? activeEntry,
        tp1: activeTP1!,
        tp2: activeTP2!,
        tp3: activeTP3!,
        sweepLvl: activeSweepLvl ?? activeEntry,
        score: activeScore ?? 0,
        tp1Reached,
        tp2Reached,
        tp3Reached,
        beActive,
        targetLvl: activeTarget,
        closed: false,
      };
    }
  }

  const lastTime = candles[n - 1]?.time ?? 0;
  const barDur =
    n >= 2 ? Math.max(1, (candles[n - 1]!.time - candles[n - 2]!.time)) : 900;

  const restingLiq: MirageRestingLiq[] = [];
  if (opts.showLiquidity) {
    let drawnH = 0;
    for (let j = hiLvl.length - 1; j >= 0 && drawnH < opts.maxLiq; j--) {
      if (hiUsed[j]) continue;
      restingLiq.push({
        side: 'bsl',
        lvl: hiLvl[j]!,
        bar: hiBar[j]!,
        time: candles[hiBar[j]!]?.time ?? lastTime,
      });
      drawnH++;
    }
    let drawnL = 0;
    for (let j = loLvl.length - 1; j >= 0 && drawnL < opts.maxLiq; j--) {
      if (loUsed[j]) continue;
      restingLiq.push({
        side: 'ssl',
        lvl: loLvl[j]!,
        bar: loBar[j]!,
        time: candles[loBar[j]!]?.time ?? lastTime,
      });
      drawnL++;
    }
  }

  const tfLabel = normalizeChartTimeframe(timeframe ?? '15m').replace('1M', '월').replace('1w', '주');
  const trendKo =
    sweepTrend === 1 ? '상승' : sweepTrend === -1 ? '하락' : '중립';
  const headerTone: MirageDashboard['headerTone'] =
    sweepTrend === 1 ? 'bull' : sweepTrend === -1 ? 'bear' : 'flat';
  const htfBiasKo = !opts.useHtf
    ? '끔'
    : htfBull[n - 1]
      ? '상승'
      : '하락';
  const signalKo =
    displayTrade?.dir === 1 ? '롱' : displayTrade?.dir === -1 ? '숏' : '대기';
  const lastSweepKo =
    lastSigType == null
      ? '—'
      : `${lastSigType === 'bull' ? '상승' : '하락'} ${lastSigScore != null ? Math.round(lastSigScore) : ''}`.trim();

  const closedTrades = statWins + statLosses;
  const winRate = closedTrades > 0 ? (statWins / closedTrades) * 100 : 0;

  const fmtPx = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? '—' : fmtMirageCryptoPrice(v);

  const dashTrade: MirageDashboard['trade'] = displayTrade
    ? {
        flat: false,
        statusKo: displayTrade.dir === 1 ? '롱 포지션' : '숏 포지션',
        sl: `${displayTrade.beActive ? '본절 @ ' : ''}${fmtPx(displayTrade.sl)}`,
        tp1: `${displayTrade.tp1Reached ? '✓ ' : ''}${fmtPx(displayTrade.tp1)}`,
        tp2: `${displayTrade.tp2Reached ? '✓ ' : ''}${fmtPx(displayTrade.tp2)}`,
        tp3: `${displayTrade.tp3Reached ? '✓ ' : ''}${fmtPx(displayTrade.tp3)}`,
        rr: `${effTP1.toFixed(1)}R`,
        slDistPct:
          displayTrade.entry !== 0
            ? `${((Math.abs(displayTrade.entry - displayTrade.sl) / displayTrade.entry) * 100).toFixed(2)}%`
            : '—',
      }
    : {
        flat: true,
        statusKo: '무포지션 · 스윕 대기 중',
      };

  const dashboard: MirageDashboard = {
    headerKo: `◆ Mirage · ${trendKo}`,
    headerTone,
    market: {
      trendKo,
      htfBiasKo,
      signalKo,
      lastSweepKo,
      timeframe: tfLabel,
    },
    trade: dashTrade,
    stats: {
      trades: closedTrades,
      wins: statWins,
      losses: statLosses,
      winRateKo:
        closedTrades > 0 ? `${winRate.toFixed(1)}%  ${buildGauge(winRate, 100, 8)}` : '—',
      formKo: formStr || '—',
    },
  };

  const tradeForSummary = displayTrade ?? lastClosedTrade;
  let summaryKo = `Mirage LSP · ${lastSweepKo}`;
  if (tradeForSummary) {
    const dirKo = tradeForSummary.dir === 1 ? '롱' : '숏';
    summaryKo = `Mirage · ${dirKo} · 진입 ${fmtPx(tradeForSummary.entry)} · 손절 ${fmtPx(tradeForSummary.sl)} · 스윕 ${Math.round(tradeForSummary.score)}`;
  } else if (lastSigType) {
    summaryKo = `Mirage · ${lastSweepKo} · ${dashTrade.statusKo}`;
  }

  return {
    options: opts,
    activeTrade: displayTrade,
    lastClosedTrade,
    sweepVis,
    eqMarks,
    restingLiq,
    qualifiedSweepMarks,
    signalMarks,
    sweepTrend,
    lastSigType,
    lastSigScore,
    dashboard,
    summaryKo,
    barDur,
    lineForwardSec: barDur * LINE_FORWARD_BARS,
    lineUpdateSec: barDur * LINE_UPDATE_BARS,
  };
}

export { fmtPctFromEntry, LINE_FORWARD_BARS, LINE_UPDATE_BARS };
