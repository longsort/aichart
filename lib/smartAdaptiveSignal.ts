/**
 * Smart Adaptive Signal System — Pine v5 indicator 포팅 (교육·참고용).
 * 일봉 MA는 인트라데이 캔들에서 UTC 일자별 종가를 모아 근사합니다.
 */
import type { Candle, OverlayItem } from '@/types';

export type SmartAdaptiveMaType = 'SMA' | 'EMA' | 'WMA';

export type SmartAdaptiveOptions = {
  period?: number;
  percentageThreshold?: number;
  forwardBars?: number;
  maType?: SmartAdaptiveMaType;
  fastLength?: number;
  slowLength?: number;
  vwapWeight?: number;
  amaWeight?: number;
  smoothingFactor?: number;
  resetThresholdBars?: number;
  useTrendReset?: boolean;
  /** 생성할 최대 신호 수 (선·라벨 부하 제한) */
  maxSignalMarks?: number;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function utcDayKey(tSec: number): string {
  const d = new Date(tSec * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function inferBarDurationSec(candles: Candle[], timeframe: string): number {
  if (candles.length >= 2) {
    const d = candles[candles.length - 1].time - candles[candles.length - 2].time;
    if (d > 0) return d;
  }
  const map: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '12h': 43200,
    '1d': 86400,
    '1w': 604800,
    '1M': 2592000,
    '1Y': 31536000,
  };
  return map[timeframe] ?? 60;
}

function smaArr(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += arr[i - j];
    out[i] = s / period;
  }
  return out;
}

function emaArr(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  const k = 2 / (period + 1);
  let prev = arr[0];
  out[0] = prev;
  for (let i = 1; i < n; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function wmaArr(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  const den = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += arr[i - j] * (period - j);
    out[i] = s / den;
  }
  return out;
}

function rollingStdev(close: number[], period: number): number[] {
  const n = close.length;
  const out = new Array(n).fill(0);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const v = close[i - j];
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / period;
    const v = Math.max(0, sumSq / period - mean * mean);
    out[i] = Math.sqrt(v);
  }
  return out;
}

function rising5(closes: number[], i: number): boolean {
  if (i < 5) return false;
  for (let k = 0; k < 4; k++) {
    if (closes[i - k] <= closes[i - k - 1]) return false;
  }
  return true;
}

function falling5(closes: number[], i: number): boolean {
  if (i < 5) return false;
  for (let k = 0; k < 4; k++) {
    if (closes[i - k] >= closes[i - k - 1]) return false;
  }
  return true;
}

/** UTC 일자별 종가(마지막 봉)로 일봉 시퀀스를 만들고, 일봉 MA를 캔들마다 매핑 */
function dailyCloseMaAligned(
  candles: Candle[],
  period: number,
  maType: SmartAdaptiveMaType
): { currentAvg: number[]; dailyCloses: number[] } {
  const n = candles.length;
  const currentAvg = new Array(n).fill(NaN);
  if (n < 2) return { currentAvg, dailyCloses: [] };

  const dayKeys: string[] = [];
  const lastCloseByDay = new Map<string, number>();
  for (const c of candles) {
    const k = utcDayKey(c.time);
    if (!lastCloseByDay.has(k)) dayKeys.push(k);
    lastCloseByDay.set(k, c.close);
  }
  const dailyCloses = dayKeys.map((k) => lastCloseByDay.get(k)!);
  let maD: number[];
  if (maType === 'EMA') maD = emaArr(dailyCloses, period);
  else if (maType === 'WMA') maD = wmaArr(dailyCloses, period);
  else maD = smaArr(dailyCloses, period);

  const dayIndex = new Map<string, number>();
  dayKeys.forEach((k, i) => dayIndex.set(k, i));

  for (let i = 0; i < n; i++) {
    const di = dayIndex.get(utcDayKey(candles[i].time));
    if (di === undefined) continue;
    const v = maD[di];
    if (typeof v === 'number' && Number.isFinite(v)) currentAvg[i] = v;
  }
  return { currentAvg, dailyCloses };
}

/**
 * 차트에 올릴 오버레이: 롱 🐂 / 숏 🦅 라벨, 점선 연결, 목표가 수평선, 마지막 예측 라벨
 */
export function buildSmartAdaptiveSignalOverlays(
  candles: Candle[],
  timeframe: string,
  opts?: SmartAdaptiveOptions
): OverlayItem[] {
  const period = Math.max(1, opts?.period ?? 20);
  let pctTh = opts?.percentageThreshold ?? 6.8;
  pctTh = Math.min(10, Math.max(3, pctTh));
  const forwardBars = Math.max(1, Math.min(50, opts?.forwardBars ?? 10));
  const maType = opts?.maType ?? 'SMA';
  const fastLength = Math.max(1, opts?.fastLength ?? 10);
  const slowLength = Math.max(1, opts?.slowLength ?? 30);
  const vwapW = opts?.vwapWeight ?? 0.6;
  const amaW = opts?.amaWeight ?? 0.4;
  const smoothingFactor = Math.max(0, Math.min(1, opts?.smoothingFactor ?? 0.7));
  const resetThresholdBars = Math.max(1, opts?.resetThresholdBars ?? 50);
  const useTrendReset = opts?.useTrendReset !== false;
  const maxMarks = Math.max(8, Math.min(200, opts?.maxSignalMarks ?? 80));

  const n = candles.length;
  /** 최소 봉: 지표 안정화 + 스윙 여유 (너무 짧으면 빈 배열) */
  if (n < Math.max(15, period + 2)) return [];

  const close = candles.map((c) => c.close);
  const { currentAvg: dailyAvg } = dailyCloseMaAligned(candles, period, maType);
  /** 일봉 일수 < period 이면 일봉 MA가 비어 있음 → 현재 TF 종가 SMA로 대체 (Pine 일봉 security 근사) */
  const intraP = Math.min(period, Math.max(3, n - 1));
  const intraFallback = smaArr(close, intraP);
  const currentAvg = close.map((_, i) => {
    const v = dailyAvg[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const f = intraFallback[i];
    return typeof f === 'number' && Number.isFinite(f) ? f : v;
  });

  let cumTyp = 0;
  let cumVol = 0;
  const vwap: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const typ = (c.high + c.low + c.close) / 3;
    const vol = Math.max(0, c.volume || 0);
    cumTyp += typ * vol;
    cumVol += vol;
    vwap[i] = cumVol > 0 ? cumTyp / cumVol : typ;
  }

  const emaF = emaArr(close, fastLength);
  const emaS = emaArr(close, slowLength);
  const ama = close.map((_, i) => emaF[i] * 0.5 + emaS[i] * 0.5);

  const volatility = rollingStdev(close, period);

  const pctDiff = close.map((cl, i) => {
    const a = currentAvg[i];
    if (!Number.isFinite(a) || Math.abs(a) < 1e-12) return 0;
    return ((cl - a) / a) * 100;
  });

  const momentum = close.map((cl, i) => (i === 0 ? 0 : ((cl - close[i - 1]) / Math.max(1e-12, close[i - 1])) * 100));
  const momentumFactor = momentum.map((m) => 1 + m / 100);

  const combinedAverage = close.map((_, i) => vwap[i] * vwapW + ama[i] * amaW);
  const targetPrice = close.map((_, i) => combinedAverage[i] + volatility[i] * momentumFactor[i] * 1.5);

  const smoothed: number[] = new Array(n).fill(NaN);
  smoothed[0] = targetPrice[0];
  for (let i = 1; i < n; i++) {
    smoothed[i] =
      smoothingFactor * targetPrice[i] + (1 - smoothingFactor) * (Number.isFinite(smoothed[i - 1]) ? smoothed[i - 1]! : targetPrice[i]);
  }

  const adaptiveBuyTh = close.map((_, i) => pctTh + volatility[i] * 0.1);
  const adaptiveSellTh = adaptiveBuyTh.slice();

  const buySig: boolean[] = new Array(n).fill(false);
  const sellSig: boolean[] = new Array(n).fill(false);

  let buyTarget = adaptiveBuyTh[0]!;
  let sellTarget = adaptiveSellTh[0]!;

  for (let i = 0; i < n; i++) {
    const ab = adaptiveBuyTh[i]!;
    const as = adaptiveSellTh[i]!;

    if (pctDiff[i] > 0) buyTarget = ab;
    if (pctDiff[i] < 0) sellTarget = as;

    buySig[i] = pctDiff[i] <= -buyTarget;
    sellSig[i] = pctDiff[i] >= sellTarget;

    if (buySig[i]) buyTarget += 6;
    if (sellSig[i]) sellTarget += 6;

    const resetTrend = useTrendReset && (rising5(close, i) || falling5(close, i));
    if (i % resetThresholdBars === 0 || resetTrend) {
      buyTarget = ab;
      sellTarget = as;
    }
  }

  const barSec = inferBarDurationSec(candles, timeframe);
  const out: OverlayItem[] = [];
  let marks = 0;

  const pushSignal = (i: number, side: 'buy' | 'sell') => {
    if (marks >= maxMarks) return;
    marks += 1;
    const c = candles[i];
    const t0 = c.time as number;
    const tF = t0 + forwardBars * barSec;
    const tFar = t0 + forwardBars * 8 * barSec;
    const st = smoothed[i]!;
    const bull = '🐂';
    const eagle = '🦅';
    const col = side === 'buy' ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';

    out.push({
      id: `smart-adaptive-sig-${i}-${side}`,
      kind: 'label',
      label: side === 'buy' ? bull : eagle,
      x1: 0,
      y1: 0,
      time1: t0,
      price1: side === 'buy' ? c.low : c.high,
      confidence: 62,
      color: col,
      category: 'smartAdaptive',
      labelTextColor: side === 'buy' ? '#ecfdf5' : '#fef2f2',
      labelBackgroundColor: side === 'buy' ? 'rgba(22,101,52,0.88)' : 'rgba(127,29,29,0.88)',
    } as OverlayItem);

    out.push({
      id: `smart-adaptive-conn-${i}-${side}`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t0,
      price1: c.close,
      time2: tF,
      price2: st,
      confidence: 55,
      color: side === 'buy' ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)',
      lineLabelColor: side === 'buy' ? '#22C55E' : '#EF4444',
      category: 'smartAdaptive',
      lineDash: '4 3',
      lineStrokeWidth: 1,
      noProject: true,
    } as OverlayItem);

    out.push({
      id: `smart-adaptive-h-${i}-${side}`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: tF,
      price1: st,
      time2: tFar,
      price2: st,
      confidence: 52,
      color: side === 'buy' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)',
      lineLabelColor: side === 'buy' ? '#22C55E' : '#EF4444',
      category: 'smartAdaptive',
      lineDash: '6 4',
      lineStrokeWidth: 1,
      noProject: true,
    } as OverlayItem);
  };

  /** 최근 신호부터 표시(과거부터 채우면 오래된 것만 남음) */
  for (let i = n - 1; i >= 0; i--) {
    if (marks >= maxMarks) break;
    if (sellSig[i]) pushSignal(i, 'sell');
    if (marks >= maxMarks) break;
    if (buySig[i]) pushSignal(i, 'buy');
  }

  const last = n - 1;
  const ca = currentAvg[last];
  const barSecPred = inferBarDurationSec(candles, timeframe);
  if (Number.isFinite(ca)) {
    out.push({
      id: 'smart-adaptive-pred-label',
      kind: 'label',
      label: `◀ 예측: ${(ca as number).toFixed(5)}`,
      x1: 0,
      y1: 0,
      time1: (candles[last]!.time as number) + forwardBars * barSecPred,
      price1: ca as number,
      confidence: 58,
      color: 'rgba(168,85,247,0.95)',
      category: 'smartAdaptive',
      labelTextColor: '#faf5ff',
      labelBackgroundColor: 'rgba(88,28,135,0.82)',
    } as OverlayItem);
  }

  return out;
}
