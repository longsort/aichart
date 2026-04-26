import { NextRequest, NextResponse } from 'next/server';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { computeVolumeShockForecast } from '@/lib/volumeShockForecast';

export const dynamic = 'force-dynamic';

const BARS_PER_DAY: Record<string, number> = {
  '15m': 96,
  '1h': 24,
  '4h': 6,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = (searchParams.get('timeframe') || '15m').toLowerCase();
  const thresholds = (searchParams.get('thresholds') || '5000,10000')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const horizons = (searchParams.get('horizons') || '1,4,12')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const includeDynamic = searchParams.get('includeDynamic') !== '0';
  const lookbackDays = Math.min(90, Math.max(7, parseInt(searchParams.get('lookbackDays') || '30', 10) || 30));
  const bpd = BARS_PER_DAY[timeframe] ?? 96;
  const lookbackBars = lookbackDays * bpd;

  if (timeframe !== '15m' && timeframe !== '1h' && timeframe !== '4h') {
    return NextResponse.json({ ok: false, error: 'timeframe은 15m, 1h, 4h 중 하나여야 합니다' }, { status: 400 });
  }

  try {
    const candles = await readBitgetFuturesCsv(symbol, timeframe);
    const out = computeVolumeShockForecast(candles, {
      thresholds: thresholds.length ? thresholds : [5000, 10000],
      horizons: horizons.length ? horizons : [1, 4, 12],
      timeframe,
      includeDynamic,
      lookbackBars,
    });
    if ('error' in out) {
      return NextResponse.json({ ok: false, error: out.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, symbol, timeframe, source: 'bitget-futures-csv', result: out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'volume-shock-forecast failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
