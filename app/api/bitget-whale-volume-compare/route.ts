import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { loadBitgetFuturesChartCandlesCached } from '@/lib/bitgetMarketServerCache';
import { buildBitgetWhaleVolumeComparePack } from '@/lib/bitgetWhaleVolumeCompare';
import {
  BITGET_WHALE_CATALOG_TFS,
  buildBitgetWhaleVolumeCatalog,
  buildWhaleVolumeMtfPack,
  matchCurrentWhaleVolume,
} from '@/lib/bitgetWhaleVolumeCatalog';
import {
  readBitgetWhaleVolumeCatalog,
  writeBitgetWhaleVolumeCatalog,
} from '@/lib/bitgetWhaleVolumeCatalogStore';

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

/** 현재 vs 과거 유사 거래량·캔들 비교 (Bitget CSV + 카탈로그) */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');
  const mtf = searchParams.get('mtf') === '1';
  const rebuild = searchParams.get('rebuild') === '1';

  try {
    const catalog = await loadCatalog(symbol, timeframe, rebuild);
    if (!catalog) {
      return NextResponse.json({ ok: false, error: 'catalog/csv insufficient' }, { status: 400 });
    }
    const { candles } = await loadBitgetFuturesChartCandlesCached(symbol, timeframe, {
      recentOnly: true,
    });
    const compare = buildBitgetWhaleVolumeComparePack({
      symbol,
      timeframe,
      candles,
      catalog,
    });
    if (!compare) {
      return NextResponse.json({ ok: false, error: 'no current whale match' }, { status: 404 });
    }

    let mtfPack = null;
    if (mtf) {
      const rows = await Promise.all(
        BITGET_WHALE_CATALOG_TFS.map(async (tf) => {
          try {
            const cat = await loadCatalog(symbol, tf, false);
            if (!cat) return { tf, match: null, ok: false as const, error: 'no catalog' };
            const { candles: cs } = await loadBitgetFuturesChartCandlesCached(symbol, tf, {
              recentOnly: true,
            });
            const match = cs.length >= 25 ? matchCurrentWhaleVolume(cs, cat) : null;
            return { tf, match, ok: true as const };
          } catch (e) {
            return {
              tf,
              match: null,
              ok: false as const,
              error: e instanceof Error ? e.message : 'failed',
            };
          }
        })
      );
      mtfPack = buildWhaleVolumeMtfPack({ symbol, rows });
    }

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      compare,
      mtfPack,
      dataSource: {
        csvBars: candles.length,
        catalogBuckets: catalog.buckets.length,
        listingFromKo: catalog.listingFromKo,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'bitget-whale-volume-compare failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
