/**
 * 캔들 확률 엔진 포팅 (assets/lib core/analysis/candle_prob_engine.dart)
 * 장대/볼륨 조건부 상승(1/3/5봉) 확률, 패턴/레짐 감지, 칩 라벨
 */

import type { Candle } from '@/types';

export type ChipTone = 'good' | 'bad' | 'warn' | 'neutral';

export type ChipItem = {
  title: string;
  value: string;
  tone: ChipTone;
};

const minCandles = 12;

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function atr(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    sum += tr;
    n++;
  }
  return n ? sum / n : 0;
}

function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i]!;
    sumXY += i * ys[i]!;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function toneByPct(p: number): ChipTone {
  const v = Math.round(p * 100);
  if (v >= 65) return 'good';
  if (v <= 35) return 'bad';
  return 'warn';
}

function pctStr(p: number): string {
  if (p <= 0) return '--';
  return `${Math.round(p * 100)}%`;
}

type Condition = { large: boolean; bull: boolean; volSpike: boolean };

function conditionalSample(data: Candle[], now: Condition): number[] {
  const bodies = data.map(c => Math.abs(c.close - c.open));
  const vols = data.map(c => c.volume);
  const bodyAvg = avg(bodies);
  const volAvg = avg(vols);
  const isLarge = (c: Candle) => bodyAvg > 0 && Math.abs(c.close - c.open) >= bodyAvg * 2;
  const isVolSpike = (c: Candle) => volAvg > 0 && c.volume >= volAvg * 1.6;
  const indices: number[] = [];
  for (let i = 10; i < data.length - 6; i++) {
    const c = data[i]!;
    const bull = c.close >= c.open;
    const large = isLarge(c);
    const spike = isVolSpike(c);
    if (now.large !== large) continue;
    if (now.volSpike !== spike) continue;
    if (now.bull !== bull) continue;
    indices.push(i);
  }
  return indices;
}

function nextDirectionProb(data: Candle[], now: Condition, horizon: number): number {
  const indices = conditionalSample(data, now);
  if (indices.length < 20) return momentumProb(data, horizon);
  let up = 0, total = 0;
  for (const idx of indices) {
    const end = idx + horizon;
    if (end >= data.length) continue;
    const base = data[idx]!.close;
    const future = data[end]!.close;
    total++;
    if (future >= base) up++;
  }
  return total <= 0 ? 0 : up / total;
}

function reLargeProb(data: Candle[], now: Condition, horizon: number): number {
  const indices = conditionalSample(data, now);
  if (indices.length < 20) return 0;
  const bodies = data.map(c => Math.abs(c.close - c.open));
  const bodyAvg = avg(bodies);
  if (bodyAvg <= 0) return 0;
  let hit = 0, total = 0;
  for (const idx of indices) {
    const end = Math.min(idx + horizon, data.length - 1);
    let anyLarge = false;
    for (let j = idx + 1; j <= end; j++) {
      const b = Math.abs(data[j]!.close - data[j]!.open);
      if (b >= bodyAvg * 2) {
        anyLarge = true;
        break;
      }
    }
    total++;
    if (anyLarge) hit++;
  }
  return total <= 0 ? 0 : hit / total;
}

function momentumProb(data: Candle[], horizon: number): number {
  const recent = data.length > 40 ? data.slice(-40) : data;
  let up = 0;
  for (const c of recent) {
    if (c.close >= c.open) up++;
  }
  const upRatio = up / recent.length;
  const slopeVal = recent.length ? (recent[recent.length - 1]!.close - recent[0]!.close) / recent.length : 0;
  const bias = slopeVal > 0 ? 0.05 : slopeVal < 0 ? -0.05 : 0;
  return Math.max(0.05, Math.min(0.95, upRatio + bias));
}

