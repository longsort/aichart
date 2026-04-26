/**
 * RSI 다이버전스 스윙 신호 (곰/황소 5요소 확정과 별도)
 * - RSI 14, Volume MA20, pivot high/low (left=3, right=3)
 * - bullish/bearish divergence, demand/supply zone, liquidity sweep
 * - bullish/bearish engulfing, hammer, shooting star
 * - 점수: divergence +35, zone +20, sweep +15, candle +15, volume +10, trend +5
 * - LONG/SHORT: TF별 점수 문턱 + **실제 다이버전스(bull/bear)가 있을 때만** L/S 확정 (RSI 다이버 남발 방지)
 * - 다이버 인정: RSI 차·피벗 간 봉 수 TF별 최소치
 * - WATCH: 문턱 미만~watch 구간, 다이버 없어도 가능
 */
import { Candle } from '@/types';
import { RSI_SWING_LS_THRESHOLD, RSI_SWING_WATCH_THRESHOLD } from './constants';
import { rsi } from './indicators';
import { candlePatterns } from './smc';

export type DivergenceSignalVerdict = 'LONG' | 'SHORT' | 'WATCH' | 'NONE';

/** 점수 항목: label=영문 카테고리, value=이미지 표시값(Bull/OK/Bullish/Up 등), points=득점 */
export type ScoreBreakdownItem = { label: string; value: string; points: number; ok: boolean };

/** 이미지 기준 체크리스트 표시값: Bull/Vol OK/Bullish Engulfing/Up */
export type ChecklistDisplay = { divergence: string; volume: string; candle: string; trend: string };

/** 다이버전스 대각선: 가격 피벗 + RSI 피벗 (RSI 패널 연결용 rsi1, rsi2 포함) */
export type DivergenceLine = {
  type: 'bullish' | 'bearish';
  index1: number;
  price1: number;
  index2: number;
  price2: number;
  rsi1?: number;
  rsi2?: number;
};

export type DivergenceSignalResult = {
  verdict: DivergenceSignalVerdict;
  longScore: number;
  shortScore: number;
  totalScore: number;
  reasons: string[];
  divergence: { bullish: boolean; bearish: boolean; label: string };
  volume: { spike: boolean; volMA20: number; lastVol: number; label: string };
  candle: { bullish: boolean; bearish: boolean; label: string };
  trend: { bullish: boolean; bearish: boolean; label: string };
  scoreBreakdown: ScoreBreakdownItem[];
  checklistDisplay: ChecklistDisplay;
  divergenceLines?: DivergenceLine[];
  /** 과거 L/S 후보 히스토리 (어떤 캔들에서 떠야 했는지 표시용) */
  signalHistory?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }>;
  /** S/L 표시 위치: Sweep 발생 봉 시각 (고점/저점 터치 봉) — 진입 구간 근처에 표시해 신뢰도 향상 */
  signalBarTime?: number;
};

const SCORE = {
  divergence: 35,
  zone: 20,
  liquiditySweep: 15,
  candlePattern: 15,
  volumeSpike: 10,
  trendMatch: 5,
};

const NEAR_LEVEL_PCT = 0.012;
const VOLUME_SPIKE_RATIO = 1.5;
const PIVOT_LEFT = 3;
const PIVOT_RIGHT = 3;
const MAX_PIVOT_HISTORY = 80;

function pivotHigh(candles: Candle[], index: number, left: number, right: number): boolean {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].high;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].high >= v) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], index: number, left: number, right: number): boolean {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].low;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].low <= v) return false;
  }
  return true;
}

function volumeSma(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      out.push(candles[i].volume);
      continue;
    }
    const sum = candles.slice(i - period + 1, i + 1).reduce((a, c) => a + c.volume, 0);
    out.push(sum / period);
  }
  return out;
}

export type ZoneShape = { left: number; right: number; top: number; bottom: number; poi: number };
export type SweepHit = { side: 'buy' | 'sell'; index: number; price: number };

