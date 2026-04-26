import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

const FEATURE_K = 14;
const MIN_ANCHOR_DISTANCE = 28;
const MAX_SCAN = 520;

export type CandleAnalysisPathTuning = {
  /** 유사 구간 최소 개수 (2~8) */
  minMatches?: number;
  /** 0이면 TF별 자동, 아니면 고정 H봉 */
  horizonBars?: number;
  /** 상위 매칭 개수 (3~12) */
  topMatches?: number;
  /** 거래량(log) Z 차이 가중 (0이면 미사용) */
  weightVolume?: number;
  /** RSI(14) 차이 가중 (0이면 미사용) */
  weightRsi?: number;
  /** 청록 경로: 엔진 롱/숏 편향으로 궤적 증폭 (0.85~1.35 권장) */
  memoryPathSteepen?: number;
  /** 보라 이론 경로 마지막 구간 증폭 */
  theoryPathSteepen?: number;
  /** 현재가→목표 한 줄 직진 보라 점선(3단 이론 경로와 별도) */
  directTheoryPath?: boolean;
};

function defaultHorizonBars(timeframe: string): number {
  const tf = String(timeframe || '1h').toLowerCase();
  if (tf === '1m' || tf === '3m' || tf === '5m') return 36;
  if (tf === '15m') return 32;
  if (tf === '1h') return 28;
  if (tf === '4h') return 24;
  if (tf === '1d') return 18;
  if (tf === '1w' || tf === '1W') return 12;
  return 24;
}

function atrLike(candles: Candle[], idx: number, period = 14): number {
  const from = Math.max(1, idx - period + 1);
  let sumTr = 0;
  let count = 0;
  for (let i = from; i <= idx; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1]?.close ?? c.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    sumTr += tr;
    count += 1;
  }
  return count > 0 ? sumTr / count : Math.max(1e-9, Math.abs(candles[idx]?.close ?? 1) * 0.01);
}

