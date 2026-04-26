/**
 * SuperAgi v7 포팅 (assets/lib core_ai/super_agi_v7.dart)
 * 반응구간 + 스탑헌팅 밴드 + EV + 동적 레버/수량/TP·SL
 * - FuState 대신 최소 입력(캔들, 방향, 진입가, 목표가, 지지/저항) 사용
 */

import type { Candle } from '@/types';

export type SuperAgiV7Input = {
  candles: Candle[];
  finalDir: 'LONG' | 'SHORT' | 'WATCH';
  entry: number;
  target: number;
  reactLow?: number;
  reactHigh?: number;
  s1?: number;  // support
  r1?: number;  // resistance
  signalProb?: number;  // 0..100
  confidence?: number;  // 0..100
  livePrice: number;
  accountUsdt?: number;
  riskPct?: number;
};

export type SuperAgiV7Out = {
  state: string;
  evR: number;
  stopHuntRisk: number;
  huntBandLow: number;
  huntBandHigh: number;
  slRecommended: number;
  qty: number;
  leverage: number;
  tp1: number;
  tp2: number;
  tp3: number;
  managerLine1: string;
  managerLine2: string;
};

function atr14(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const n = Math.min(14, candles.length - 1);
  let sum = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    if (i <= 0) continue;
    const hi = candles[i]!.high;
    const lo = candles[i]!.low;
    const prevClose = candles[i - 1]!.close;
    const tr = Math.max(hi - lo, Math.abs(hi - prevClose), Math.abs(lo - prevClose));
    sum += tr;
  }
  return sum / n;
}

function minLow(candles: Candle[]): number {
  if (!candles.length) return 0;
  let m = candles[0]!.low;
  for (const c of candles) {
    if (c.low < m) m = c.low;
  }
  return m;
}

function maxHigh(candles: Candle[]): number {
  if (!candles.length) return 0;
  let m = candles[0]!.high;
  for (const c of candles) {
    if (c.high > m) m = c.high;
  }
  return m;
}

function swingRange(candles: Candle[]): [number, number] {
  if (candles.length < 5) return [minLow(candles), maxHigh(candles)];
  const start = Math.max(2, candles.length - 50);
  let swingLow = Infinity;
  let swingHigh = -Infinity;
  for (let i = start; i < candles.length - 2; i++) {
    const l = candles[i]!.low;
    const h = candles[i]!.high;
    if (l < candles[i - 1]!.low && l < candles[i - 2]!.low && l < candles[i + 1]!.low && l < candles[i + 2]!.low) {
      swingLow = Math.min(swingLow, l);
    }
    if (h > candles[i - 1]!.high && h > candles[i - 2]!.high && h > candles[i + 1]!.high && h > candles[i + 2]!.high) {
      swingHigh = Math.max(swingHigh, h);
    }
  }
  if (swingLow === Infinity) swingLow = minLow(candles);
  if (swingHigh === -Infinity) swingHigh = maxHigh(candles);
  return [swingLow, swingHigh];
}

function wickCluster(candles: Candle[]): [number, number, number] {
  if (!candles.length) return [0, 0, 0];
  const start = Math.max(0, candles.length - 60);
  const slice = candles.slice(start);
  let wickiness = 0;
  const lows: number[] = [];
  const highs: number[] = [];
  for (const k of slice) {
    lows.push(k.low);
    highs.push(k.high);
    const range = Math.max(1e-9, Math.abs(k.high - k.low));
    const lowerWick = Math.max(0, Math.min(k.open, k.close) - k.low);
    const upperWick = Math.max(0, k.high - Math.max(k.open, k.close));
    wickiness += (lowerWick + upperWick) / range;
  }
  wickiness = Math.max(0, Math.min(2, wickiness / slice.length));
  lows.sort((a, b) => a - b);
  highs.sort((a, b) => a - b);
  const wickLow = lows[Math.floor(lows.length * 0.1)] ?? lows[0] ?? 0;
  const wickHigh = highs[Math.floor(highs.length * 0.9)] ?? highs[highs.length - 1] ?? 0;
  return [wickLow, wickHigh, wickiness / 2];
}

function zoneTouchScore(candles: Candle[], zLow: number, zHigh: number): number {
  if (!candles.length) return 0;
  const start = Math.max(0, candles.length - 30);
  const slice = candles.slice(start);
  let touches = 0;
  for (const k of slice) {
    if (k.low <= zHigh && k.high >= zLow) touches++;
  }
  return Math.max(0, Math.min(1, touches / slice.length));
}

