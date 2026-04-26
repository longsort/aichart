import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  try {
    const candles = await fetchMarketCandles(symbol, timeframe);
    return NextResponse.json({ ok: true, candles });
  } catch (error: any) {
    return NextResponse.json({ ok: false, candles: [], error: error?.message || 'market fetch failed' }, { status: 500 });
  }
}
