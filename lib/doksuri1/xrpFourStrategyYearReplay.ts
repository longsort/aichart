/**
 * XRP 독수리1호 4패턴 · 3m/5m/15m walk-forward 1년 리플레이.
 * 마감봉만 신호 · 미래봉으로 결과만 측정 · 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { detectAllFourStrategies } from '@/lib/doksuri1/fourStrategyDetect';
import type {
  FourStrategyId,
  FourStrategySide,
  FourStrategyGrade,
} from '@/lib/doksuri1/fourStrategyTypes';
import { FOUR_STRATEGY_KO, gradeFromScore } from '@/lib/doksuri1/fourStrategyTypes';

export const XRP_YEAR_REPLAY_TFS = ['3m', '5m', '15m'] as const;
export type XrpYearReplayTf = (typeof XRP_YEAR_REPLAY_TFS)[number];

/** TF별 1년 대략 봉수 + 여유 */
export function yearBarTargetForTf(tf: string): number {
  if (tf === '3m') return 180_000;
  if (tf === '5m') return 110_000;
  if (tf === '15m') return 40_000;
  return 40_000;
}

export type XrpReplayTrade = {
  strategyId: FourStrategyId;
  side: FourStrategySide;
  timeframe: string;
  entryTime: number;
  entry: number;
  stop: number;
  tp1: number;
  score: number;
  grade: FourStrategyGrade;
  bonusScore: number;
  exitReason: 'TP1' | 'SL' | 'TIME';
  exitPrice: number;
  barsHeld: number;
  /** 가격 변동 % (방향 기준 +면 유리) */
  movePct: number;
  mfePct: number;
  maePct: number;
  win: boolean;
};

export type XrpReplayStrategyAgg = {
  strategyId: FourStrategyId;
  labelKo: string;
  tradeCount: number;
  wins: number;
  losses: number;
  /** 상승(롱 유리 또는 숏 유리) 비율 — 승률과 동일 win/n */
  winRate: number | null;
  tpHits: number;
  slHits: number;
  timeExits: number;
  avgWinPct: number;
  avgLossPct: number;
  avgMfePct: number;
  avgMaePct: number;
  /** 단순 합산 movePct (수수료 전) */
  netMovePct: number;
  longCount: number;
  shortCount: number;
  /** 진입가 대비 SL 거리 중앙값 % */
  medianSlDistPct: number;
  /** 진입가 대비 TP1 거리 중앙값 % */
  medianTpDistPct: number;
  noteKo: string;
};

export type XrpReplayTfResult = {
  timeframe: string;
  candleCount: number;
  fromTime: number;
  toTime: number;
  daysCovered: number;
  signals: number;
  trades: XrpReplayTrade[];
  byStrategy: XrpReplayStrategyAgg[];
  summaryKo: string;
};

