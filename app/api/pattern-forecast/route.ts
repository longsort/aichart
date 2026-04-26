import { NextRequest, NextResponse } from 'next/server';
import { MARKET_BARS_3Y } from '@/lib/constants';
import { fetchMarketCandlesExtended } from '@/lib/market';
import { computePatternForecast } from '@/lib/patternForecast';

export const dynamic = 'force-dynamic';
/** 15m 3년분 페이지 수집 + 유사도 스캔 시 시간 여유 */
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '15m';
  const patternBars = Math.min(96, Math.max(8, parseInt(searchParams.get('patternBars') || '32', 10) || 32));
  const defaultMax =
    MARKET_BARS_3Y[timeframe as keyof typeof MARKET_BARS_3Y] ?? MARKET_BARS_3Y['15m'];
  const maxBars = Math.min(110_000, Math.max(400, parseInt(searchParams.get('maxBars') || String(defaultMax), 10) || defaultMax));
  const topK = Math.min(24, Math.max(5, parseInt(searchParams.get('topK') || '12', 10) || 12));
  const horizonsStr = searchParams.get('horizons') || '1,4,12';
  const horizons = horizonsStr
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  try {
    const candles = await fetchMarketCandlesExtended(symbol, timeframe, maxBars);
    const out = computePatternForecast(candles, {
      patternBars,
      horizons: horizons.length ? horizons : [1, 4, 12],
      topK,
    });
    if ('error' in out) {
      return NextResponse.json({ ok: false, error: out.error, candles: candles.length }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      candlesUsed: candles.length,
      forecast: out,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'pattern-forecast failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
