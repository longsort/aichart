import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { computeVolumeShockMtfBundle } from '@/lib/volumeShockMtf';
import { VOLUME_SHOCK_MTF_TIMEFRAMES } from '@/lib/volumeShockThresholds';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const lookbackDays = Math.min(365, Math.max(7, parseInt(searchParams.get('lookbackDays') || '30', 10) || 30));
  const tfParam = searchParams.get('timeframes');
  const timeframes = tfParam
    ? tfParam
        .split(',')
        .map((s) => normalizeChartTimeframe(s.trim()))
        .filter((t) => VOLUME_SHOCK_MTF_TIMEFRAMES.includes(t as (typeof VOLUME_SHOCK_MTF_TIMEFRAMES)[number]))
    : [...VOLUME_SHOCK_MTF_TIMEFRAMES];

  try {
    const bundle = await computeVolumeShockMtfBundle(symbol, timeframes, lookbackDays);
    return NextResponse.json({ ok: true, bundle });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'volume-shock-mtf failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
