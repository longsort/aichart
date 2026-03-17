export type TradeRecord = {
  symbol: string;
  timeframe: string;
  entry: number;
  stop: number;
  targets: number[];
  verdict: string;
  result: 'win' | 'loss' | 'pending';
  pnl: number;
  patternTags: string[];
  createdAt: string;
};

export function recordTrade(record: Omit<TradeRecord, 'createdAt'>): TradeRecord {
  return { ...record, createdAt: new Date().toISOString() };
}

export function evaluateTradeResult(
  entry: number,
  stop: number,
  targets: number[],
  exitPrice: number,
  verdict: string
): { result: 'win' | 'loss'; pnl: number } {
  const isLong = verdict === 'LONG';
  if (isLong && exitPrice <= stop) return { result: 'loss', pnl: ((stop - entry) / entry) * -100 };
  if (!isLong && exitPrice >= stop) return { result: 'loss', pnl: ((entry - stop) / entry) * -100 };
  const hitTp = isLong ? targets.some(t => exitPrice >= t) : targets.some(t => exitPrice <= t);
  const pnl = isLong ? ((exitPrice - entry) / entry) * 100 : ((entry - exitPrice) / entry) * 100;
  return { result: hitTp ? 'win' : 'loss', pnl };
}
