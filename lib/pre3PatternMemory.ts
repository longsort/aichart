import fs from 'fs';
import path from 'path';
import type { Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

/** OB·수급 존 위 장대봉만 pre3 반짝임 허용 */
function zonePriceBounds(o: OverlayItem): { lo: number; hi: number } | null {
  const p1 = o.price1 ?? o.y1;
  const p2 = o.price2 ?? o.y2;
  if (typeof p1 !== 'number' || typeof p2 !== 'number' || !Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { lo: Math.min(p1, p2), hi: Math.max(p1, p2) };
}

function isObOrSupplyDemandOverlay(o: OverlayItem): boolean {
  if (o.kind === 'ob') return true;
  if (o.kind === 'demandZone' || o.kind === 'supplyZone') return true;
  const id = String(o.id || '');
  if (id.startsWith('whale-auto-bu-ob') || id.startsWith('whale-auto-be-ob')) return true;
  const lab = String(o.label || '');
  if (lab.startsWith('Bu-OB') || lab.startsWith('Be-OB')) return true;
  return false;
}

/** 터치한 OB·수급 존 중 confidence 최고 1개 (Pre3 매칭 띠용) */
export function pickBestObOverlappingCandle(c: Candle, overlays: OverlayItem[] | undefined): OverlayItem | null {
  if (!overlays?.length) return null;
  let best: OverlayItem | null = null;
  let bestConf = -Infinity;
  for (const o of overlays) {
    if (!isObOrSupplyDemandOverlay(o)) continue;
    if (!candleTouchesObOrCoreZone(c, [o])) continue;
    const conf = Number(o.confidence);
    const sc = Number.isFinite(conf) ? conf : 0;
    if (sc > bestConf) {
      bestConf = sc;
      best = o;
    }
  }
  return best;
}

/** 장대봉(또는 후보 봉)이 OB/수급 존 가격대와 겹치는지 */
export function candleTouchesObOrCoreZone(c: Candle, overlays: OverlayItem[] | undefined, epsRatio = 0.0012): boolean {
  if (!overlays?.length) return false;
  const ref = Math.max(1e-9, Math.abs(c.close));
  const eps = ref * epsRatio;
  const mid = (c.high + c.low) / 2;
  for (const o of overlays) {
    if (!isObOrSupplyDemandOverlay(o)) continue;
    const b = zonePriceBounds(o);
    if (!b) continue;
    const inBand = (p: number) => p >= b.lo - eps && p <= b.hi + eps;
    if (inBand(mid) || inBand(c.close) || (c.low <= b.hi + eps && c.high >= b.lo - eps)) return true;
  }
  return false;
}

export type Pre3PatternMemoryRow = {
  direction: 'bull' | 'bear';
  feature: number[];
};

export type Pre3PatternMemory = {
  symbol: string;
  timeframe: string;
  version: 1;
  /** 1=비율, 2=직전3봉 ATR, 3=2+장대(OB)봉·직전3봉 합거래량, 4=직전2봉+장대(기본·3과 동일 목적·차원 다름) */
  featureSchema?: 1 | 2 | 3 | 4;
  generatedAt: number;
  years: number;
  thresholds: { bodyRatio: number; volumeZ: number };
  totalCandles: number;
  totalBigCandles: number;
  rows: Pre3PatternMemoryRow[];
};

export type Pre3SparkleSignal = {
  enabled: boolean;
  matched: boolean;
  similarity: number;
  threshold: number;
  direction: 'LONG' | 'SHORT' | 'NONE';
  sourceSamples: number;
  /** 유사도·존은 통과했으나 마지막 봉이 아직 마감 전(확정 반짝 대기) */
  waitingBarClose?: boolean;
  /** 매칭에 사용한 특징 스키마(디버그) */
  featureSchemaUsed?: 1 | 2 | 3 | 4;
};

const memoryCache = new Map<string, Pre3PatternMemory | null>();

/**
 * pre3 메모리·유사도 적용 TF (1m/3m/5m 등은 미지원). 메모리 JSON: `data/pre3-memory/<SYMBOL>_<tf>.json`
 * npm `data:pre3-memory*` 의 `--tf` 는 이 목록과 동일하게 유지할 것.
 */
export const PRE3_SUPPORTED_TIMEFRAMES = ['15m', '1h', '4h', '1d', '1w', '1M'] as const;

function isPre3Timeframe(tf: string): boolean {
  return (PRE3_SUPPORTED_TIMEFRAMES as readonly string[]).includes(tf);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 임계가 0.99~1(거의 100%)일 때 부동소수 코사인 유사도가 1에 못 미치는 경우를 허용 */
export function pre3SimilarityMeetsThreshold(sim: number, threshold: number): boolean {
  const t = Math.min(1, Math.max(0, threshold));
  const tol = t >= 0.99 ? 2e-4 : 0;
  return sim + tol >= t;
}

function bodyRatio(c: Candle): number {
  const range = Math.max(1e-9, c.high - c.low);
  return clamp01(Math.abs(c.close - c.open) / range);
}

function upperWickRatio(c: Candle): number {
  const range = Math.max(1e-9, c.high - c.low);
  const top = Math.max(c.open, c.close);
  return clamp01((c.high - top) / range);
}

function lowerWickRatio(c: Candle): number {
  const range = Math.max(1e-9, c.high - c.low);
  const bot = Math.min(c.open, c.close);
  return clamp01((bot - c.low) / range);
}

function dirSign(c: Candle): number {
  return c.close >= c.open ? 1 : -1;
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function stdev(nums: number[], mu: number): number {
  if (!nums.length) return 1;
  const v = nums.reduce((s, x) => s + (x - mu) * (x - mu), 0) / nums.length;
  return Math.sqrt(v) || 1;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
}

function memoryFeatureSchema(m: Pre3PatternMemory): 1 | 2 | 3 | 4 {
  const s = m.featureSchema;
  if (s === 4) return 4;
  if (s === 3) return 3;
  if (s === 2) return 2;
  return 1;
}

/** Wilder ATR(period) — 첫 p구간 SMA 후 Wilder 스무딩 */
function computeAtrSeries(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const tr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const prevC = i > 0 ? candles[i - 1].close : c.open;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - prevC), Math.abs(c.low - prevC));
  }
  const atr: number[] = new Array(n).fill(0);
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 스키마 1: 기존 — 몸통·꼬리 비율 0~1 */
function buildPre3FeatureSchema1(c3: Candle, c2: Candle, c1: Candle, volMu: number, volSigma: number): number[] {
  const vols = [c3, c2, c1].map((c) => (c.volume - volMu) / Math.max(1e-9, volSigma));
  const out: number[] = [];
  for (const c of [c3, c2, c1]) {
    out.push(bodyRatio(c), upperWickRatio(c), lowerWickRatio(c), dirSign(c));
  }
  out.push(...vols);
  return out;
}

/** 스키마 2: 직전 3봉 각각 몸통·꼬리를 해당 봉 ATR로 나눔(상한 캡) */
function buildPre3FeatureSchema2(
  candles: Candle[],
  i3: number,
  i2: number,
  i1: number,
  volMu: number,
  volSigma: number,
  atrSeries: number[]
): number[] {
  const idxs = [i3, i2, i1];
  const vols = idxs.map((i) => (candles[i].volume - volMu) / Math.max(1e-9, volSigma));
  const out: number[] = [];
  for (const i of idxs) {
    const c = candles[i];
    const range = Math.max(1e-9, c.high - c.low);
    const atr = Math.max(atrSeries[i] ?? 0, range * 0.02, 1e-9);
    const body = clamp(Math.abs(c.close - c.open) / atr, 0, 8);
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);
    const uwick = clamp((c.high - top) / atr, 0, 8);
    const lwick = clamp((bot - c.low) / atr, 0, 8);
    out.push(body, uwick, lwick, dirSign(c));
  }
  out.push(...vols);
  return out;
}

/** 스키마 3: 직전 3봉(스키마2) + 장대 봉 OB 형태·거래량·레인지/ATR·직전3봉 합 거래량 z·직전합/장대 거래량 로그비 */
function buildPre3FeatureSchema3(
  candles: Candle[],
  bigIdx: number,
  volMu: number,
  volSigma: number,
  atrSeries: number[]
): number[] {
  const i3 = bigIdx - 3;
  const i2 = bigIdx - 2;
  const i1 = bigIdx - 1;
  const base = buildPre3FeatureSchema2(candles, i3, i2, i1, volMu, volSigma, atrSeries);
  const big = candles[bigIdx];
  const range = Math.max(1e-9, big.high - big.low);
  const atrB = Math.max(atrSeries[bigIdx] ?? 0, range * 0.02, 1e-9);
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

/** 스키마 4: 직전 2봉만 — 스키마2와 동일 스케일(몸통·꼬리/ATR), 볼륨 z 2개 */
function buildPre3FeatureSchema4TwoPre(
  candles: Candle[],
  i2: number,
  i1: number,
  volMu: number,
  volSigma: number,
  atrSeries: number[]
): number[] {
  const idxs = [i2, i1];
  const vols = idxs.map((i) => (candles[i].volume - volMu) / Math.max(1e-9, volSigma));
  const out: number[] = [];
  for (const i of idxs) {
    const c = candles[i];
    const range = Math.max(1e-9, c.high - c.low);
    const atr = Math.max(atrSeries[i] ?? 0, range * 0.02, 1e-9);
    const body = clamp(Math.abs(c.close - c.open) / atr, 0, 8);
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);
    const uwick = clamp((c.high - top) / atr, 0, 8);
    const lwick = clamp((bot - c.low) / atr, 0, 8);
    out.push(body, uwick, lwick, dirSign(c));
  }
  out.push(...vols);
  return out;
}

/** 스키마 4: 직전 2봉 + 장대(스키마3와 동일 확장 항목, 직전 합 거래량은 2봉 기준 z) */
function buildPre3FeatureSchema4Full(
  candles: Candle[],
  bigIdx: number,
  volMu: number,
  volSigma: number,
  atrSeries: number[]
): number[] {
  const i2 = bigIdx - 2;
  const i1 = bigIdx - 1;
  const base = buildPre3FeatureSchema4TwoPre(candles, i2, i1, volMu, volSigma, atrSeries);
  const big = candles[bigIdx];
  const range = Math.max(1e-9, big.high - big.low);
  const atrB = Math.max(atrSeries[bigIdx] ?? 0, range * 0.02, 1e-9);
  const body = clamp(Math.abs(big.close - big.open) / atrB, 0, 8);
  const top = Math.max(big.open, big.close);
  const bot = Math.min(big.open, big.close);
  const uwick = clamp((big.high - top) / atrB, 0, 8);
  const lwick = clamp((bot - big.low) / atrB, 0, 8);
  const bigVolZ = (Number(big.volume || 0) - volMu) / Math.max(1e-9, volSigma);
  const rangeAtr = clamp(range / atrB, 0, 8);
  const preVolSum = Number(candles[i2].volume || 0) + Number(candles[i1].volume || 0);
  const preVolSumZ = (preVolSum - 2 * volMu) / Math.max(1e-9, volSigma * Math.SQRT2);
  const bv = Math.max(0, Number(big.volume || 0));
  const preToBigVolRatio = clamp(Math.log1p(preVolSum) - Math.log1p(bv), -4, 4);
  return [...base, body, uwick, lwick, dirSign(big), rangeAtr, bigVolZ, clamp(preVolSumZ, -6, 6), preToBigVolRatio];
}

function buildPre3FeatureForBigIndex(
  candles: Candle[],
  bigIdx: number,
  volMu: number,
  volSigma: number,
  schema: 1 | 2 | 3 | 4,
  atrSeries: number[]
): number[] {
  const i3 = bigIdx - 3;
  const i2 = bigIdx - 2;
  const i1 = bigIdx - 1;
  if (schema === 4) return buildPre3FeatureSchema4Full(candles, bigIdx, volMu, volSigma, atrSeries);
  if (schema === 3) return buildPre3FeatureSchema3(candles, bigIdx, volMu, volSigma, atrSeries);
  if (schema === 2) return buildPre3FeatureSchema2(candles, i3, i2, i1, volMu, volSigma, atrSeries);
  return buildPre3FeatureSchema1(candles[i3], candles[i2], candles[i1], volMu, volSigma);
}

export function isPre3LastCandleClosed(timeframe: string, last: Candle, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const t = typeof last.time === 'number' ? last.time : 0;
  if (t <= 0) return true;
  const dur = candleBarDurationSec(timeframe, t);
  return nowSec >= t + dur;
}

function memoryFilePath(symbol: string, timeframe: string): string {
  return path.join(process.cwd(), 'data', 'pre3-memory', `${symbol.toUpperCase()}_${timeframe}.json`);
}

export function loadPre3PatternMemory(symbol: string, timeframe: string): Pre3PatternMemory | null {
  const key = `${symbol.toUpperCase()}|${timeframe}`;
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;
  try {
    const fp = memoryFilePath(symbol, timeframe);
    if (!fs.existsSync(fp)) {
      memoryCache.set(key, null);
      return null;
    }
    const raw = fs.readFileSync(fp, 'utf8');
    const j = JSON.parse(raw) as Pre3PatternMemory;
    if (!j || !Array.isArray(j.rows)) {
      memoryCache.set(key, null);
      return null;
    }
    memoryCache.set(key, j);
    return j;
  } catch {
    memoryCache.set(key, null);
    return null;
  }
}

/** 오프라인 스크립트와 동일 임계로, 현재 캔들만으로 패턴 행 생성 (JSON 없을 때 폴백) */
const MIN_CANDLES_EMBEDDED = 32;
const MAX_EMBEDDED_ROWS = 4000;
const MAX_MERGED_ROWS = 14000;

function buildEmbeddedMemoryFromCandles(
  symbol: string,
  timeframe: string,
  candles: Candle[]
): Pre3PatternMemory | null {
  if (candles.length < MIN_CANDLES_EMBEDDED) return null;
  const bodyThr = 0.62;
  const volZThr = 0.9;
  const volArr = candles.map((c) => Number(c.volume || 0));
  const volMu = mean(volArr);
  const volSigma = stdev(volArr, volMu);
  const atrSeries = computeAtrSeries(candles, 14);
  const rows: Pre3PatternMemoryRow[] = [];
  for (let i = 2; i < candles.length - 1; i++) {
    const big = candles[i];
    const br = bodyRatio(big);
    const vz = (big.volume - volMu) / Math.max(1e-9, volSigma);
    if (br < bodyThr || vz < volZThr) continue;
    rows.push({
      direction: big.close >= big.open ? 'bull' : 'bear',
      feature: buildPre3FeatureForBigIndex(candles, i, volMu, volSigma, 4, atrSeries),
    });
  }
  const capped = rows.length > MAX_EMBEDDED_ROWS ? rows.slice(-MAX_EMBEDDED_ROWS) : rows;
  if (capped.length === 0) return null;
  return {
    symbol,
    timeframe,
    version: 1,
    featureSchema: 4,
    generatedAt: Date.now(),
    years: 0,
    thresholds: { bodyRatio: bodyThr, volumeZ: volZThr },
    totalCandles: candles.length,
    totalBigCandles: capped.length,
    rows: capped,
  };
}

/** `data/pre3-memory/*.json` 우선; 없거나 비면 이번 요청 캔들로 즉시 메모리 구축 (일·주·월 동작 보장) */
export function resolvePre3MemoryForCandles(symbol: string, timeframe: string, candles: Candle[]): Pre3PatternMemory | null {
  const disk = loadPre3PatternMemory(symbol, timeframe);
  const embedded = buildEmbeddedMemoryFromCandles(symbol, timeframe, candles);
  if (!disk || disk.rows.length === 0) return embedded;
  if (!embedded || embedded.rows.length === 0) return disk;

  const diskSchema = memoryFeatureSchema(disk);
  const embSchema = memoryFeatureSchema(embedded);
  /** 디스크(구 스키마)와 임베디드(직전2봉·스키마4)가 다르면 현재 캔들 기반 임베디드 우선 */
  if (diskSchema !== embSchema) return embedded.rows.length ? embedded : disk;

  const mergedRows = [...disk.rows, ...embedded.rows];
  const rows = mergedRows.length > MAX_MERGED_ROWS ? mergedRows.slice(-MAX_MERGED_ROWS) : mergedRows;
  return {
    ...disk,
    generatedAt: Date.now(),
    totalCandles: Math.max(Number(disk.totalCandles || 0), Number(embedded.totalCandles || 0)),
    totalBigCandles: rows.length,
    rows,
  };
}

function getMemoryForPre3(symbol: string, timeframe: string, candles: Candle[]): Pre3PatternMemory | null {
  return resolvePre3MemoryForCandles(symbol, timeframe, candles);
}

/**
 * 특정 인덱스의 장대봉에 대해 과거 메모리와의 최대 코사인 유사도 (장대·OB 조건 미충족 시 0).
 */
export function computePre3SimilarityAtBigIndex(
  candles: Candle[],
  bigIdx: number,
  memory: Pre3PatternMemory,
  requireObZone: boolean,
  zoneOverlays: OverlayItem[] | undefined
): number {
  const requireOb = requireObZone !== false;
  if (bigIdx < 2 || bigIdx >= candles.length) return 0;
  const big = candles[bigIdx];
  const bodyThr = memory.thresholds?.bodyRatio ?? 0.62;
  const volZThr = memory.thresholds?.volumeZ ?? 0.9;
  const volArr = candles.map((c) => Number(c.volume || 0));
  const volMu = mean(volArr);
  const volSigma = stdev(volArr, volMu);
  const br = bodyRatio(big);
  const vz = (Number(big.volume || 0) - volMu) / Math.max(1e-9, volSigma);
  if (br < bodyThr || vz < volZThr) return 0;
  if (requireOb && !candleTouchesObOrCoreZone(big, zoneOverlays)) return 0;
  const schema = memoryFeatureSchema(memory);
  const atrSeries = schema >= 2 ? computeAtrSeries(candles, 14) : [];
  const feat = buildPre3FeatureForBigIndex(candles, bigIdx, volMu, volSigma, schema, atrSeries);
  let bestBull = -1;
  let bestBear = -1;
  for (const row of memory.rows) {
    if (row.feature.length !== feat.length) continue;
    const s = cosineSim(feat, row.feature);
    if (row.direction === 'bull') bestBull = Math.max(bestBull, s);
    else bestBear = Math.max(bestBear, s);
  }
  return Math.max(bestBull, bestBear, 0);
}

export type Pre3SparkleHit = {
  time: number;
  direction: 'LONG' | 'SHORT';
  similarity: number;
};

/**
 * 과거 구간: 장대봉(메모리와 동일 임계)이면서 직전 2캔(스키마4)·기록과 유사도 이상인 봉들을 수집.
 * 봉 수가 많으면 최신 쪽부터 maxHits개만 유지(차트 부하 완화).
 */
export function computePre3SparkleHistoryFromMemory(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  threshold?: number;
  /** 기본 400 — 넘치면 시간순으로 잘라 최신 구간 위주 */
  maxHits?: number;
  /** OB/수급 존 위 장대봉만 반짝임 (기본 true) */
  requireObZone?: boolean;
  coreZoneOverlays?: OverlayItem[];
  /** true면 진행 중인 맨 마지막 봉은 히스토리 반짝에서 제외 */
  excludeOpenLastBar?: boolean;
}): Pre3SparkleHit[] {
  const { symbol, timeframe, candles } = params;
  const requireOb = params.requireObZone !== false;
  const zoneOverlays = params.coreZoneOverlays;
  const threshold = Number.isFinite(params.threshold) ? Number(params.threshold) : 1;
  const maxHits = Math.max(20, Math.min(2000, params.maxHits ?? 400));
  const excludeOpenLast = params.excludeOpenLastBar === true;
  if (!isPre3Timeframe(timeframe) || candles.length < 3) return [];

  const memory = getMemoryForPre3(symbol, timeframe, candles);
  if (!memory || !memory.rows.length) return [];

  const schema = memoryFeatureSchema(memory);
  const bodyThr = memory.thresholds?.bodyRatio ?? 0.62;
  const volZThr = memory.thresholds?.volumeZ ?? 0.9;

  const volArr = candles.map((c) => Number(c.volume || 0));
  const volMu = mean(volArr);
  const volSigma = stdev(volArr, volMu);
  const atrSeries = schema >= 2 ? computeAtrSeries(candles, 14) : [];
  const n = candles.length;
  const last = candles[n - 1];
  const lastClosed = isPre3LastCandleClosed(timeframe, last);
  const iEnd = excludeOpenLast && !lastClosed ? n - 1 : n;

  const hits: Pre3SparkleHit[] = [];
  for (let i = 2; i < iEnd; i++) {
    const big = candles[i];
    const br = bodyRatio(big);
    const vz = (big.volume - volMu) / Math.max(1e-9, volSigma);
    if (br < bodyThr || vz < volZThr) continue;
    if (requireOb && !candleTouchesObOrCoreZone(big, zoneOverlays)) continue;

    const feat = buildPre3FeatureForBigIndex(candles, i, volMu, volSigma, schema, atrSeries);
    let bestBull = -1;
    let bestBear = -1;
    for (const row of memory.rows) {
      if (row.feature.length !== feat.length) continue;
      const s = cosineSim(feat, row.feature);
      if (row.direction === 'bull') bestBull = Math.max(bestBull, s);
      else bestBear = Math.max(bestBear, s);
    }
    const similarity = Math.max(bestBull, bestBear, 0);
    if (!pre3SimilarityMeetsThreshold(similarity, threshold)) continue;
    /** 차트 색: 장대양봉=초록(LONG), 장대음봉=오렌지·빨강(SHORT) — 패턴 롱/숏과 무관 */
    const direction: 'LONG' | 'SHORT' = big.close >= big.open ? 'LONG' : 'SHORT';
    /** 반짝: 직전 2캔 + 장대 본봉(분석 구간과 동일) */
    for (const c of [candles[i - 2], candles[i - 1], big]) {
      hits.push({ time: c.time as number, direction, similarity });
    }
  }

  if (hits.length <= maxHits) return hits;
  hits.sort((a, b) => a.time - b.time);
  return hits.slice(-maxHits);
}

