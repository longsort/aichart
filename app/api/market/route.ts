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
    let candles = fromServer && fromServer.length > 0 ? fromServer : null;
    if (!candles?.length) {
      try {
        candles = await fetchMarketCandles(symbol, timeframe);
      } catch {
        candles = [];
      }
    }
    return NextResponse.json({ ok: true, candles: candles || [] });
  } catch (error: any) {
    return NextResponse.json({ ok: true, candles: [], error: error?.message }, { status: 200 });
  }
}
