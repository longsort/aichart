import { Candle } from '@/types';
import { analyzeCandles } from './analyze';
import { visibleLimit } from './constants';

export type BacktestTrade = {
  entryIdx: number;
  entryPrice: number;
  entryTime: number;
  exitIdx: number;
  exitPrice: number;
  exitTime: number;
  verdict: 'LONG' | 'SHORT';
  pnlPct: number;
  hitStop: boolean;
  hitTarget: number;
};

export type BacktestResult = {
  trades: BacktestTrade[];
  winRate: number;
  totalTrades: number;
  totalPnlPct: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
};

export async function runBacktest(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  options?: { lookback?: number }
): Promise<BacktestResult> {
  const lookback = options?.lookback ?? 300;
  const trades: BacktestTrade[] = [];
  let peak = 100;
  let equity = 100;
  let maxDrawdown = 0;
  let lastEntryIdx = -50;

  for (let i = lookback; i < candles.length - 30; i += 20) {
    const slice = candles.slice(0, i + 1);
    if (i - lastEntryIdx < 30) continue;
    const analysis = analyzeCandles(symbol, timeframe, slice);
    if (analysis.verdict === 'WATCH') continue;

    const entry = parseFloat(analysis.entry);
    const stop = parseFloat(analysis.stopLoss);
    const targets = analysis.targets.map(t => parseFloat(t));
    const entryCandle = slice[slice.length - 1];
    const future = candles.slice(i + 1, i + 50);

    for (let j = 0; j < future.length; j++) {
      const c = future[j];
      const high = c.high;
      const low = c.low;
      const close = c.close;

      if (analysis.verdict === 'LONG') {
        if (low <= stop) {
          const pnl = ((stop - entry) / entry) * 100;
          trades.push({
            entryIdx: i,
            entryPrice: entry,
            entryTime: entryCandle.time,
            exitIdx: i + j + 1,
            exitPrice: stop,
            exitTime: c.time,
            verdict: 'LONG',
            pnlPct: pnl,
            hitStop: true,
            hitTarget: 0,
          });
          equity *= 1 + pnl / 100;
          break;
        }
        const tp1 = targets[0];
        if (high >= tp1) {
          const pnl = ((tp1 - entry) / entry) * 100;
          trades.push({
            entryIdx: i,
            entryPrice: entry,
            entryTime: entryCandle.time,
            exitIdx: i + j + 1,
            exitPrice: tp1,
            exitTime: c.time,
            verdict: 'LONG',
            pnlPct: pnl,
            hitStop: false,
            hitTarget: 1,
          });
          equity *= 1 + pnl / 100;
          lastEntryIdx = i;
          break;
        }
      } else {
        if (high >= stop) {
          const pnl = ((entry - stop) / entry) * 100;
          trades.push({
            entryIdx: i,
            entryPrice: entry,
            entryTime: entryCandle.time,
            exitIdx: i + j + 1,
            exitPrice: stop,
            exitTime: c.time,
            verdict: 'SHORT',
            pnlPct: pnl,
            hitStop: true,
            hitTarget: 0,
          });
          equity *= 1 + pnl / 100;
          lastEntryIdx = i;
          break;
        }
        const tp1 = targets[0];
        if (low <= tp1) {
          const pnl = ((entry - tp1) / entry) * 100;
          trades.push({
            entryIdx: i,
            entryPrice: entry,
            entryTime: entryCandle.time,
            exitIdx: i + j + 1,
            exitPrice: tp1,
            exitTime: c.time,
            verdict: 'SHORT',
            pnlPct: pnl,
            hitStop: false,
            hitTarget: 1,
          });
          equity *= 1 + pnl / 100;
          lastEntryIdx = i;
          break;
        }
      }
    }

    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  const wins = trades.filter(t => t.pnlPct > 0);
  const losses = trades.filter(t => t.pnlPct <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnlPct, 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;

  return {
    trades: trades.slice(-50),
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    totalTrades: trades.length,
    totalPnlPct: totalPnl,
    avgWinPct: avgWin,
    avgLossPct: avgLoss,
    maxDrawdownPct: (maxDrawdown / peak) * 100,
  };
}
