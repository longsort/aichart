import { NextRequest, NextResponse } from 'next/server';
import { getCandlesFromServer } from '@/lib/candlesFromServer';
import { runBacktest } from '@/lib/backtest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  try {
    const candles = await getCandlesFromServer(symbol, timeframe);
    const list = candles && candles.length > 0 ? candles : [];
    if (list.length === 0) {
      return NextResponse.json({ ok: false, error: 'No candles' });
    }
    const result = await runBacktest(symbol, timeframe, list);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'backtest failed' });
  }
}
