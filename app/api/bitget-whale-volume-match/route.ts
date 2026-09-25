import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { loadBitgetFuturesChartCandlesCached } from '@/lib/bitgetMarketServerCache';
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

const MATCH_TTL_MS = 22_000;
const matchMem = new Map<string, { at: number; json: unknown }>();
const matchInflight = new Map<string, Promise<unknown>>();

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

async function loadLiveCandles(symbol: string, tf: string) {
  const { candles } = await loadBitgetFuturesChartCandlesCached(symbol, tf, { recentOnly: true });
  return candles;
}

/** Bitget 고래 BTC 티어 + 캔들 지문 — 실시간 롱/숏 참고 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '15m');
  const mtf = searchParams.get('mtf') === '1';
  const rebuild = searchParams.get('rebuild') === '1';

  const cacheKey = `${symbol}|${timeframe}|${mtf ? 1 : 0}|${rebuild ? 1 : 0}`;
  if (!rebuild) {
    const hit = matchMem.get(cacheKey);
    if (hit && Date.now() - hit.at < MATCH_TTL_MS) {
      return NextResponse.json(hit.json);
    }
    const inf = matchInflight.get(cacheKey);
    if (inf) {
      return NextResponse.json(await inf);
    }
  }

  const run = (async () => {
    if (mtf) {
      const rows = await Promise.all(
        BITGET_WHALE_CATALOG_TFS.map(async (tf) => {
          try {
            const catalog = await loadCatalog(symbol, tf, rebuild);
            if (!catalog) {
              return { tf, match: null as null, ok: false, error: 'CSV/카탈로그 없음' };
            }
            const candles = await loadLiveCandles(symbol, tf);
            const match = candles.length >= 25 ? matchCurrentWhaleVolume(candles, catalog) : null;
            return { tf, match, ok: true, candles, catalog };
          } catch (e) {
            return {
              tf,
              match: null as null,
              ok: false,
              error: e instanceof Error ? e.message : 'failed',
              candles: [] as Awaited<ReturnType<typeof loadLiveCandles>>,
              catalog: null as Awaited<ReturnType<typeof loadCatalog>>,
            };
          }
        })
      );
      const pack = buildWhaleVolumeMtfPack({
        symbol,
        rows: rows.map(({ tf, match, ok, error }) => ({ tf, match, ok, error })),
      });
      const chartRow = rows.find((r) => r.tf === timeframe);
      const chartCatalog =
        chartRow && 'catalog' in chartRow && chartRow.catalog
          ? chartRow.catalog
          : await loadCatalog(symbol, timeframe, rebuild);
      const chartCandles =
        chartRow && Array.isArray(chartRow.candles) && chartRow.candles.length >= 25
          ? chartRow.candles
          : await loadLiveCandles(symbol, timeframe);
      const compare =
        chartCatalog && chartCandles.length >= 25
          ? buildBitgetWhaleVolumeComparePack({
              symbol,
              timeframe,
              candles: chartCandles,
              catalog: chartCatalog,
            })
          : null;
      return {
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
      };
    }

    const catalog = await loadCatalog(symbol, timeframe, rebuild);
    if (!catalog) {
      return { ok: false, error: 'catalog/csv insufficient' };
    }
    const candles = await loadLiveCandles(symbol, timeframe);
    const match = candles.length >= 25 ? matchCurrentWhaleVolume(candles, catalog) : null;
    const compare =
      match && candles.length >= 25
        ? buildBitgetWhaleVolumeComparePack({ symbol, timeframe, candles, catalog })
        : null;

    return {
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
    };
  })();

  matchInflight.set(cacheKey, run);
  try {
    const json = await run;
    if (json && typeof json === 'object' && 'ok' in json && (json as { ok?: boolean }).ok) {
      matchMem.set(cacheKey, { at: Date.now(), json });
    }
    const status =
      json && typeof json === 'object' && 'ok' in json && (json as { ok?: boolean }).ok === false
        ? 400
        : 200;
    return NextResponse.json(json, { status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'bitget-whale-volume-match failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    matchInflight.delete(cacheKey);
  }
}
