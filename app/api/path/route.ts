import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles, fetchMarketCandlesInRange } from '@/lib/market';

const HTF_PERIOD_SEC: Record<string, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900,
  '1h': 3600, '4h': 4 * 3600, '1d': 86400, '1w': 7 * 86400, '1M': 30 * 86400, '1Y': 365 * 86400,
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const htf = searchParams.get('htf') || '4h';
    const ltf = searchParams.get('ltf') || '1h';

    const periodSec = HTF_PERIOD_SEC[htf] ?? 4 * 3600;
    const htfCandles = await fetchMarketCandles(symbol, htf);
    if (!htfCandles.length) {
      return NextResponse.json({ error: 'No HTF candles' }, { status: 400 });
    }
    const last = htfCandles[htfCandles.length - 1];
    const startTimeSec = last.time;
    const endTimeSec = last.time + periodSec;

    const pathCandles = await fetchMarketCandlesInRange(symbol, ltf, startTimeSec, endTimeSec);

    return NextResponse.json({
      htfCandle: { time: last.time, open: last.open, high: last.high, low: last.low, close: last.close },
      path: pathCandles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
      htf,
      ltf,
    });
  } catch (e) {
    console.error('path API', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
