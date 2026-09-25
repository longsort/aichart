import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import { computeVolumeShockForecast } from '@/lib/volumeShockForecast';

export const dynamic = 'force-dynamic';

const ALLOWED_TF = new Set(['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y']);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');
  const thresholds = (searchParams.get('thresholds') || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const horizons = (searchParams.get('horizons') || '1,4,12')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const includeDynamic = searchParams.get('includeDynamic') !== '0';
  const lookbackDays = Math.min(365, Math.max(7, parseInt(searchParams.get('lookbackDays') || '30', 10) || 30));

  if (!ALLOWED_TF.has(timeframe)) {
    return NextResponse.json(
      { ok: false, error: 'timeframe: 1m, 3m, 5m, 15m, 1h, 4h, 1d, 1w, 1M, 1Y 중 하나' },
      { status: 400 }
    );
  }

  try {
    const loaded = await loadVolumeShockCandles(symbol, timeframe, lookbackDays);
    if ('error' in loaded) {
      return NextResponse.json({ ok: false, error: loaded.error }, { status: 400 });
    }

    const fixed =
      thresholds.length > 0
        ? thresholds
        : loaded.fixedThresholds.length
          ? loaded.fixedThresholds
          : [];

    const out = computeVolumeShockForecast(loaded.candles, {
      thresholds: fixed,
      horizons: horizons.length ? horizons : [1, 4, 12],
      timeframe,
      includeDynamic,
      lookbackBars: loaded.lookbackBars,
      dataSource: loaded.source,
    });
    if ('error' in out) {
      return NextResponse.json({ ok: false, error: out.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      source: loaded.source,
      result: out,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'volume-shock-forecast failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
