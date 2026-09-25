import { NextRequest, NextResponse } from 'next/server';
import { analyzePatternMemory, listInventory } from '@/lib/patternMemory/engine';
import { syncPatternMemoryAll, syncPatternMemoryTf } from '@/lib/patternMemory/sync';
import { runLookaheadTests } from '@/lib/patternMemory/lookaheadTest';
import { appendPaperTrade, readPaperTrades } from '@/lib/patternMemory/paperStore';
import { fetchBitgetFuturesCandlesBetween, lastBetweenProbe } from '@/lib/bitgetFuturesMarket';
import { FEE_RATE, SLIPPAGE_RATE } from '@/lib/patternMemory/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
/** bust: history-candles backfill */

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const analyzeMemo = new Map<string, { at: number; payload: unknown }>();
const analyzeInflight = new Map<string, Promise<unknown>>();
const ANALYZE_TTL_MS = 12_000;

async function runAnalyze(params: {
  symbol: string;
  timeframe: string;
  asOfMs?: number;
  skipBacktest: boolean;
  fastSync: boolean;
}) {
  return analyzePatternMemory(params);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const action = url.searchParams.get('action') || 'analyze';
  const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = url.searchParams.get('tf') || url.searchParams.get('timeframe') || '15m';
  const asOf = url.searchParams.get('asOf');
  const asOfMs = asOf ? Date.parse(asOf) : undefined;
  try {
    if (action === 'inventory') {
      return NextResponse.json({ ok: true, inventory: listInventory(symbol) });
    }
    if (action === 'lookahead') {
      return NextResponse.json({ ok: true, lookahead: runLookaheadTests() });
    }
    if (action === 'paper') {
      return NextResponse.json({ ok: true, paper: readPaperTrades(symbol, 50) });
    }
    if (action === 'debug-between') {
      const start = Date.parse(url.searchParams.get('start') || '2026-04-01T00:00:00.000Z');
      const end = Date.parse(url.searchParams.get('end') || '2026-05-27T11:15:00.000Z');
      const rawUrl = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${symbol}&productType=usdt-futures&granularity=15m&limit=5&endTime=${end}`;
      let rawN = -1;
      let raw0: unknown = null;
      try {
        const rr = await fetch(rawUrl, { cache: 'no-store' });
        const jj = (await rr.json()) as { data?: unknown[] };
        rawN = Array.isArray(jj.data) ? jj.data.length : -2;
        raw0 = Array.isArray(jj.data) ? jj.data[0] : jj;
      } catch (e) {
        raw0 = e instanceof Error ? e.message : 'fetch fail';
      }
      const rows = await fetchBitgetFuturesCandlesBetween(symbol, timeframe, start, end);
      return NextResponse.json({
        ok: true,
        n: rows.length,
        first: rows[0] || null,
        last: rows[rows.length - 1] || null,
        start,
        end,
        rawN,
        raw0,
        probe: lastBetweenProbe,
      });
    }
    const skipBacktest = url.searchParams.get('backtest') !== '1';
    const fastSync = skipBacktest;
    const memoKey = `${symbol}|${timeframe}|${asOfMs || ''}|bt:${skipBacktest ? 0 : 1}`;
    const cached = analyzeMemo.get(memoKey);
    if (cached && Date.now() - cached.at < ANALYZE_TTL_MS) {
      return NextResponse.json({ ok: true, result: cached.payload });
    }
    let pending = analyzeInflight.get(memoKey);
    if (!pending) {
      pending = runAnalyze({
        symbol,
        timeframe,
        asOfMs: Number.isFinite(asOfMs) ? asOfMs : undefined,
        skipBacktest,
        fastSync,
      }).finally(() => {
        analyzeInflight.delete(memoKey);
      });
      analyzeInflight.set(memoKey, pending);
    }
    const result = await pending;
    analyzeMemo.set(memoKey, { at: Date.now(), payload: result });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'pattern-memory failed', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      symbol?: string;
      timeframe?: string;
      forceFull?: boolean;
      paper?: Parameters<typeof appendPaperTrade>[0];
    };
    const symbol = String(body.symbol || 'BTCUSDT').toUpperCase();
    if (body.action === 'sync') {
      if (body.timeframe) {
        const one = await syncPatternMemoryTf({
          symbol,
          timeframe: body.timeframe,
          forceFull: !!body.forceFull,
          headFill: true,
        });
        return NextResponse.json({
          ok: true,
          incremental: one.incremental,
          logs: one.logs,
          count: one.candles.length,
          repair: one.repair,
        });
      }
      const all = await syncPatternMemoryAll(symbol);
      return NextResponse.json({
        ok: true,
        tfs: all.map((r) => ({
          timeframe: r.timeframe,
          incremental: r.incremental,
          count: r.candles.length,
          logs: r.logs,
          repair: r.repair,
        })),
      });
    }
    if (body.action === 'backtest') {
      const result = await analyzePatternMemory({
        symbol,
        timeframe: body.timeframe || '15m',
        skipBacktest: false,
      });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === 'paper' && body.paper) {
      const row = appendPaperTrade({
        ...body.paper,
        fee: body.paper.fee ?? FEE_RATE,
        slippage: body.paper.slippage ?? SLIPPAGE_RATE,
      });
      return NextResponse.json({ ok: true, paper: row });
    }
    return jsonError('unknown action');
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'pattern-memory post failed', 500);
  }
}
