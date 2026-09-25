import { NextRequest, NextResponse } from 'next/server';
import { normalizeChartTimeframe } from '@/lib/constants';
import { fetchMarketData } from '@/lib/data/dataService';
import { buildAiMarketZonePack } from '@/lib/aiMarketZoneEngine';
import { bookSnapFromDepth } from '@/lib/eagle1/microstructureSeries';
import { ingestMicrostructureSeries } from '@/lib/eagle1/seriesStore';
import { readAmzStats } from '@/lib/aiMarketZone/statsStore';
import { buildVwapMarketContext } from '@/lib/vwap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI DYNAMIC MARKET ZONE + Orderflow + optional empiric stats + VWAP 연동.
 * query: autoExtreme=0|1 · session=0|1 (기본 둘 다 1 — 서버는 핀 없음, 데스크 로컬 컨텍스트가 핀 포함)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '4h');
  const autoExtreme = searchParams.get('autoExtreme') !== '0';
  const sessionEnabled = searchParams.get('session') !== '0';

  try {
    const m = await fetchMarketData(symbol, timeframe);
    const bookSnap = m.orderbook ? bookSnapFromDepth(m.orderbook) : null;
    let books = bookSnap ? [bookSnap] : [];
    try {
      const series = ingestMicrostructureSeries({
        symbol,
        ofi10s: [],
        ofi30s: [],
        book: bookSnap,
        liqs: [],
      });
      if (series.books?.length) books = series.books;
    } catch {
      /* series optional */
    }

    const trades = m.bitgetFills?.length ? m.bitgetFills : m.trades;
    const stats = await readAmzStats(symbol, timeframe).catch(() => null);
    const vwapCtx = buildVwapMarketContext({
      candles: m.candles,
      chartTf: timeframe,
      autoExtreme,
      sessionEnabled,
      pins: [],
      pinsHidden: true,
    });
    const pack = buildAiMarketZonePack({
      candles: m.candles,
      timeframe,
      symbol,
      orderflow: {
        trades: trades ?? [],
        orderbook: m.orderbook,
        bookSnaps: books,
        currentPrice: m.currentPrice > 0 ? m.currentPrice : null,
      },
      stats,
      vwapLevels: vwapCtx.levels.map((l) => ({
        price: l.price,
        labelKo: l.labelKo,
        strength: l.strength,
      })),
    });

    return NextResponse.json({
      ok: true,
      pack,
      vwapNoteKo: vwapCtx.noteKo,
      vwapLevelsCount: vwapCtx.levels.length,
      statsAttached: Boolean(stats),
      sampleLowTrust: stats?.sampleLowTrust ?? true,
      liveValidationOk: pack.liveValidation?.ok ?? null,
      liveValidationSummaryKo: pack.liveValidation?.summaryKo ?? null,
      internalOnly: true,
      disclaimerKo: pack.disclaimerKo,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ai-market-zone failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
