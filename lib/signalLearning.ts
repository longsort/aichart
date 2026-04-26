import type { Candle } from '@/types';
import { computeTradePlan } from './tradePlanner';

type SignalDir = 'LONG' | 'SHORT';

export type SignalHistoryPoint = {
  time: number;
  verdict: SignalDir;
  weight?: number;
  /** 구조 로켓 등: 있으면 이 SL/TP로 선행 바에서 TP·SL 판정 */
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
};

type Outcome = 'TP1' | 'TP2' | 'TP3' | 'SL' | 'OPEN';

export type SignalLearningEvent = {
  time: number;
  verdict: SignalDir;
  weight: number;
  entry: number;
  stopLoss: number;
  targets: [number, number, number];
  outcome: Outcome;
  barsToOutcome: number | null;
};

export type SignalLearningStats = {
  total: number;
  longCount: number;
  shortCount: number;
  tp1Count: number;
  tp2Count: number;
  tp3Count: number;
  slCount: number;
  openCount: number;
  successRate: number;
  failRate: number;
  recent: SignalLearningEvent[];
  walkForward: {
    trainWinRate: number;
    oosWinRate: number;
    oosPassed: boolean;
    oosSamples: number;
  };
  suggestedThreshold: number;
  /** 선행 봉에서 SL 먼저 맞춘 신호(차트 L/S·로켓 숨김용) */
  slFailures: Array<{ time: number; verdict: SignalDir }>;
};

/** 과거 신호가 매우 많을 때 루프 상한(봉×신호×horizon 폭주 방지) — RSI·확정·구조로켓 병합 대비 확대 */
const LEARNING_MAX_SIGNAL_POINTS = 360;

function horizonForTimeframe(timeframe: string): number {
  if (timeframe === '1m' || timeframe === '3m' || timeframe === '5m') return 120;
  if (timeframe === '15m' || timeframe === '1h') return 90;
  if (timeframe === '4h') return 72;
  if (timeframe === '1d') return 40;
  if (timeframe === '1w') return 20;
  if (timeframe === '1M') return 12;
  return 80;
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
  return count > 0 ? sumTr / count : Math.max(1, candles[idx]?.close * 0.01);
}

