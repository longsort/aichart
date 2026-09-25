import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
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
import { buildBitgetWhaleVolumeComparePack } from '@/lib/bitgetWhaleVolumeCompare';

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

/** Bitget 고래 BTC 티어 + 캔들 지문 — 실시간 롱/숏 참고 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');
  const mtf = searchParams.get('mtf') === '1';
  const rebuild = searchParams.get('rebuild') === '1';

  try {
    if (mtf) {
      const rows: Array<{ tf: string; match: ReturnType<typeof matchCurrentWhaleVolume>; ok: boolean; error?: string }> =
        [];
      for (const tf of BITGET_WHALE_CATALOG_TFS) {
        try {
          const catalog = await loadCatalog(symbol, tf, rebuild);
          if (!catalog) {
            rows.push({ tf, match: null, ok: false, error: 'CSV/카탈로그 없음' });
            continue;
          }
          const { candles } = await loadBitgetFuturesChartCandles(symbol, tf);
          const match = candles.length >= 25 ? matchCurrentWhaleVolume(candles, catalog) : null;
          rows.push({ tf, match, ok: true });
        } catch (e) {
          rows.push({
            tf,
            match: null,
            ok: false,
            error: e instanceof Error ? e.message : 'failed',
          });
        }
      }
      const pack = buildWhaleVolumeMtfPack({ symbol, rows });
      const chartRow = rows.find((r) => r.tf === timeframe);
      const chartCatalog = await loadCatalog(symbol, timeframe, rebuild);
      const { candles: chartCandles } = await loadBitgetFuturesChartCandles(symbol, timeframe);
      const compare =
        chartCatalog && chartCandles.length >= 25
          ? buildBitgetWhaleVolumeComparePack({
              symbol,
              timeframe,
              candles: chartCandles,
              catalog: chartCatalog,
            })
          : null;
      return NextResponse.json({
        ok: true,
        symbol,
        timeframe,
        match: chartRow?.match ?? null,
        mtfPack: pack,
        candleCompare: compare
          ? {
              singleCandle: compare.singleCandle,
              rangeSegment: compare.rangeSegment,
              burstForecasts: compare.burstForecasts.slice(0, 8),
              similarHistoryCount: compare.similarHistory.length,
            }
          : null,
        catalogMeta: chartCatalog
          ? {
              totalBars: chartCatalog.totalBars,
              eventCount: chartCatalog.eventCount,
              bucketCount: chartCatalog.buckets.length,
              listingFromKo: chartCatalog.listingFromKo,
              dataSpanKo:
                chartCatalog.dataSpanKo ??
                `${chartCatalog.listingFromKo}~ · ${chartCatalog.totalBars.toLocaleString()}봉`,
              builtAt: chartCatalog.builtAt,
            }
          : null,
        fromCatalog: true,
      });
    }

    const catalog = await loadCatalog(symbol, timeframe, rebuild);
    if (!catalog) {
      return NextResponse.json({ ok: false, error: 'catalog/csv insufficient' }, { status: 400 });
    }
    const { candles } = await loadBitgetFuturesChartCandles(symbol, timeframe);
    const match = candles.length >= 25 ? matchCurrentWhaleVolume(candles, catalog) : null;
    const compare =
      match && candles.length >= 25
        ? buildBitgetWhaleVolumeComparePack({ symbol, timeframe, candles, catalog })
        : null;

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      match,
      candleCompare: compare
        ? {
            singleCandle: compare.singleCandle,
            rangeSegment: compare.rangeSegment,
            burstForecasts: compare.burstForecasts.slice(0, 8),
            similarHistoryCount: compare.similarHistory.length,
          }
        : null,
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
      fromCatalog: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'bitget-whale-volume-match failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
