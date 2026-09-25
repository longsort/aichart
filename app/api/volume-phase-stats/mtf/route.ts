import { NextRequest, NextResponse } from 'next/server';
import { computeVolumePhaseMtfBundle } from '@/lib/volumePhaseMtf';
import { VOLUME_PHASE_STATS_TIMEFRAMES } from '@/lib/volumePhaseTimeframes';
import { normalizeChartTimeframe } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const rebuild = searchParams.get('rebuild') === '1';
  const tfParam = searchParams.get('timeframes');
  const timeframes = tfParam
    ? tfParam
        .split(',')
        .map((s) => normalizeChartTimeframe(s.trim()))
        .filter((t) => (VOLUME_PHASE_STATS_TIMEFRAMES as readonly string[]).includes(t))
    : [...VOLUME_PHASE_STATS_TIMEFRAMES];

  try {
    const bundle = await computeVolumePhaseMtfBundle(symbol, timeframes, {
      rebuildMissing: rebuild,
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'volume-phase-stats-mtf failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
