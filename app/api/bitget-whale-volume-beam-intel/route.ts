import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { loadBitgetFuturesChartCandlesCached } from '@/lib/bitgetMarketServerCache';
import { buildBitgetWhaleVolumeCatalog } from '@/lib/bitgetWhaleVolumeCatalog';
import { buildBitgetWhaleVolumeComparePack } from '@/lib/bitgetWhaleVolumeCompare';
import {
  readBitgetWhaleVolumeCatalog,
  writeBitgetWhaleVolumeCatalog,
} from '@/lib/bitgetWhaleVolumeCatalogStore';
import { buildWhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import { buildBitgetWhaleDnaPanel } from '@/lib/bitgetWhaleDnaPanel';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function loadCatalog(symbol: string, tf: string, rebuild: boolean) {
  if (!rebuild) {
    const cached = await readBitgetWhaleVolumeCatalog(symbol, tf);
    if (cached && cached.totalBars >= 80) return cached;
  }
  const candles = await readBitgetFuturesCsv(symbol, tf);
  if (candles.length < 80) return null;
  const catalog = buildBitgetWhaleVolumeCatalog({ symbol, timeframe: tf, candles });
  if (catalog.buckets.length >= 5) {
    await writeBitgetWhaleVolumeCatalog(catalog).catch(() => undefined);
  }
  return catalog;
}

/** Bitget CSV·카탈로그 → 롱빔/숏빔 · 등급 · 진입·목표 (차트·거래량 신호용) */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');
  const rebuild = searchParams.get('rebuild') === '1';

  try {
    const catalog = await loadCatalog(symbol, timeframe, rebuild);
    if (!catalog) {
      return NextResponse.json({ ok: false, error: 'catalog/csv insufficient' }, { status: 400 });
    }
    const { candles } = await loadBitgetFuturesChartCandlesCached(symbol, timeframe, {
      recentOnly: true,
    });
    const compare =
      candles.length >= 25
        ? buildBitgetWhaleVolumeComparePack({ symbol, timeframe, candles, catalog })
        : null;

    const intel = buildWhaleBeamIntelPack({
      symbol,
      timeframe,
      candles,
      catalog,
      singleCandle: compare?.singleCandle ?? null,
      rangeSegment: compare?.rangeSegment ?? null,
    });

    if (!intel) {
      return NextResponse.json({ ok: false, error: 'beam intel insufficient' }, { status: 404 });
    }

    const dnaPanel = buildBitgetWhaleDnaPanel({
      intel,
      single: compare?.singleCandle ?? null,
      range: compare?.rangeSegment ?? null,
      dataSpanKo:
        catalog.dataSpanKo ??
        `${catalog.listingFromKo}~ · ${catalog.totalBars.toLocaleString()}봉`,
    });

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      intel,
      dnaPanel,
      catalogMeta: {
        totalBars: catalog.totalBars,
        eventCount: catalog.eventCount,
        bucketCount: catalog.buckets.length,
        listingFromKo: catalog.listingFromKo,
        dataSpanKo:
          catalog.dataSpanKo ??
          `${catalog.listingFromKo}~ · ${catalog.totalBars.toLocaleString()}봉`,
        builtAt: catalog.builtAt,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'beam-intel failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
