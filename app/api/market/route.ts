import { NextRequest, NextResponse } from 'next/server';
import { getCandlesFromServer } from '@/lib/candlesFromServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '4h';
  try {
    const candles = await getCandlesFromServer(symbol, timeframe);
    const list = candles && candles.length > 0 ? candles : [];
    return NextResponse.json(list.length > 0 ? { ok: true, candles: list } : { ok: false, candles: [] });
  } catch {
    return NextResponse.json({ ok: false, candles: [] });
  }
}