export function computePre3SparkleFromMemory(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  threshold?: number;
  requireObZone?: boolean;
  coreZoneOverlays?: OverlayItem[];
  /** true(기본): 마지막 봉이 마감된 뒤에만 matched — 실시간 깜빡임 완화 */
  confirmOnCloseOnly?: boolean;
}): Pre3SparkleSignal {
  const { symbol, timeframe, candles } = params;
  const requireOb = params.requireObZone !== false;
  const zoneOverlays = params.coreZoneOverlays;
  const threshold = Number.isFinite(params.threshold) ? Number(params.threshold) : 1;
  const confirmOnCloseOnly = params.confirmOnCloseOnly !== false;
  if (!isPre3Timeframe(timeframe) || candles.length < 3) {
    return { enabled: false, matched: false, similarity: 0, threshold, direction: 'NONE', sourceSamples: 0 };
  }
  const memory = getMemoryForPre3(symbol, timeframe, candles);
  if (!memory || !memory.rows.length) {
    return { enabled: false, matched: false, similarity: 0, threshold, direction: 'NONE', sourceSamples: 0 };
  }

  const schema = memoryFeatureSchema(memory);
  const volArr = candles.map((c) => Number(c.volume || 0));
  const volMu = mean(volArr);
  const volSigma = stdev(volArr, volMu);
  const n = candles.length;
  const atrSeries = schema >= 2 ? computeAtrSeries(candles, 14) : [];
  const nowFeature = buildPre3FeatureForBigIndex(candles, n - 1, volMu, volSigma, schema, atrSeries);

  let bestBull = -1;
  let bestBear = -1;
  for (const row of memory.rows) {
    if (row.feature.length !== nowFeature.length) continue;
    const s = cosineSim(nowFeature, row.feature);
    if (row.direction === 'bull') bestBull = Math.max(bestBull, s);
    else bestBear = Math.max(bestBear, s);
  }
  const similarity = Math.max(bestBull, bestBear, 0);
  const last = candles[n - 1];
  const zoneOk = !requireOb || candleTouchesObOrCoreZone(last, zoneOverlays);
  const lastClosed = isPre3LastCandleClosed(timeframe, last);
  const baseOk = pre3SimilarityMeetsThreshold(similarity, threshold) && zoneOk;
  const waitingBarClose = Boolean(confirmOnCloseOnly && baseOk && !lastClosed);
  const matched = baseOk && (!confirmOnCloseOnly || lastClosed);
  const bodyDir: 'LONG' | 'SHORT' = last.close >= last.open ? 'LONG' : 'SHORT';
  const direction: 'LONG' | 'SHORT' | 'NONE' = matched ? bodyDir : waitingBarClose ? bodyDir : 'NONE';
  return {
    enabled: true,
    matched,
    similarity,
    threshold,
    direction,
    sourceSamples: memory.rows.length,
    waitingBarClose: waitingBarClose || undefined,
    featureSchemaUsed: schema,
  };
}

