import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles } from '@/lib/market';
import { getCandlesFromServer } from '@/lib/candlesFromServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  try {
    const fromServer = await getCandlesFromServer(symbol, timeframe);
    const candles = fromServer && fromServer.length > 0 ? fromServer : await fetchMarketCandles(symbol, timeframe);
    return NextResponse.json({ ok: true, candles });
  } catch (error: any) {
    return NextResponse.json({ ok: false, candles: [], error: error?.message || 'market fetch failed' }, { status: 500 });
  }
}
