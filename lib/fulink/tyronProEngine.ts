/**
 * 타이롱 PRO 엔진 포팅 (assets/lib logic/tyron_pro_engine.dart)
 * 꼬리 흡수 + RSI 모멘텀 + 볼륨 스파이크 → bias, confidence, path
 */

import type { Candle } from '@/types';

export type TyronProResult = {
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  absorbBull: boolean;
  absorbBear: boolean;
  reasons: string[];
  pathMain: number[];
  pathAlt: number[];
};

function atr(candles: Candle[], len: number): number {
  if (candles.length < len + 2) return 0;
  const start = candles.length - len;
  let sum = 0;
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose));
    sum += tr;
  }
  return sum / len;
}

function rsi(candles: Candle[], len: number): number {
  if (candles.length < len + 2) return 50;
  const start = candles.length - len;
  let gain = 0, loss = 0;
  for (let i = start; i < candles.length; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    if (diff >= 0) gain += diff;
    else loss += -diff;
  }
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function buildPath(pathLen: number, atrVal: number, price: number, score: number, main: boolean): number[] {
  if (atrVal <= 0 || price <= 0) return [];
  const dir = score >= 0 ? 1 : -1;
  const strength = Math.min(1, Math.abs(score));
  const step = (atrVal / price) * (0.45 + 0.75 * strength);
  const wiggle = main ? 0.12 : 0.22;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < pathLen; i++) {
    const t = i / Math.max(1, pathLen - 1);
    const curve = (1 / (1 + Math.exp(-6 * (t - 0.35)))) * (1 - 0.35 * t);
    const noise = Math.sin((i + 1) * 1.7) * wiggle * step;
    acc += dir * step * curve + noise;
    out.push(acc);
  }
  return out;
}

export function analyzeTyronPro(candles: Candle[], rsiLen = 14, pathLen = 18): TyronProResult {
  if (candles.length < Math.max(60, rsiLen + 10)) {
    return {
      bias: 'NEUTRAL',
      confidence: 0,
      absorbBull: false,
      absorbBear: false,
      reasons: ['데이터 부족'],
      pathMain: [],
      pathAlt: [],
    };
  }

  const last = candles[candles.length - 1]!;
  const atrVal = atr(candles, 14);
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  const bullAbsorb = atrVal > 0 &&
    lowerWick >= atrVal * 0.45 &&
    lowerWick >= body * 1.2 &&
    last.close >= last.open + body * 0.35;
  const bearAbsorb = atrVal > 0 &&
    upperWick >= atrVal * 0.45 &&
    upperWick >= body * 1.2 &&
    last.close <= last.open - body * 0.35;

  const rsiCur = rsi(candles, rsiLen);
  const rsiPrev = rsi(candles.slice(0, -1), rsiLen);
  const rsiSlope = rsiCur - rsiPrev;

  const vols = candles.slice(Math.max(0, candles.length - 40)).map(c => c.volume).sort((a, b) => a - b);
  const medV = vols.length ? vols[Math.floor(vols.length / 2)]! : 0;
  const volSpike = medV > 0 ? last.volume / medV : 1;

  let score = 0;
  const reasons: string[] = [];

  if (bullAbsorb) {
    score += 0.55;
    reasons.push('아래꼬리 흡수(롱)');
  }
  if (bearAbsorb) {
    score -= 0.55;
    reasons.push('윗꼬리 흡수(숏)');
  }
  if (Math.abs(rsiSlope) > 0.8) {
    score += rsiSlope > 0 ? 0.12 : -0.12;
    reasons.push(rsiSlope > 0 ? 'RSI 모멘텀↑' : 'RSI 모멘텀↓');
  }
  if (volSpike >= 1.35) {
    score += score >= 0 ? 0.1 : -0.1;
    reasons.push('거래량 스파이크');
  }

  const bias: TyronProResult['bias'] = score >= 0.18 ? 'LONG' : score <= -0.18 ? 'SHORT' : 'NEUTRAL';
  const conf = Math.max(0, Math.min(100, Math.round((Math.min(1, Math.abs(score) / 0.85)) * 100)));

  if (reasons.length === 0) reasons.push('중립(근거 약함)');

  const pathMain = buildPath(pathLen, atrVal, last.close, score, true);
  const pathAlt = buildPath(Math.max(10, Math.round(pathLen * 0.7)), atrVal, last.close, score, false);

  return {
    bias,
    confidence: conf,
    absorbBull: bullAbsorb,
    absorbBear: bearAbsorb,
    reasons: reasons.slice(0, 4),
    pathMain,
    pathAlt,
  };
}
