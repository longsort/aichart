/**
 * Fulink Pro ULTRA DecisionEngineV2 포팅 (assets/lib 엔진과 동일 로직)
 * 롱/숏/관망 판단, 근거 수, 메터(진행바), NO-TRADE 락
 */

import type { Candle } from '@/types';

export type KeyZones = { support?: number | null; resistance?: number | null };
export type TyRongResult = { p1: number; p3: number; p5: number };

export type FulinkDecision = {
  title: '롱' | '숏' | '관망';
  subtitle: string;
  evidenceHit: number;
  evidenceTotal: number;
  score: number;
  confidence: number;
  meters: Record<string, number>;
  locked: boolean;
  action: string;
  detail: string;
};

const EVIDENCE_NEED = 5;

function ema(values: number[], period: number): number[] {
  const out: number[] = [values[0]];
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(closes: number[], period: number): number[] {
  const out: number[] = new Array(closes.length).fill(50);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        const rs = loss === 0 ? 100 : gain / loss;
        out[i] = Math.max(0, Math.min(100, 100 - 100 / (1 + rs)));
      }
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      const rs = loss === 0 ? 100 : gain / loss;
      out[i] = Math.max(0, Math.min(100, 100 - 100 / (1 + rs)));
    }
  }
  const firstVal = out[Math.min(period, closes.length - 1)];
  for (let i = 0; i < Math.min(period, closes.length); i++) out[i] = firstVal;
  return out;
}

function atr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out: number[] = [];
  let prev = tr.slice(0, Math.min(tr.length, period + 1)).reduce((a, b) => a + b, 0) / Math.max(1, period);
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      out.push(prev);
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
      out.push(prev);
    }
  }
  return out;
}

function pctFromBool(v: boolean, on: number, off: number): number {
  return v ? on : off;
}

import { conservatismPenalty as learningPenalty } from './learningEngine';

/** 보수성 페널티 (학습 엔진 연동) */
export async function conservatismPenalty(window = 160): Promise<number> {
  return learningPenalty(window);
}

/**
 * assets/lib DecisionEngineV2와 동일한 롱/숏/관망 평가
 */
