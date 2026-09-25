import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import { phaseLookbackDaysForTf } from '@/lib/volumePhaseTimeframes';
import { computeAmzStatsFromCandles } from '@/lib/aiMarketZone/statsEngine';
import { readAmzStats, writeAmzStats } from '@/lib/aiMarketZone/statsStore';
import type { Candle } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function loadCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  try {
    const csv = await readBitgetFuturesCsv(symbol, timeframe);
    if (csv.length >= 100) return csv;
  } catch {
    /* fallback */
  }
  const loaded = await loadVolumeShockCandles(symbol, timeframe, phaseLookbackDaysForTf(timeframe));
  if ('error' in loaded) return [];
  return loaded.candles;
}

/**
 * AI Market Zone Replay 통계 (내부 보정).
 * 확정 승률 UI 금지 — sampleLowTrust 시 WAIT.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '4h');
  const rebuild = searchParams.get('rebuild') === '1';

  try {
    let file = rebuild ? null : await readAmzStats(symbol, timeframe);
    let fromCache = Boolean(file);

    if (!file) {
      const candles = await loadCandles(symbol, timeframe);
      if (candles.length < 100) {
        return NextResponse.json(
          { ok: false, error: 'DATA INSUFFICIENT · candles < 100' },
          { status: 400 }
        );
      }
      file = computeAmzStatsFromCandles({
        symbol,
        timeframe,
        candles,
        stride: 4,
        maxSteps: 50,
      });
      if (file.eventCount >= 5) {
        await writeAmzStats(file).catch(() => undefined);
      }
      fromCache = false;
    }

    return NextResponse.json({
      ok: true,
      stats: file,
      fromCache,
      internalOnly: true,
      disclaimerKo: file.disclaimerKo,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ai-market-zone-stats failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