export function evaluateSignalLearning(
  candles: Candle[],
  history: SignalHistoryPoint[],
  timeframe: string
): SignalLearningStats {
  const points = history
    .filter((x) => x.time != null && (x.verdict === 'LONG' || x.verdict === 'SHORT'))
    .sort((a, b) => a.time - b.time)
    .slice(-LEARNING_MAX_SIGNAL_POINTS);
  const byTime = new Map<number, number>();
  candles.forEach((c, i) => byTime.set(c.time, i));

  const horizon = horizonForTimeframe(timeframe);
  const events: SignalLearningEvent[] = [];

  for (const p of points) {
    const idx = byTime.get(p.time);
    if (idx == null || idx < 20 || idx >= candles.length - 2) continue;
    const c = candles[idx];
    const lookback = candles.slice(Math.max(0, idx - 60), idx + 1);
    const rangeLow = Math.min(...lookback.map((x) => x.low));
    const rangeHigh = Math.max(...lookback.map((x) => x.high));
    const atr = atrLike(candles, idx, 14);
    const plan = computeTradePlan({
      signal: p.verdict,
      currentPrice: c.close,
      equilibrium: c.close,
      rangeHigh,
      rangeLow,
      atr,
      timeframe,
    });
    const [tp1, tp2, tp3] = plan.targets as [number, number, number];
    let stopLossPx = plan.stopLoss;
    let entryPx = plan.entry;
    let tp1x = tp1;
    let tp2x = tp2;
    let tp3x = tp3;
    if (p.stopLoss != null && Number.isFinite(Number(p.stopLoss))) {
      stopLossPx = Number(p.stopLoss);
      if (p.entryPrice != null && Number.isFinite(Number(p.entryPrice))) entryPx = Number(p.entryPrice);
      if (p.takeProfit != null && Number.isFinite(Number(p.takeProfit))) {
        tp1x = Number(p.takeProfit);
        if (p.verdict === 'LONG') {
          tp2x = tp1x + (tp2 - tp1);
          tp3x = tp2x + (tp3 - tp2);
        } else {
          tp2x = tp1x - (tp1 - tp2);
          tp3x = tp2x - (tp2 - tp3);
        }
      }
    }

    let outcome: Outcome = 'OPEN';
    let barsToOutcome: number | null = null;
    for (let j = idx + 1; j < Math.min(candles.length, idx + 1 + horizon); j++) {
      const f = candles[j];
      const hitSl = p.verdict === 'LONG' ? f.low <= stopLossPx : f.high >= stopLossPx;
      const hitTp1 = p.verdict === 'LONG' ? f.high >= tp1x : f.low <= tp1x;
      const hitTp2 = p.verdict === 'LONG' ? f.high >= tp2x : f.low <= tp2x;
      const hitTp3 = p.verdict === 'LONG' ? f.high >= tp3x : f.low <= tp3x;

      // 보수적 처리: 같은 봉에서 TP/SL 동시 충족이면 SL 우선.
      if (hitSl) {
        outcome = 'SL';
        barsToOutcome = j - idx;
        break;
      }
      if (hitTp3) {
        outcome = 'TP3';
        barsToOutcome = j - idx;
        break;
      }
      if (hitTp2) {
        outcome = 'TP2';
        barsToOutcome = j - idx;
        break;
      }
      if (hitTp1) {
        outcome = 'TP1';
        barsToOutcome = j - idx;
        break;
      }
    }

    const weight = Math.max(0.25, Math.min(1.0, Number(p.weight ?? 1)));
    events.push({
      time: p.time,
      verdict: p.verdict,
      weight,
      entry: entryPx,
      stopLoss: stopLossPx,
      targets: [tp1x, tp2x, tp3x],
      outcome,
      barsToOutcome,
    });
  }

  const weightedCount = (f: (e: SignalLearningEvent) => boolean) =>
    events.reduce((acc, e) => acc + (f(e) ? e.weight : 0), 0);
  const tp1CountW = weightedCount((e) => e.outcome === 'TP1' || e.outcome === 'TP2' || e.outcome === 'TP3');
  const tp2CountW = weightedCount((e) => e.outcome === 'TP2' || e.outcome === 'TP3');
  const tp3CountW = weightedCount((e) => e.outcome === 'TP3');
  const slCountW = weightedCount((e) => e.outcome === 'SL');
  const openCountW = weightedCount((e) => e.outcome === 'OPEN');
  const tp1Count = Math.round(tp1CountW * 10) / 10;
  const tp2Count = Math.round(tp2CountW * 10) / 10;
  const tp3Count = Math.round(tp3CountW * 10) / 10;
  const slCount = Math.round(slCountW * 10) / 10;
  const openCount = Math.round(openCountW * 10) / 10;
  const closed = tp1Count + slCount;
  // Low-sample neutral prior: avoid forcing WATCH only because history is sparse on higher TFs.
  const priorWinRate = 55;
  const successRate = closed > 0 ? Math.round((tp1Count / closed) * 1000) / 10 : priorWinRate;
  const failRate = closed > 0 ? Math.round((slCount / closed) * 1000) / 10 : (100 - priorWinRate);
  const closedEvents = events.filter((e) => e.outcome !== 'OPEN');
  const splitIdx = Math.floor(closedEvents.length * 0.7);
  const train = closedEvents.slice(0, splitIdx);
  const oos = closedEvents.slice(splitIdx);
  const trainWins = train.filter((e) => e.outcome !== 'SL').length;
  const oosWins = oos.filter((e) => e.outcome !== 'SL').length;
  const trainWinRate = train.length > 0 ? Math.round((trainWins / train.length) * 1000) / 10 : 0;
  const oosWinRate = oos.length > 0 ? Math.round((oosWins / oos.length) * 1000) / 10 : 0;
  const oosPassed = oos.length >= 8 ? oosWinRate >= 52 : oosWinRate >= 56;
  const suggestedThreshold = Math.max(50, Math.min(70, Math.round(60 - ((oosWinRate - 50) * 0.35))));
  const slFailures = events.filter((e) => e.outcome === 'SL').map((e) => ({ time: e.time, verdict: e.verdict }));

  return {
    total: events.length,
    longCount: events.filter((e) => e.verdict === 'LONG').length,
    shortCount: events.filter((e) => e.verdict === 'SHORT').length,
    tp1Count,
    tp2Count,
    tp3Count,
    slCount,
    openCount,
    successRate,
    failRate,
    recent: events.slice(-12).reverse(),
    walkForward: {
      trainWinRate,
      oosWinRate,
      oosPassed,
      oosSamples: oos.length,
    },
    suggestedThreshold,
    slFailures,
  };
}

