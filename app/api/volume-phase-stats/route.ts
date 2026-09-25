import { NextRequest, NextResponse } from 'next/server';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import {
  computeVolumePhaseStatsFromCandles,
  matchCurrentPhase,
  type VolumePhaseCurrentMatch,
  type VolumePhaseStatsFile,
} from '@/lib/volumePhaseStats';
import { readVolumePhaseStats, writeVolumePhaseStats } from '@/lib/volumePhaseStatsStore';
import {
  isVolumePhaseStatsTimeframe,
  parentHtfForPhaseStats,
  phaseHorizonsForTf,
  phaseLookbackDaysForTf,
} from '@/lib/volumePhaseTimeframes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');
  const rebuild = searchParams.get('rebuild') === '1';
  const htfParam = searchParams.get('htf');

  if (!isVolumePhaseStatsTimeframe(timeframe)) {
    return NextResponse.json({ ok: false, error: 'unsupported timeframe' }, { status: 400 });
  }

  try {
    let file: VolumePhaseStatsFile | null = rebuild ? null : await readVolumePhaseStats(symbol, timeframe);
    let candles: Candle[] = [];

    if (!file || rebuild) {
      const loaded = await loadVolumeShockCandles(symbol, timeframe, phaseLookbackDaysForTf(timeframe));
      if ('error' in loaded) {
        return NextResponse.json({ ok: false, error: loaded.error }, { status: 400 });
      }
      candles = loaded.candles;
      const htfTf = normalizeChartTimeframe(htfParam || parentHtfForPhaseStats(timeframe) || '1d');
      let htfCandles: Awaited<ReturnType<typeof readBitgetFuturesCsv>> = [];
      try {
        htfCandles = await readBitgetFuturesCsv(symbol, htfTf);
      } catch {
        /* optional */
      }
      file = computeVolumePhaseStatsFromCandles(symbol, timeframe, candles, {
        htfCandles: htfCandles.length >= 30 ? htfCandles : undefined,
        horizons: phaseHorizonsForTf(timeframe),
      });
      if (rebuild && file.eventCount >= 10) {
        await writeVolumePhaseStats(file).catch(() => undefined);
      }
    } else {
      try {
        const csv = await readBitgetFuturesCsv(symbol, timeframe);
        if (csv.length >= 80) candles = csv;
      } catch {
        const loaded = await loadVolumeShockCandles(symbol, timeframe, phaseLookbackDaysForTf(timeframe));
        if (!('error' in loaded)) candles = loaded.candles;
      }
    }

    let current: VolumePhaseCurrentMatch | null = null;
    if (candles.length >= 80 && file) {
      const htfTf = normalizeChartTimeframe(htfParam || parentHtfForPhaseStats(timeframe) || '1d');
      let htfCandles: Awaited<ReturnType<typeof readBitgetFuturesCsv>> = [];
      try {
        htfCandles = await readBitgetFuturesCsv(symbol, htfTf);
      } catch {
        /* optional */
      }
      current = matchCurrentPhase(candles, timeframe, file, htfCandles.length >= 30 ? htfCandles : undefined);
    }

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      stats: file,
      current,
      fromCache: !rebuild,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'volume-phase-stats failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