function precomputeRsi(candles: Candle[], period = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  let avgG = 0;
  let avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) avgG += d;
    else avgL -= d;
  }
  avgG /= period;
  avgL /= period;
  const rs0 = avgL < 1e-12 ? 100 : avgG / avgL;
  out[period] = 100 - 100 / (1 + rs0);
  for (let i = period + 1; i < n; i++) {
    const d = candles[i].close - candles[i - 1].close;
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    const rs = avgL < 1e-12 ? 100 : avgG / avgL;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function logVolZAt(candles: Candle[], endIdx: number, k: number): number | null {
  const start = endIdx - k + 1;
  if (start < 0 || endIdx >= candles.length) return null;
  const logs: number[] = [];
  for (let i = start; i <= endIdx; i++) logs.push(Math.log(Math.max(1e-12, candles[i].volume)));
  const last = logs[logs.length - 1];
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  let v = 0;
  for (const x of logs) v += (x - mean) ** 2;
  const std = Math.sqrt(v / Math.max(1, logs.length));
  if (std < 1e-9) return 0;
  return (last - mean) / std;
}

type PriceFeat = { rets: number[]; volNorm: number };

function priceFeatureAt(candles: Candle[], endIdx: number, k: number): PriceFeat | null {
  if (endIdx < k || endIdx >= candles.length) return null;
  const start = endIdx - k + 1;
  const rets: number[] = [];
  for (let i = start + 1; i <= endIdx; i++) {
    const a = candles[i - 1].close;
    const b = candles[i].close;
    if (!(a > 0) || !(b > 0)) return null;
    rets.push(Math.log(b / a));
  }
  const atr = atrLike(candles, endIdx, Math.min(14, k - 1));
  const px = candles[endIdx].close;
  if (!(px > 0)) return null;
  rets.push(atr / px);
  return { rets, volNorm: atr / px };
}

function euclidean1(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function weightedFeatureDist(
  pa: PriceFeat,
  pb: PriceFeat,
  vzA: number | null,
  vzB: number | null,
  rsiA: number | null,
  rsiB: number | null,
  wV: number,
  wR: number
): number {
  let s = euclidean1(pa.rets, pb.rets) ** 2;
  if (wV > 0 && vzA != null && vzB != null) s += (wV * (vzA - vzB)) ** 2;
  if (wR > 0 && rsiA != null && rsiB != null) s += (wR * (rsiA - rsiB)) ** 2;
  return Math.sqrt(s);
}

function biasFromAnalysis(analysis: AnalyzeResponse | null | undefined): number {
  if (!analysis) return 0;
  const so = analysis.smartOverlay;
  if (so) {
    const pl = Number(so.prob_long) || 0;
    const ps = Number(so.prob_short) || 0;
    return Math.max(-1, Math.min(1, (pl - ps) / 100));
  }
  if (analysis.verdict === 'LONG') return 0.35;
  if (analysis.verdict === 'SHORT') return -0.35;
  return 0;
}

function applySteepenToRel(rel: number[], H: number, bias: number, steepen: number): void {
  const st = Math.max(0.75, Math.min(1.45, steepen));
  for (let j = 1; j <= H; j++) {
    const t = j / H;
    const lean = 1 + bias * 0.34 * t;
    rel[j] = rel[j] * st * lean;
    rel[j] = Math.max(-0.52, Math.min(0.52, rel[j]));
  }
}

/** 유사 과거 평균이 횡보여도 롱/숏 편향 방향으로 눈에 띄는 대각선이 되게 ATR 스케일 램프 */
function applyVisualAngleBiasToRel(rel: number[], H: number, bias: number, px: number, atr: number): void {
  if (!(px > 0) || H < 1 || Math.abs(bias) < 0.05) return;
  const atrR = Math.min(0.22, Math.max(0.0035, atr / px));
  const cap = Math.min(0.24, atrR * Math.sqrt(H) * 3.4 * Math.min(1, Math.abs(bias)));
  for (let j = 1; j <= H; j++) {
    const t = j / H;
    rel[j] += bias * cap * t;
    rel[j] = Math.max(-0.55, Math.min(0.55, rel[j]));
  }
}

export type MemoryPathResult = {
  overlays: OverlayItem[];
  commentaryLine: string | null;
};

/**
 * 과거 유사 앵커(가격 궤적 + 선택 거래량·RSI) → 이후 H봉 평균 궤적, 엔진 편향으로 기울기 보정.
 */
export function buildCandleAnalysisMemoryPathOverlays(
  candles: Candle[],
  timeframe: string,
  analysis: AnalyzeResponse | null | undefined,
  tuning?: CandleAnalysisPathTuning
): MemoryPathResult {
  const minMatches = Math.max(2, Math.min(8, tuning?.minMatches ?? 3));
  const topN = Math.max(3, Math.min(12, tuning?.topMatches ?? 6));
  const wV = Math.max(0, Math.min(2, tuning?.weightVolume ?? 0.45));
  const wR = Math.max(0, Math.min(2, tuning?.weightRsi ?? 0.35));
  const memSteep = Math.max(0.82, Math.min(1.4, tuning?.memoryPathSteepen ?? 1.1));

  const n = candles.length;
  const Hraw = tuning?.horizonBars && tuning.horizonBars > 0 ? tuning.horizonBars : defaultHorizonBars(timeframe);
  const H = Math.min(Hraw, Math.max(8, n - FEATURE_K - 5));
  const lastIdx = n - 1;
  if (n < FEATURE_K + H + MIN_ANCHOR_DISTANCE + 5) {
    return { overlays: [], commentaryLine: null };
  }

  const rsiArr = wR > 0 ? precomputeRsi(candles, 14) : null;

  const curP = priceFeatureAt(candles, lastIdx, FEATURE_K);
  if (!curP) return { overlays: [], commentaryLine: null };
  const curVz = wV > 0 ? logVolZAt(candles, lastIdx, FEATURE_K) : null;
  const curRsi = wR > 0 && rsiArr ? rsiArr[lastIdx] : null;

  type Scored = { i: number; dist: number };
  const scored: Scored[] = [];
  const iMin = FEATURE_K;
  const iMax = Math.min(n - H - 2, lastIdx - MIN_ANCHOR_DISTANCE);
  const step = iMax - iMin > MAX_SCAN ? Math.ceil((iMax - iMin) / MAX_SCAN) : 1;

  for (let i = iMin; i <= iMax; i += step) {
    const p = priceFeatureAt(candles, i, FEATURE_K);
    if (!p) continue;
    const vz = wV > 0 ? logVolZAt(candles, i, FEATURE_K) : null;
    const rsi = wR > 0 && rsiArr ? rsiArr[i] : null;
    const dist = weightedFeatureDist(curP, p, curVz, vz, curRsi, rsi, wV, wR);
    scored.push({ i, dist });
  }

  scored.sort((a, b) => a.dist - b.dist);
  const picks = scored.slice(0, topN);
  if (picks.length < minMatches) {
    return {
      overlays: [],
      commentaryLine: `유사 과거 경로: 설정 최소 ${minMatches}구간 미만이라 청록 점선을 생략했습니다(현재 ${picks.length}개).`,
    };
  }

  const acc = new Array<number>(H + 1).fill(0);
  const cnt = new Array<number>(H + 1).fill(0);
  for (const { i } of picks) {
    const base = candles[i].close;
    if (!(base > 0)) continue;
    for (let j = 0; j <= H; j++) {
      const cj = candles[i + j]?.close;
      if (typeof cj !== 'number' || !(cj > 0)) continue;
      acc[j] += (cj - base) / base;
      cnt[j] += 1;
    }
  }

  const rel: number[] = [];
  for (let j = 0; j <= H; j++) {
    rel.push(cnt[j] > 0 ? acc[j] / cnt[j] : 0);
  }

  const bias = biasFromAnalysis(analysis);
  applySteepenToRel(rel, H, bias, memSteep);
  const atrN = atrLike(candles, lastIdx, 14);
  applyVisualAngleBiasToRel(rel, H, bias, candles[lastIdx]?.close ?? 0, atrN);

  const last = candles[lastIdx];
  const tNow = Number(last.time);
  const barSec = candleBarDurationSec(timeframe, tNow);
  const pathCol = 'rgba(34,211,238,0.72)';
  const dash = '3 6';
  const overlays: OverlayItem[] = [];
  let seg = 0;

  const pushSeg = (t1: number, p1: number, t2: number, p2: number, label: string) => {
    if (![t1, t2, p1, p2].every(Number.isFinite)) return;
    overlays.push({
      id: `candle-analysis-exec-memory-${seg++}`,
      kind: 'trendLine',
      label,
      x1: 0,
      y1: 0,
      time1: t1,
      price1: p1,
      time2: t2,
      price2: p2,
      confidence: 38,
      color: pathCol,
      lineDash: dash,
      lineStrokeWidth: 1.25,
      category: 'labels',
      noProject: true,
    });
  };

  let prevT = tNow;
  let prevP = last.close;
  for (let j = 1; j <= H; j++) {
    const tj = tNow + j * barSec;
    const pj = last.close * (1 + rel[j]);
    const lb = j === 1 ? '유사과거·평균' : j === H ? '유사·H봉' : '';
    pushSeg(prevT, prevP, tj, pj, lb);
    prevT = tj;
    prevP = pj;
  }

  const avgDist = picks.reduce((s, p) => s + p.dist, 0) / picks.length;
  const wNote =
    wV > 0 || wR > 0
      ? ` 가중:거래량${wV.toFixed(2)}·RSI${wR.toFixed(2)}.`
      : ' 가중:가격만.';
  const commentaryLine = `유사 과거 경로(청록): ${FEATURE_K}봉+${wV > 0 || wR > 0 ? '거래량·RSI 보조' : '가격'} 유사 상위 ${picks.length}구간, 이후 ${H}봉 평균·기울기 보정(엔진 롱/숏 편향 반영).${wNote} 유사도≈${avgDist.toFixed(4)}`;

  return { overlays, commentaryLine };
}