const kAtr = 1.0;
const kZone = 0.2;

export function computeSuperAgiV7(input: SuperAgiV7Input): SuperAgiV7Out {
  const {
    candles,
    finalDir,
    entry: entryInput,
    target: targetInput,
    reactLow: rLow,
    reactHigh: rHigh,
    s1,
    r1,
    signalProb = 50,
    confidence = 50,
    livePrice,
    accountUsdt = 10000,
    riskPct = 1,
  } = input;

  const seed = Math.max(1, Math.min(1e12, accountUsdt));
  const risk = Math.max(0.001, Math.min(0.5, riskPct / 100));
  const riskMoney = seed * risk;

  const price = livePrice;
  const zLow = (rLow != null && rLow > 0) ? rLow : Math.min(s1 ?? price, price);
  const zHigh = (rHigh != null && rHigh > 0) ? rHigh : Math.max(r1 ?? price, price);
  const zWidth = Math.max(1e-9, Math.abs(zHigh - zLow));

  const atr = atr14(candles);
  const buffer = Math.max(atr * kAtr, zWidth * kZone);

  const [swingLow, swingHigh] = swingRange(candles);
  const [wickLow, wickHigh, wickiness] = wickCluster(candles);
  const extremeLow = minLow(candles);
  const extremeHigh = maxHigh(candles);

  const huntLow = Math.min(swingLow, wickLow, extremeLow) - buffer;
  const huntHigh = Math.max(swingHigh, wickHigh, extremeHigh) + buffer;

  const dir = finalDir === 'WATCH' ? 'WATCH' : finalDir;
  const slRec = dir === 'SHORT' ? huntHigh : huntLow;

  const entry = entryInput > 0 ? entryInput : livePrice;
  const stopDist = Math.max(1e-9, Math.abs(entry - slRec));
  const qty = Math.max(0, Math.min(1e12, riskMoney / stopDist));
  const notional = qty * entry;
  const lev = seed > 0 ? Math.min(999, notional / seed) : 0;

  const target = targetInput > 0 ? targetInput : (dir === 'SHORT' ? entry - 3 * stopDist : entry + 3 * stopDist);
  const oneR = stopDist;
  const tp1 = entry + (target - entry) * 0.4;
  const tp2 = entry + (target - entry) * 0.75;
  const tp3 = target;

  const p = Math.max(0.05, Math.min(0.95, (signalProb / 100) || (confidence / 100)));
  const winR = Math.min(50, Math.abs(tp3 - entry) / stopDist);
  const evR = p * winR - (1 - p) * 1;

  const zoneTouches = zoneTouchScore(candles, zLow, zHigh);
  const atrVsWidth = Math.min(5, atr / (zWidth + 1e-9));
  const stopHuntRisk = Math.max(0, Math.min(100, Math.round(wickiness * 55 + zoneTouches * 35 + atrVsWidth * 10)));

  const inside = price >= zLow && price <= zHigh;
  let state = 'WAIT';
  if (stopHuntRisk >= 70) state = 'LOCK';
  else if (inside) {
    const vNow = candles.length ? candles[candles.length - 1]!.volume : 0;
    const volSlice = candles.slice(-20);
    const vAvg = volSlice.length ? volSlice.reduce((a, c) => a + c.volume, 0) / volSlice.length : 0;
    const volOk = vAvg > 0 ? vNow / vAvg >= 1.25 : false;
    if (volOk && p >= 0.55) state = 'CONFIRM';
    else state = 'TEST';
  }

  const stateLabel = (s: string) => {
    switch (s) {
      case 'LOCK': return 'LOCK';
      case 'CONFIRM': return '확정';
      case 'TEST': return '테스트';
      case 'FAIL': return '실패';
      default: return '대기';
    }
  };
  const dirLabel = (d: string) => d === 'LONG' ? '롱' : d === 'SHORT' ? '숏' : '관망';

  const evTxt = `${evR >= 0 ? '+' : ''}${evR.toFixed(2)}R`;
  const line1 = `${stateLabel(state)} · ${dirLabel(dir)} · EV ${evTxt}`;
  const line2 = `헌팅위험 ${stopHuntRisk} · SL ${slRec.toFixed(0)} · 레버 ${lev.toFixed(1)}x`;

  return {
    state,
    evR,
    stopHuntRisk,
    huntBandLow: huntLow,
    huntBandHigh: huntHigh,
    slRecommended: slRec,
    qty,
    leverage: lev,
    tp1,
    tp2,
    tp3,
    managerLine1: line1,
    managerLine2: line2,
  };
}
