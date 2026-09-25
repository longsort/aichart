import { NextRequest, NextResponse } from 'next/server';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { buildBitgetWhaleVolumeCatalog } from '@/lib/bitgetWhaleVolumeCatalog';
import type { BitgetWhaleVolumeCatalog } from '@/lib/bitgetWhaleVolumeCatalog';
import {
  readBitgetWhaleVolumeCatalog,
  writeBitgetWhaleVolumeCatalog,
} from '@/lib/bitgetWhaleVolumeCatalogStore';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import { phaseLookbackDaysForTf } from '@/lib/volumePhaseTimeframes';
import { computeSwingAnchorVolumeStats } from '@/lib/mergedDeskSwingAnchorVolumeStats';
import {
  readSwingAnchorVolumeStats,
  writeSwingAnchorVolumeStats,
} from '@/lib/swingAnchorVolumeStatsStore';

export const dynamic = 'force-dynamic';

async function loadCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  try {
    const csv = await readBitgetFuturesCsv(symbol, timeframe);
    if (csv.length >= 80) return csv;
  } catch {
    /* fallback */
  }
  const loaded = await loadVolumeShockCandles(symbol, timeframe, phaseLookbackDaysForTf(timeframe));
  if ('error' in loaded) return [];
  return loaded.candles;
}

async function loadCatalog(symbol: string, timeframe: string, candles: Candle[]) {
  const tf = normalizeChartTimeframe(timeframe);
  let catalog = await readBitgetWhaleVolumeCatalog(symbol, tf);
  if (!catalog && candles.length >= 80) {
    catalog = buildBitgetWhaleVolumeCatalog({ symbol, timeframe: tf, candles });
    if (catalog.buckets.length >= 5) {
      await writeBitgetWhaleVolumeCatalog(catalog).catch(() => undefined);
    }
  }
  return catalog;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '4h');
  const rebuild = searchParams.get('rebuild') === '1';

  try {
    let file = rebuild ? null : await readSwingAnchorVolumeStats(symbol, timeframe);
    let fromCache = Boolean(file);

    if (!file) {
      const candles = await loadCandles(symbol, timeframe);
      if (candles.length < 80) {
        return NextResponse.json(
          { ok: false, error: 'insufficient candles for swing-anchor stats' },
          { status: 400 }
        );
      }
      const catalog = await loadCatalog(symbol, timeframe, candles);
      file = computeSwingAnchorVolumeStats({
        symbol,
        timeframe,
        candles,
        catalog,
      });
      if (file.eventCount >= 5) {
        await writeSwingAnchorVolumeStats(file).catch(() => undefined);
      }
      fromCache = false;
    }

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      stats: file,
      fromCache,
      /** 내부 보정용 — UI 승률 표시 금지 */
      internalOnly: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'swing-anchor-volume-stats failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