export type XrpYearReplayPack = {
  symbol: 'XRPUSDT';
  leverage: number;
  feeRoePct: number;
  ranAt: number;
  tfs: XrpReplayTfResult[];
  overall: XrpReplayStrategyAgg[];
  summaryKo: string;
  hintKo: string;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function maxHoldBars(tf: string): number {
  if (tf === '3m') return 40;
  if (tf === '5m') return 36;
  if (tf === '15m') return 32;
  return 36;
}

function cooldownBars(tf: string): number {
  if (tf === '3m') return 8;
  if (tf === '5m') return 6;
  if (tf === '15m') return 4;
  return 6;
}

/**
 * 봉 안 SL/TP 동시 — 보수적으로 SL 우선 (과대평가 방지).
 */
function simulateTrade(params: {
  candles: Candle[];
  fromIdx: number;
  side: FourStrategySide;
  entry: number;
  stop: number;
  tp1: number;
  maxHold: number;
}): {
  exitReason: 'TP1' | 'SL' | 'TIME';
  exitPrice: number;
  barsHeld: number;
  mfePct: number;
  maePct: number;
  movePct: number;
  win: boolean;
} {
  const { candles, fromIdx, side, entry, stop, tp1, maxHold } = params;
  let mfe = 0;
  let mae = 0;
  const end = Math.min(candles.length - 1, fromIdx + maxHold);
  for (let i = fromIdx + 1; i <= end; i++) {
    const c = candles[i]!;
    const hi = Number(c.high);
    const lo = Number(c.low);
    const cl = Number(c.close);
    if (side === 'LONG') {
      const fav = (hi - entry) / entry;
      const adv = (entry - lo) / entry;
      if (fav > mfe) mfe = fav;
      if (adv > mae) mae = adv;
      const hitSl = lo <= stop;
      const hitTp = hi >= tp1;
      if (hitSl && hitTp) {
        const movePct = (stop - entry) / entry;
        return {
          exitReason: 'SL',
          exitPrice: stop,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: movePct * 100,
          win: false,
        };
      }
      if (hitSl) {
        return {
          exitReason: 'SL',
          exitPrice: stop,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: ((stop - entry) / entry) * 100,
          win: false,
        };
      }
      if (hitTp) {
        return {
          exitReason: 'TP1',
          exitPrice: tp1,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: ((tp1 - entry) / entry) * 100,
          win: true,
        };
      }
      if (i === end) {
        const movePct = (cl - entry) / entry;
        return {
          exitReason: 'TIME',
          exitPrice: cl,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: movePct * 100,
          win: movePct > 0,
        };
      }
    } else {
      const fav = (entry - lo) / entry;
      const adv = (hi - entry) / entry;
      if (fav > mfe) mfe = fav;
      if (adv > mae) mae = adv;
      const hitSl = hi >= stop;
      const hitTp = lo <= tp1;
      if (hitSl && hitTp) {
        return {
          exitReason: 'SL',
          exitPrice: stop,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: ((entry - stop) / entry) * 100,
          win: false,
        };
      }
      if (hitSl) {
        return {
          exitReason: 'SL',
          exitPrice: stop,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: ((entry - stop) / entry) * 100,
          win: false,
        };
      }
      if (hitTp) {
        return {
          exitReason: 'TP1',
          exitPrice: tp1,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: ((entry - tp1) / entry) * 100,
          win: true,
        };
      }
      if (i === end) {
        const movePct = (entry - cl) / entry;
        return {
          exitReason: 'TIME',
          exitPrice: cl,
          barsHeld: i - fromIdx,
          mfePct: mfe * 100,
          maePct: mae * 100,
          movePct: movePct * 100,
          win: movePct > 0,
        };
      }
    }
  }
  const last = candles[Math.min(end, candles.length - 1)]!;
  const cl = Number(last.close);
  const movePct = side === 'LONG' ? (cl - entry) / entry : (entry - cl) / entry;
  return {
    exitReason: 'TIME',
    exitPrice: cl,
    barsHeld: Math.max(1, end - fromIdx),
    mfePct: mfe * 100,
    maePct: mae * 100,
    movePct: movePct * 100,
    win: movePct > 0,
  };
}

function aggregateTrades(
  strategyId: FourStrategyId | 'ALL',
  trades: XrpReplayTrade[]
): XrpReplayStrategyAgg {
  const list =
    strategyId === 'ALL' ? trades : trades.filter((t) => t.strategyId === strategyId);
  const wins = list.filter((t) => t.win);
  const losses = list.filter((t) => !t.win);
  const winMoves = wins.map((t) => t.movePct);
  const lossMoves = losses.map((t) => t.movePct);
  const slDists = list.map((t) => (Math.abs(t.entry - t.stop) / t.entry) * 100);
  const tpDists = list.map((t) => (Math.abs(t.tp1 - t.entry) / t.entry) * 100);
  const n = list.length;
  const id = strategyId === 'ALL' ? 'SWEEP_REVERSAL' : strategyId;
  return {
    strategyId: id,
    labelKo: strategyId === 'ALL' ? '전체(참고·합산아님)' : FOUR_STRATEGY_KO[strategyId],
    tradeCount: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n > 0 ? wins.length / n : null,
    tpHits: list.filter((t) => t.exitReason === 'TP1').length,
    slHits: list.filter((t) => t.exitReason === 'SL').length,
    timeExits: list.filter((t) => t.exitReason === 'TIME').length,
    avgWinPct: winMoves.length ? winMoves.reduce((a, b) => a + b, 0) / winMoves.length : 0,
    avgLossPct: lossMoves.length ? lossMoves.reduce((a, b) => a + b, 0) / lossMoves.length : 0,
    avgMfePct: n ? list.reduce((s, t) => s + t.mfePct, 0) / n : 0,
    avgMaePct: n ? list.reduce((s, t) => s + t.maePct, 0) / n : 0,
    netMovePct: list.reduce((s, t) => s + t.movePct, 0),
    longCount: list.filter((t) => t.side === 'LONG').length,
    shortCount: list.filter((t) => t.side === 'SHORT').length,
    medianSlDistPct: median(slDists),
    medianTpDistPct: median(tpDists),
    noteKo:
      n === 0
        ? '표본없음'
        : `승${wins.length}/패${losses.length} · TP${list.filter((t) => t.exitReason === 'TP1').length} · SL${list.filter((t) => t.exitReason === 'SL').length} · 확정아님`,
  };
}

/**
 * 단일 TF walk-forward.
 * stride: 성능용 (1=모든 마감봉).
 */
export function runXrpFourStrategyTfReplay(params: {
  candles: Candle[];
  timeframe: string;
  leverage?: number;
  tp1RoePct?: number;
  stride?: number;
  minBars?: number;
}): XrpReplayTfResult {
  const candles = params.candles;
  const tf = params.timeframe;
  const lev = params.leverage ?? 30;
  const tp1Roe = params.tp1RoePct ?? 5;
  const stride = Math.max(1, params.stride ?? 1);
  const minBars = Math.max(40, params.minBars ?? 48);
  const maxHold = maxHoldBars(tf);
  const cool = cooldownBars(tf);
  const trades: XrpReplayTrade[] = [];
  let nextAllowed = minBars;
  let signals = 0;

  for (let i = minBars; i < candles.length - maxHold - 1; i += stride) {
    if (i < nextAllowed) continue;
    const closed = candles.slice(0, i + 1);
    const sigs = detectAllFourStrategies({
      symbol: 'XRPUSDT',
      timeframe: tf,
      closedCandles: closed,
      leverage: lev,
      tp1RoePct: tp1Roe,
      tp2RoePct: Math.max(tp1Roe + 2, 7),
      tp3RoePct: 10,
    });
    if (!sigs.length) continue;
    const best = sigs[0]!;
    if (best.mandatoryCount < 3 || best.score < 60) continue;
    signals += 1;

    const sim = simulateTrade({
      candles,
      fromIdx: i,
      side: best.side,
      entry: best.entry,
      stop: best.stop,
      tp1: best.tp1,
      maxHold,
    });

    trades.push({
      strategyId: best.strategyId,
      side: best.side,
      timeframe: tf,
      entryTime: Number(candles[i]!.time),
      entry: best.entry,
      stop: best.stop,
      tp1: best.tp1,
      score: best.score,
      grade: best.grade ?? gradeFromScore(best.mandatoryCount, best.score),
      bonusScore: best.bonusScore,
      exitReason: sim.exitReason,
      exitPrice: sim.exitPrice,
      barsHeld: sim.barsHeld,
      movePct: sim.movePct,
      mfePct: sim.mfePct,
      maePct: sim.maePct,
      win: sim.win,
    });
    nextAllowed = i + Math.max(cool, sim.barsHeld);
  }

  const ids: FourStrategyId[] = [
    'SWEEP_REVERSAL',
    'TREND_CONTINUATION',
    'ZONE_DEFENSE',
    'BREAKOUT_RETEST',
  ];
  const byStrategy = ids.map((id) => aggregateTrades(id, trades));
  const fromTime = Number(candles[0]?.time) || 0;
  const toTime = Number(candles[candles.length - 1]?.time) || 0;
  const daysCovered = fromTime > 0 && toTime > fromTime ? (toTime - fromTime) / 86400 : 0;
  const wins = trades.filter((t) => t.win).length;
  const slHits = trades.filter((t) => t.exitReason === 'SL').length;
  const tpHits = trades.filter((t) => t.exitReason === 'TP1').length;

  return {
    timeframe: tf,
    candleCount: candles.length,
    fromTime,
    toTime,
    daysCovered,
    signals,
    trades,
    byStrategy,
    summaryKo: `${tf} · ${daysCovered.toFixed(0)}일 · 봉${candles.length} · 신호${signals} · 승${wins}/전체${trades.length} · TP${tpHits}/SL${slHits} · 확정아님`,
  };
}

export function mergeXrpYearReplayPack(params: {
  tfResults: XrpReplayTfResult[];
  leverage: number;
}): XrpYearReplayPack {
  const allTrades = params.tfResults.flatMap((r) => r.trades);
  const ids: FourStrategyId[] = [
    'SWEEP_REVERSAL',
    'TREND_CONTINUATION',
    'ZONE_DEFENSE',
    'BREAKOUT_RETEST',
  ];
  /** 전략별은 TF 합치지 않고 각각 표시용으로 TF합 참고 행도 제공 — 카드는 전략별 분리 유지 */
  const overall = ids.map((id) => {
    const agg = aggregateTrades(id, allTrades);
    return {
      ...agg,
      noteKo: `${agg.noteKo} · TF합은 참고만(승률합산 금지)`,
    };
  });
  const days = Math.max(0, ...params.tfResults.map((r) => r.daysCovered));
  const n = allTrades.length;
  const wins = allTrades.filter((t) => t.win).length;
  return {
    symbol: 'XRPUSDT',
    leverage: params.leverage,
    feeRoePct: 0,
    ranAt: Date.now(),
    tfs: params.tfResults,
    overall,
    summaryKo: `XRP 4패턴 리플레이 · 약${days.toFixed(0)}일 · 거래${n} · 승${wins} · 전략별 분리 · 확정아님`,
    hintKo:
      '마감봉 신호→이후봉으로 TP1/SL/시간청산 측정 · 동시터치=SL우선 · 수수료미차감 · 확정 수익·승률 아님',
  };
}
