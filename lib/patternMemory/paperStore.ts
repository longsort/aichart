/**
 * Live paper trades — separate JSONL from backtest cache.
 */
import { appendUtf8, readUtf8IfExists } from '@/lib/patternMemory/nodeFs';
import { ensurePatternMemoryDirs, paperRel } from '@/lib/patternMemory/uniqueStore';

export type PaperTradeRow = {
  id: string;
  symbol: string;
  timeframe: string;
  signalTime: number;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entry: number | null;
  sl: number | null;
  tp: number | null;
  predictedProbability: number | null;
  confidence: number | null;
  expectedMfe: number | null;
  expectedMae: number | null;
  actualMfe: number | null;
  actualMae: number | null;
  tpHit: boolean | null;
  slHit: boolean | null;
  outcome: 'TP' | 'SL' | 'NONE' | 'AMBIGUOUS' | 'WAIT' | 'OPEN' | null;
  fee: number;
  slippage: number;
  model: 'CANDLE_ONLY' | 'CANDLE_VOLUME' | 'BOTH';
  storedAt: number;
};

export function appendPaperTrade(row: Omit<PaperTradeRow, 'id' | 'storedAt'> & { id?: string }): PaperTradeRow {
  ensurePatternMemoryDirs();
  const full: PaperTradeRow = {
    ...row,
    id: row.id || `pm-${row.symbol}-${row.signalTime}-${row.timeframe}`,
    storedAt: Date.now(),
  };
  appendUtf8(paperRel(row.symbol), JSON.stringify(full) + '\n');
  return full;
}

export function readPaperTrades(symbol: string, limit = 40): PaperTradeRow[] {
  const text = readUtf8IfExists(paperRel(symbol));
  if (text == null) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out: PaperTradeRow[] = [];
  for (const line of lines.slice(-Math.max(1, limit))) {
    try {
      out.push(JSON.parse(line) as PaperTradeRow);
    } catch {
      /* skip */
    }
  }
  return out;
}