function detectPattern(data: Candle[]): { label: string; tone: ChipTone } {
  const w = data.length > 60 ? data.slice(-60) : data;
  const highs = w.map(c => c.high);
  const lows = w.map(c => c.low);
  const hs = slope(highs);
  const ls = slope(lows);
  const range0 = Math.abs(highs[0]! - lows[0]!);
  const range1 = Math.abs(highs[highs.length - 1]! - lows[lows.length - 1]!);
  const narrowing = range1 < range0 * 0.7;
  if (narrowing && hs > 0 && ls > 0 && ls > hs * 1.2) return { label: '상승쐐기', tone: 'warn' };
  if (narrowing && hs < 0 && ls < 0 && Math.abs(hs) > Math.abs(ls) * 1.2) return { label: '하락쐐기', tone: 'good' };
  if (narrowing && hs < 0 && ls > 0) return { label: '삼각수렴', tone: 'warn' };
  return { label: '없음', tone: 'neutral' };
}

function detectRegime(data: Candle[]): { label: string; tone: ChipTone } {
  const w = data.length > 80 ? data.slice(-80) : data;
  const closes = w.map(c => c.close);
  const sl = slope(closes);
  const atrVal = atr(w);
  const strength = atrVal > 0 ? Math.abs(sl) / atrVal : 0;
  if (strength >= 0.22) return { label: sl > 0 ? '상승추세' : '하락추세', tone: sl > 0 ? 'good' : 'bad' };
  return { label: '레인지', tone: 'neutral' };
}

export function buildCandleProbChips(
  candles: Candle[],
  opts: { currentDir?: string; currentProb?: number; sweepRisk?: number } = {}
): ChipItem[] {
  const { currentDir = 'NEUTRAL', currentProb = 0, sweepRisk = 0 } = opts;

  if (candles.length < minCandles) {
    return [
      { title: '데이터', value: '부족', tone: 'warn' },
      { title: '상승(1봉)', value: '--', tone: 'neutral' },
      { title: '상승(3봉)', value: '--', tone: 'neutral' },
      { title: '상승(5봉)', value: '--', tone: 'neutral' },
    ];
  }

  const data = candles.length > 400 ? candles.slice(-400) : candles;
  const last = data[data.length - 1]!;
  const body = Math.abs(last.close - last.open);
  const bodies = data.map(c => Math.abs(c.close - c.open));
  const vols = data.map(c => c.volume);
  const bodyAvg = avg(bodies);
  const volAvg = avg(vols);

  const isBull = last.close >= last.open;
  const isLarge = bodyAvg > 0 && body >= bodyAvg * 2;
  const isVolSpike = volAvg > 0 && last.volume >= volAvg * 1.6;

  const cond: Condition = { large: isLarge, bull: isBull, volSpike: isVolSpike };

  const p1 = nextDirectionProb(data, cond, 1);
  const p3 = nextDirectionProb(data, cond, 3);
  const p5 = nextDirectionProb(data, cond, 5);
  const replarge5 = reLargeProb(data, cond, 5);

  const pattern = detectPattern(data);
  const regime = detectRegime(data);

  const dir = (currentDir || 'NEUTRAL').toUpperCase();
  const dirKo = dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '관망';

  return [
    { title: '방향', value: currentProb > 0 ? `${dirKo} ${currentProb}%` : dirKo, tone: dir === 'LONG' ? 'good' : dir === 'SHORT' ? 'bad' : 'neutral' },
    { title: '패턴', value: pattern.label, tone: pattern.tone },
    { title: '레짐', value: regime.label, tone: regime.tone },
    { title: '장대', value: isLarge ? (isBull ? '장대양봉' : '장대음봉') : '없음', tone: isLarge ? (isBull ? 'good' : 'bad') : 'neutral' },
    { title: '볼륨', value: isVolSpike ? '스파이크' : '보통', tone: isVolSpike ? 'warn' : 'neutral' },
    { title: '상승(1봉)', value: pctStr(p1), tone: toneByPct(p1) },
    { title: '상승(3봉)', value: pctStr(p3), tone: toneByPct(p3) },
    { title: '상승(5봉)', value: pctStr(p5), tone: toneByPct(p5) },
    { title: '장대재출현', value: pctStr(replarge5), tone: toneByPct(replarge5) },
    { title: '스윕위험', value: `${Math.max(0, Math.min(100, sweepRisk))}%`, tone: sweepRisk >= 70 ? 'bad' : sweepRisk >= 45 ? 'warn' : 'neutral' },
  ];
}
