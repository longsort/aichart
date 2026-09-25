import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { isBitgetPerpChartSymbol, loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');

  if (!isBitgetPerpChartSymbol(symbol)) {
    return NextResponse.json({ ok: false, error: 'USDT-M 심볼만 지원' }, { status: 400 });
  }
  if (!ALLOWED.has(timeframe)) {
    return NextResponse.json({ ok: false, error: '지원하지 않는 timeframe' }, { status: 400 });
  }

  try {
    const depth = String(searchParams.get('depth') || '').toLowerCase();
    const recentOnly = depth === 'recent' || depth === 'analyze';
    const { candles, source } = await loadBitgetFuturesChartCandles(
      symbol,
      timeframe,
      recentOnly ? { recentOnly: true } : undefined
    );
    return NextResponse.json({
      ok: true,
      candles,
      source,
      label: 'Bitget BTCUSDT.P (USDT-M)',
      mode: recentOnly ? 'analyze' : 'chart',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'market-bitget failed';
    return NextResponse.json({ ok: false, candles: [], error: msg }, { status: 500 });
  }
}