export type DivergenceSignalInput = {
  candles: Candle[];
  swingHighs: Array<{ index: number; price: number }>;
  swingLows: Array<{ index: number; price: number }>;
  supportLevel: { price: number } | null;
  resistanceLevel: { price: number } | null;
  trend: 'bullish' | 'bearish' | 'range';
  sweeps?: SweepHit[];
  demandZones?: ZoneShape[];
  supplyZones?: ZoneShape[];
  /** RSI period (default 14) */
  rsiPeriod?: number;
  /** Pivot left/right bars (default 3) */
  pivotLeft?: number;
  pivotRight?: number;
  /** Volume spike = lastVol >= volMA20 * multiplier (default 1.5) */
  volumeMultiplier?: number;
  /** LONG/SHORT threshold (기본 80, TF 무관), WATCH min (기본 60) */
  longThreshold?: number;
  shortThreshold?: number;
  watchThreshold?: number;
  /** TF (1m,3m,5m,15m,1h,4h,1d,1w,1M) — 스레시홀드 일관 적용용 */
  timeframe?: string;
};

function isPriceInZone(price: number, z: ZoneShape, pct = 0.012): boolean {
  const low = Math.min(z.top, z.bottom);
  const high = Math.max(z.top, z.bottom);
  return price >= low * (1 - pct) && price <= high * (1 + pct);
}

/** 분·시·일·주·달·연 — L/S 점수 문턱 (다이버 필수 조건과 함께 사용) */
function lsThresholdsByTf(tf: string | undefined): { long: number; short: number; watch: number } {
  const t = tf ?? '';
  if (t === '1m') return { long: 82, short: 82, watch: 54 };
  if (t === '3m') return { long: 83, short: 83, watch: 55 };
  if (t === '5m') return { long: 83, short: 83, watch: 55 };
  if (t === '15m') return { long: 82, short: 82, watch: 54 };
  if (t === '1h') return { long: 83, short: 83, watch: 56 };
  if (t === '4h') return { long: 84, short: 84, watch: 57 };
  if (t === '1d') return { long: 85, short: 85, watch: 58 };
  if (t === '1w') return { long: 86, short: 86, watch: 59 };
  if (t === '1M') return { long: 87, short: 87, watch: 60 };
  if (t === '1Y') return { long: 88, short: 88, watch: 62 };
  return { long: RSI_SWING_LS_THRESHOLD, short: RSI_SWING_LS_THRESHOLD, watch: RSI_SWING_WATCH_THRESHOLD };
}

/** 약한 다이버(RSI 미세 차이·피벗 너무 가까움) 제거 */
function divergenceQualityByTf(tf: string | undefined): { minRsiDelta: number; minPivotBars: number } {
  const t = tf ?? '';
  if (t === '1m') return { minRsiDelta: 3.2, minPivotBars: 6 };
  if (t === '3m' || t === '5m') return { minRsiDelta: 3.5, minPivotBars: 6 };
  if (t === '15m') return { minRsiDelta: 4, minPivotBars: 5 };
  if (t === '1h') return { minRsiDelta: 4, minPivotBars: 5 };
  if (t === '4h') return { minRsiDelta: 4.5, minPivotBars: 4 };
  if (t === '1d') return { minRsiDelta: 5, minPivotBars: 4 };
  if (t === '1w') return { minRsiDelta: 5.5, minPivotBars: 3 };
  if (t === '1M') return { minRsiDelta: 6, minPivotBars: 3 };
  if (t === '1Y') return { minRsiDelta: 7, minPivotBars: 2 };
  return { minRsiDelta: 4, minPivotBars: 5 };
}

