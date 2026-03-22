/**
 * RSI 다이버전스 스윙 신호 (곰/황소 5요소 확정과 별도)
 * - RSI 14, Volume MA20, pivot high/low (left=3, right=3)
 * - bullish/bearish divergence, demand/supply zone, liquidity sweep
 * - bullish/bearish engulfing, hammer, shooting star
 * - 점수: divergence +35, zone +20, sweep +15, candle +15, volume +10, trend +5
 * - 80점+ LONG/SHORT (분·시·일·주·달 동일), 60~79 WATCH, 60 미만 NONE
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

export function computeDivergenceSignal(input: DivergenceSignalInput): DivergenceSignalResult {
  const {
    candles, swingHighs, swingLows, supportLevel, resistanceLevel, trend,
    sweeps = [], demandZones = [], supplyZones = [],
    rsiPeriod = 14, pivotLeft = PIVOT_LEFT, pivotRight = PIVOT_RIGHT,
    volumeMultiplier = VOLUME_SPIKE_RATIO,
    longThreshold = RSI_SWING_LS_THRESHOLD, shortThreshold = RSI_SWING_LS_THRESHOLD, watchThreshold = RSI_SWING_WATCH_THRESHOLD,
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
    pivotHighs = swingHighs.slice(-3);
  } else {
    pivotHighs = [];
    for (let i = pivotLeft; i < visible.length - pivotRight; i++) {
      if (pivotHigh(visible, i, pivotLeft, pivotRight)) pivotHighs.push({ index: i, price: visible[i].high });
      if (pivotHighs.length >= 3) break;
    }
  }
  if (swingLows.length >= 2) {
    pivotLows = swingLows.slice(-3);
  } else {
    pivotLows = [];
    for (let i = pivotLeft; i < visible.length - pivotRight; i++) {
      if (pivotLow(visible, i, pivotLeft, pivotRight)) pivotLows.push({ index: i, price: visible[i].low });
      if (pivotLows.length >= 3) break;
    }
  }

  let bullishDiv = false;
  let bearishDiv = false;
  const divLabels: string[] = [];

  if (pivotLows.length >= 2) {
    const p1 = pivotLows[pivotLows.length - 2];
    const p2 = pivotLows[pivotLows.length - 1];
    const priceLower = p2.price < p1.price;
    const rsi1 = rsiVals[p1.index] ?? 50;
    const rsi2 = rsiVals[p2.index] ?? 50;
    const rsiHigher = rsi2 > rsi1;
    if (priceLower && rsiHigher) {
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
    const rsiLower = rsi2 < rsi1;
    if (priceHigher && rsiLower) {
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

  // Verdict: threshold+ LONG/SHORT, watchThreshold~ WATCH, <watchThreshold NONE
  let verdict: DivergenceSignalVerdict = 'NONE';
  if (longScore >= longThreshold && longScore > shortScore) verdict = 'LONG';
  else if (shortScore >= shortThreshold && shortScore > longScore) verdict = 'SHORT';
  else if (longScore >= watchThreshold || shortScore >= watchThreshold) verdict = 'WATCH';

  const winScore = verdict === 'LONG' ? longScore : verdict === 'SHORT' ? shortScore : Math.max(longScore, shortScore);
  const candleShort = candleLabel.includes('Bullish') ? 'Bullish' : candleLabel.includes('Bearish') ? 'Bearish' : candleLabel;

  const divergenceLines: DivergenceLine[] = [];
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
    signalBarTime,
  };
}