export async function evaluateDecision(params: {
  candles: Candle[];
  currentPrice: number;
  swingMode: boolean;
  zones: KeyZones;
  tyRong?: TyRongResult | null;
  evidenceNeed?: number;
}): Promise<FulinkDecision> {
  const {
    candles,
    currentPrice,
    swingMode,
    zones,
    tyRong,
    evidenceNeed = EVIDENCE_NEED,
  } = params;

  const penalty = await conservatismPenalty(160);
  const n = candles.length;

  if (n < 30) {
    const meters: Record<string, number> = {
      '흐름(방향)': 20,
      '차트 모양(안정)': 50,
      '큰손 움직임(흔들기)': 30,
      '쏠림·물량(급등락)': 30,
      '위험도': Math.min(90, 40 + penalty),
    };
    return {
      title: '관망',
      subtitle: `데이터가 아직 부족해요. (캔들 수: ${n})`,
      evidenceHit: 0,
      evidenceTotal: evidenceNeed,
      score: 40,
      confidence: Math.max(10, 40 - penalty),
      meters,
      locked: true,
      action: '관망',
      detail: `데이터가 아직 부족해요. (캔들 수: ${n})`,
    };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const vols = candles.map(c => c.volume);

  const emaFast = ema(closes, 20);
  const emaSlow = ema(closes, 50);
  const rsiSeries = rsi(closes, 14);
  const atrSeries = atr(highs, lows, closes, 14);

  const emaSlope = emaSlow[emaSlow.length - 1]! - (emaSlow[Math.max(0, emaSlow.length - 6)] ?? emaSlow[0]!);
  const trendUp = emaFast[emaFast.length - 1]! > emaSlow[emaSlow.length - 1]! && emaSlope > 0;
  const trendDn = emaFast[emaFast.length - 1]! < emaSlow[emaSlow.length - 1]! && emaSlope < 0;

  const rsiNow = rsiSeries[rsiSeries.length - 1] ?? 50;
  const momentumUp = rsiNow >= 52;
  const momentumDn = rsiNow <= 48;

  const atrPct = (atrSeries[atrSeries.length - 1]! / Math.max(1e-9, currentPrice)) * 100;
  const volatilityOk = swingMode ? atrPct <= 2.6 : atrPct <= 1.6;

  const volSlice = vols.slice(-20);
  const volAvg = volSlice.length ? volSlice.reduce((a, b) => a + b, 0) / volSlice.length : 0;
  const volSpike = vols.length > 0 && volAvg > 0 && vols[vols.length - 1]! > volAvg * 1.6;

  const nearSupport = zones.support != null
    ? Math.abs(currentPrice - zones.support) / currentPrice <= (swingMode ? 0.012 : 0.008)
    : false;
  const nearResistance = zones.resistance != null
    ? Math.abs(currentPrice - zones.resistance) / currentPrice <= (swingMode ? 0.012 : 0.008)
    : false;

  const tyUp = (tyRong?.p3 ?? 50) >= 55 || (tyRong?.p5 ?? 50) >= 55;
  const tyDn = (tyRong?.p3 ?? 50) <= 45 || (tyRong?.p5 ?? 50) <= 45;

  let longHit = 0;
  if (trendUp) longHit++;
  if (momentumUp) longHit++;
  if (volatilityOk) longHit++;
  if (nearSupport) longHit++;
  if (tyUp) longHit++;

  let shortHit = 0;
  if (trendDn) shortHit++;
  if (momentumDn) shortHit++;
  if (volatilityOk) shortHit++;
  if (nearResistance) shortHit++;
  if (tyDn) shortHit++;

  const riskBase = swingMode ? 45 : 55;
  let risk = riskBase + (volSpike ? 12 : 0) + (volatilityOk ? 0 : 15) + penalty;
  risk = Math.max(0, Math.min(100, risk));

  const bestHit = Math.max(longHit, shortHit);
  const bias = longHit === shortHit ? 0 : longHit > shortHit ? 1 : -1;

  let title: '롱' | '숏' | '관망';
  let subtitle: string;

  if (bestHit < 3) {
    title = '관망';
    subtitle = `근거가 아직 부족해요. (롱 ${longHit}/${evidenceNeed} · 숏 ${shortHit}/${evidenceNeed})`;
  } else {
    if (bias > 0) {
      title = '롱';
      subtitle = `근거 ${longHit}/${evidenceNeed} 일치. (스윙 ${swingMode ? 'ON' : 'OFF'})`;
    } else if (bias < 0) {
      title = '숏';
      subtitle = `근거 ${shortHit}/${evidenceNeed} 일치. (스윙 ${swingMode ? 'ON' : 'OFF'})`;
    } else {
      title = '관망';
      subtitle = `롱/숏 근거가 비슷해요. (롱 ${longHit} · 숏 ${shortHit})`;
    }
  }

  const baseScore = 50 + bestHit * 8 - (volSpike ? 5 : 0) - (volatilityOk ? 0 : 8);
  const score = Math.max(0, Math.min(100, baseScore));
  const conf = Math.max(0, Math.min(100, Math.round(55 + bestHit * 7 - risk * 0.35)));

  const meters: Record<string, number> = {
    '흐름(방향)': pctFromBool(trendUp || trendDn, 70, 35),
    '차트 모양(안정)': Math.max(0, Math.min(100, Math.round(100 - atrPct * 18))),
    '큰손 움직임(흔들기)': volSpike ? 70 : 35,
    '쏠림·물량(급등락)': (volSpike ? 65 : 40) + (momentumUp || momentumDn ? 10 : 0),
    '위험도': risk,
  };

  return {
    title,
    subtitle,
    evidenceHit: bestHit,
    evidenceTotal: evidenceNeed,
    score,
    confidence: conf,
    meters,
    locked: bestHit < 2,
    action: title,
    detail: subtitle,
  };
}