export function computeDivergenceSignal(input: DivergenceSignalInput): DivergenceSignalResult {
  const thresholdByTf = lsThresholdsByTf(input.timeframe);
  const {
    candles, swingHighs, swingLows, supportLevel, resistanceLevel, trend,
    sweeps = [], demandZones = [], supplyZones = [],
    rsiPeriod = 14, pivotLeft = PIVOT_LEFT, pivotRight = PIVOT_RIGHT,
    volumeMultiplier = VOLUME_SPIKE_RATIO,
    longThreshold = thresholdByTf.long, shortThreshold = thresholdByTf.short, watchThreshold = thresholdByTf.watch,
  } = input;
  const reasons: string[] = [];
  let longScore = 0;
  let shortScore = 0;

  if (candles.length < 20) {
    return {
      verdict: 'NONE',
      longScore: 0,
      shortScore: 0,
      totalScore: 0,
      reasons: ['캔들 데이터 부족'],
      divergence: { bullish: false, bearish: false, label: '–' },
      volume: { spike: false, volMA20: 0, lastVol: 0, label: '–' },
      candle: { bullish: false, bearish: false, label: '–' },
      trend: { bullish: trend === 'bullish', bearish: trend === 'bearish', label: trend === 'bullish' ? '상승' : trend === 'bearish' ? '하락' : '횡보' },
      scoreBreakdown: [],
      checklistDisplay: { divergence: '–', volume: '–', candle: '–', trend: '–' },
      divergenceLines: undefined,
    };
  }

  const visible = candles;
  const rsiVals = rsi(visible, rsiPeriod);
  const volMA = volumeSma(visible, 20);
  const lastIdx = visible.length - 1;
  const currentPrice = visible[lastIdx].close;
  const lastVol = visible[lastIdx].volume;
  const volMA20 = volMA[lastIdx] || lastVol;

  // 피벗 고점/저점 (스윙이 2개 이상이면 사용, 아니면 직접 계산)
  let pivotHighs: Array<{ index: number; price: number }>;
  let pivotLows: Array<{ index: number; price: number }>;
  if (swingHighs.length >= 2) {
    pivotHighs = swingHighs.slice(-MAX_PIVOT_HISTORY);
  } else {
    pivotHighs = [];
    for (let i = pivotLeft; i < visible.length - pivotRight; i++) {
      if (pivotHigh(visible, i, pivotLeft, pivotRight)) pivotHighs.push({ index: i, price: visible[i].high });
    }
    if (pivotHighs.length > MAX_PIVOT_HISTORY) pivotHighs = pivotHighs.slice(-MAX_PIVOT_HISTORY);
  }
  if (swingLows.length >= 2) {
    pivotLows = swingLows.slice(-MAX_PIVOT_HISTORY);
  } else {
    pivotLows = [];
    for (let i = pivotLeft; i < visible.length - pivotRight; i++) {
      if (pivotLow(visible, i, pivotLeft, pivotRight)) pivotLows.push({ index: i, price: visible[i].low });
    }
    if (pivotLows.length > MAX_PIVOT_HISTORY) pivotLows = pivotLows.slice(-MAX_PIVOT_HISTORY);
  }

  let bullishDiv = false;
  let bearishDiv = false;
  const divLabels: string[] = [];
  const dq = divergenceQualityByTf(input.timeframe);

  if (pivotLows.length >= 2) {
    const p1 = pivotLows[pivotLows.length - 2];
    const p2 = pivotLows[pivotLows.length - 1];
    const priceLower = p2.price < p1.price;
    const rsi1 = rsiVals[p1.index] ?? 50;
    const rsi2 = rsiVals[p2.index] ?? 50;
    const rsiDelta = rsi2 - rsi1;
    const barGap = p2.index - p1.index;
    if (priceLower && rsiDelta >= dq.minRsiDelta && barGap >= dq.minPivotBars) {
      bullishDiv = true;
      longScore += SCORE.divergence;
      reasons.push(`Bullish divergence (+${SCORE.divergence})`);
      divLabels.push('Bullish Div');
    }
  }
  if (pivotHighs.length >= 2) {
    const p1 = pivotHighs[pivotHighs.length - 2];
    const p2 = pivotHighs[pivotHighs.length - 1];
    const priceHigher = p2.price > p1.price;
    const rsi1 = rsiVals[p1.index] ?? 50;
    const rsi2 = rsiVals[p2.index] ?? 50;
    const rsiDelta = rsi1 - rsi2;
    const barGap = p2.index - p1.index;
    if (priceHigher && rsiDelta >= dq.minRsiDelta && barGap >= dq.minPivotBars) {
      bearishDiv = true;
      shortScore += SCORE.divergence;
      reasons.push(`Bearish divergence (+${SCORE.divergence})`);
      divLabels.push('Bearish Div');
    }
  }

  const divergenceLabel = divLabels.length ? divLabels.join(', ') : '–';

  // Near support / resistance / demand / supply zone
  if (supportLevel && currentPrice > 0) {
    const dist = Math.abs(currentPrice - supportLevel.price) / currentPrice;
    if (dist <= NEAR_LEVEL_PCT) {
      longScore += SCORE.zone;
      reasons.push(`Near support (+${SCORE.zone})`);
    }
  }
  if (resistanceLevel && currentPrice > 0) {
    const dist = Math.abs(currentPrice - resistanceLevel.price) / currentPrice;
    if (dist <= NEAR_LEVEL_PCT) {
      shortScore += SCORE.zone;
      reasons.push(`Near resistance (+${SCORE.zone})`);
    }
  }
  const nearDemand = demandZones.some(z => isPriceInZone(currentPrice, z));
  if (nearDemand) {
    longScore += SCORE.zone;
    reasons.push(`Near demand zone (+${SCORE.zone})`);
  }
  const nearSupply = supplyZones.some(z => isPriceInZone(currentPrice, z));
  if (nearSupply) {
    shortScore += SCORE.zone;
    reasons.push(`Near supply zone (+${SCORE.zone})`);
  }

  // Liquidity sweep: sell sweep = bullish, buy sweep = bearish
  const SWEEP_LOOKBACK_BARS = 30;
  const recentSweeps = sweeps.filter(s => lastIdx - s.index <= SWEEP_LOOKBACK_BARS);
  const hasSellSweep = recentSweeps.some(s => s.side === 'sell');
  const hasBuySweep = recentSweeps.some(s => s.side === 'buy');
  if (hasSellSweep) {
    longScore += SCORE.liquiditySweep;
    reasons.push(`Liquidity sweep (sell-side) (+${SCORE.liquiditySweep})`);
  }
  if (hasBuySweep) {
    shortScore += SCORE.liquiditySweep;
    reasons.push(`Liquidity sweep (buy-side) (+${SCORE.liquiditySweep})`);
  }

  // Candle patterns (마지막 5봉 내) — bias당 1회만 점수 적용
  const patterns = candlePatterns(visible);
  const recentPatterns = patterns.filter(p => p.index >= lastIdx - 5);
  let bullishCandle = false;
  let bearishCandle = false;
  const candleLabels: string[] = [];
  for (const p of recentPatterns) {
    if (p.bias === 'bullish') {
      if (!bullishCandle) {
        bullishCandle = true;
        longScore += SCORE.candlePattern;
        reasons.push(`Bullish candle (${p.label}) (+${SCORE.candlePattern})`);
      }
      candleLabels.push(p.label);
    } else if (p.bias === 'bearish') {
      if (!bearishCandle) {
        bearishCandle = true;
        shortScore += SCORE.candlePattern;
        reasons.push(`Bearish candle (${p.label}) (+${SCORE.candlePattern})`);
      }
      candleLabels.push(p.label);
    }
  }
  const candleLabel = candleLabels.length ? candleLabels.slice(-2).join(', ') : '–';

  // Volume spike (+10 양방향)
  const volSpike = volMA20 > 0 && lastVol >= volMA20 * volumeMultiplier;
  if (volSpike) {
    longScore += SCORE.volumeSpike;
    shortScore += SCORE.volumeSpike;
    reasons.push(`Volume spike (+${SCORE.volumeSpike})`);
  }

  const volumeLabel = volSpike ? `스파이크 (${(lastVol / volMA20).toFixed(1)}x)` : '보통';

  // Trend match
  if (trend === 'bullish') {
    longScore += SCORE.trendMatch;
    reasons.push(`Trend bullish (+${SCORE.trendMatch})`);
  } else if (trend === 'bearish') {
    shortScore += SCORE.trendMatch;
    reasons.push(`Trend bearish (+${SCORE.trendMatch})`);
  }

  const trendLabel = trend === 'bullish' ? '상승' : trend === 'bearish' ? '하락' : '횡보';

  const checklistDisplay: ChecklistDisplay = {
    divergence: bullishDiv ? 'Bull' : bearishDiv ? 'Bear' : '–',
    volume: volSpike ? 'Vol OK' : '–',
    candle: candleLabel !== '–' ? candleLabel : '–',
    trend: trend === 'bullish' ? 'Up' : trend === 'bearish' ? 'Down' : '–',
  };

  // L/S: 다이버전스 실제 성립 + 점수·우세 (RSI 다이버만으로 L/S 취급)
  let verdict: DivergenceSignalVerdict = 'NONE';
  if (bullishDiv && longScore >= longThreshold && longScore > shortScore) verdict = 'LONG';
  else if (bearishDiv && shortScore >= shortThreshold && shortScore > longScore) verdict = 'SHORT';
  else if (longScore >= watchThreshold || shortScore >= watchThreshold) verdict = 'WATCH';

  const winScore = verdict === 'LONG' ? longScore : verdict === 'SHORT' ? shortScore : Math.max(longScore, shortScore);
  const candleShort = candleLabel.includes('Bullish') ? 'Bullish' : candleLabel.includes('Bearish') ? 'Bearish' : candleLabel;

  const divergenceLines: DivergenceLine[] = [];
  const signalHistory: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> = [];
  // 과거 히스토리 복원: pivot 연속쌍에서 다이버전스가 성립한 모든 지점 기록
  for (let i = 1; i < pivotLows.length; i++) {
    const p1 = pivotLows[i - 1];
    const p2 = pivotLows[i];
    const priceLower = p2.price < p1.price;
    const rsi1 = rsiVals[p1.index] ?? 50;
    const rsi2 = rsiVals[p2.index] ?? 50;
    const rsiDelta = rsi2 - rsi1;
    const barGap = p2.index - p1.index;
    if (priceLower && rsiDelta >= dq.minRsiDelta && barGap >= dq.minPivotBars && visible[p2.index]) {
      signalHistory.push({ time: visible[p2.index].time as number, verdict: 'LONG' });
    }
  }
  for (let i = 1; i < pivotHighs.length; i++) {
    const p1 = pivotHighs[i - 1];
    const p2 = pivotHighs[i];
    const priceHigher = p2.price > p1.price;
    const rsi1 = rsiVals[p1.index] ?? 50;
    const rsi2 = rsiVals[p2.index] ?? 50;
    const rsiDelta = rsi1 - rsi2;
    const barGap = p2.index - p1.index;
    if (priceHigher && rsiDelta >= dq.minRsiDelta && barGap >= dq.minPivotBars && visible[p2.index]) {
      signalHistory.push({ time: visible[p2.index].time as number, verdict: 'SHORT' });
    }
  }
  if (bullishDiv && pivotLows.length >= 2) {
    const p1 = pivotLows[pivotLows.length - 2];
    const p2 = pivotLows[pivotLows.length - 1];
    divergenceLines.push({
      type: 'bullish',
      index1: p1.index,
      price1: p1.price,
      index2: p2.index,
      price2: p2.price,
      rsi1: rsiVals[p1.index],
      rsi2: rsiVals[p2.index],
    });
  }
  if (bearishDiv && pivotHighs.length >= 2) {
    const p1 = pivotHighs[pivotHighs.length - 2];
    const p2 = pivotHighs[pivotHighs.length - 1];
    divergenceLines.push({
      type: 'bearish',
      index1: p1.index,
      price1: p1.price,
      index2: p2.index,
      price2: p2.price,
      rsi1: rsiVals[p1.index],
      rsi2: rsiVals[p2.index],
    });
  }

  const nearSupport = supportLevel && currentPrice > 0 && Math.abs(currentPrice - supportLevel.price) / currentPrice <= NEAR_LEVEL_PCT;
  const nearResistance = resistanceLevel && currentPrice > 0 && Math.abs(currentPrice - resistanceLevel.price) / currentPrice <= NEAR_LEVEL_PCT;
  const zonePointsLong = (nearSupport ? SCORE.zone : 0) + (nearDemand ? SCORE.zone : 0);
  const zonePointsShort = (nearResistance ? SCORE.zone : 0) + (nearSupply ? SCORE.zone : 0);
  const zonePoints = verdict === 'LONG' ? zonePointsLong : verdict === 'SHORT' ? zonePointsShort : Math.max(zonePointsLong, zonePointsShort);
  const sweepPoints = (hasSellSweep || hasBuySweep) ? SCORE.liquiditySweep : 0;

  const scoreBreakdown: ScoreBreakdownItem[] = [
    { label: 'Divergence', value: checklistDisplay.divergence, points: (bullishDiv && verdict === 'LONG') || (bearishDiv && verdict === 'SHORT') ? SCORE.divergence : 0, ok: bullishDiv || bearishDiv },
    { label: 'Zone', value: nearDemand || nearSupply || nearSupport || nearResistance ? 'OK' : '–', points: zonePoints, ok: nearDemand || nearSupply || nearSupport || nearResistance },
    { label: 'Sweep', value: hasSellSweep || hasBuySweep ? 'OK' : '–', points: sweepPoints, ok: hasSellSweep || hasBuySweep },
    { label: 'Volume', value: volSpike ? 'OK' : '–', points: volSpike ? SCORE.volumeSpike : 0, ok: volSpike },
    { label: 'Candle', value: candleShort !== '–' ? candleShort : '–', points: (bullishCandle && verdict === 'LONG') || (bearishCandle && verdict === 'SHORT') ? SCORE.candlePattern : 0, ok: bullishCandle || bearishCandle },
    { label: 'Trend', value: checklistDisplay.trend, points: (trend === 'bullish' && verdict === 'LONG') || (trend === 'bearish' && verdict === 'SHORT') ? SCORE.trendMatch : 0, ok: trend !== 'range' },
  ];

  let signalBarTime: number | undefined;
  if (verdict === 'SHORT' && hasBuySweep) {
    const buySweeps = recentSweeps.filter(s => s.side === 'buy').sort((a, b) => b.index - a.index);
    const sweepBar = buySweeps[0];
    if (sweepBar != null && visible[sweepBar.index]) signalBarTime = visible[sweepBar.index].time as number;
  } else if (verdict === 'LONG' && hasSellSweep) {
    const sellSweeps = recentSweeps.filter(s => s.side === 'sell').sort((a, b) => b.index - a.index);
    const sweepBar = sellSweeps[0];
    if (sweepBar != null && visible[sweepBar.index]) signalBarTime = visible[sweepBar.index].time as number;
  }
  // 스윕이 없어도 신호 봉 위치를 고정할 수 있도록 보조 지정
  if (signalBarTime == null && (verdict === 'LONG' || verdict === 'SHORT')) {
    if (verdict === 'LONG' && pivotLows.length > 0) {
      const p = pivotLows[pivotLows.length - 1];
      signalBarTime = visible[p.index]?.time as number;
    } else if (verdict === 'SHORT' && pivotHighs.length > 0) {
      const p = pivotHighs[pivotHighs.length - 1];
      signalBarTime = visible[p.index]?.time as number;
    } else {
      signalBarTime = visible[lastIdx]?.time as number;
    }
  }

  const MAX_SIGNAL_HISTORY = 100;
  const signalHistoryCapped =
    signalHistory.length > MAX_SIGNAL_HISTORY ? signalHistory.slice(-MAX_SIGNAL_HISTORY) : signalHistory;

  return {
    verdict,
    longScore,
    shortScore,
    totalScore: winScore,
    reasons,
    divergence: { bullish: bullishDiv, bearish: bearishDiv, label: divergenceLabel },
    volume: { spike: volSpike, volMA20, lastVol, label: volumeLabel },
    candle: { bullish: bullishCandle, bearish: bearishCandle, label: candleLabel },
    trend: { bullish: trend === 'bullish', bearish: trend === 'bearish', label: trendLabel },
    scoreBreakdown,
    checklistDisplay,
    divergenceLines: divergenceLines.length ? divergenceLines : undefined,
    signalHistory: signalHistoryCapped.length ? signalHistoryCapped : undefined,
    signalBarTime,
  };
}
