import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles, type FetchMarketCandlesMode } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  /** recent|analyze = 짧은 구간 즉시 · full|chart|생략 = 2017~전량(1d/1w/1M) */
  const depth = String(searchParams.get('depth') || '').toLowerCase();
  const mode: FetchMarketCandlesMode =
    depth === 'recent' || depth === 'analyze' ? 'analyze' : 'chart';
  try {
    const candles = await fetchMarketCandles(symbol, timeframe, mode);
    return NextResponse.json({ ok: true, candles, mode });
  } catch (error: any) {
    return NextResponse.json({ ok: false, candles: [], error: error?.message || 'market fetch failed' }, { status: 500 });
  }
}
