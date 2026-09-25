import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketData } from '@/lib/data/dataService';
import type { OverlayItem } from '@/types';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import {
  computeVolumePhaseStatsFromCandles,
  matchCurrentPhase,
  type VolumePhaseCurrentMatch,
} from '@/lib/volumePhaseStats';
import { readVolumePhaseStats } from '@/lib/volumePhaseStatsStore';
import {
  isVolumePhaseStatsTimeframe,
  parentHtfForPhaseStats,
  phaseHorizonsForTf,
  phaseLookbackDaysForTf,
} from '@/lib/volumePhaseTimeframes';
import {
  buildMirageZoneProactiveIntel,
  type MirageZoneCriticalZoneRef,
  type MirageZoneExchangeSnapshot,
  type MirageZoneIntelRequestZone,
  type MirageZoneKeyZoneRef,
  type MirageZoneMtfRowRef,
  type MirageZoneProactiveIntel,
} from '@/lib/mergedDeskMirageZoneExchangeIntel';
import type { MirageZoneDeepIntelInput } from '@/lib/mergedDeskMirageZoneDeepIntel';
import { collectFuturesTrades } from '@/lib/data/collectors/futuresTradesCollector';
import { collectBitgetFuturesFills } from '@/lib/data/collectors/bitgetFuturesFillsCollector';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import { computeVolumeDelta } from '@/lib/data/aggregate/volumeDeltaAggregator';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';

export const dynamic = 'force-dynamic';

async function loadMultiExchangeTrades(symbol: string): Promise<{
  trades: AggTrade[];
  exchangeTape: {
    binanceFutures: { buyPct: number; sellPct: number; n: number };
    bitgetFutures: { buyPct: number; sellPct: number; n: number };
  };
}> {
  const [binance, bitget] = await Promise.all([
    collectFuturesTrades(symbol, { limit: 800 }).catch(() => [] as AggTrade[]),
    collectBitgetFuturesFills(symbol, { limit: 100 }).catch(() => [] as AggTrade[]),
  ]);
  const summarize = (arr: AggTrade[]) => {
    if (!arr.length) return { buyPct: 50, sellPct: 50, n: 0 };
    const vd = computeVolumeDelta(arr);
    return {
      buyPct: Math.round(vd.buyPressure * 100),
      sellPct: Math.round(vd.sellPressure * 100),
      n: arr.length,
    };
  };
  const trades = [...binance, ...bitget].sort((a, b) => a.time - b.time);
  return {
    trades,
    exchangeTape: {
      binanceFutures: summarize(binance),
      bitgetFutures: summarize(bitget),
    },
  };
}

async function loadVolumePhaseMatch(
  symbol: string,
  timeframe: string
): Promise<VolumePhaseCurrentMatch | null> {
  const tf = normalizeChartTimeframe(timeframe);
  if (!isVolumePhaseStatsTimeframe(tf)) return null;

  try {
    let file = await readVolumePhaseStats(symbol, tf);
    let candles: Candle[] = [];

    const loaded = await loadVolumeShockCandles(symbol, tf, phaseLookbackDaysForTf(tf));
    if ('error' in loaded || loaded.candles.length < 80) return null;
    candles = loaded.candles;

    if (!file) {
      const parent = parentHtfForPhaseStats(tf);
      let htfCandles: Awaited<ReturnType<typeof readBitgetFuturesCsv>> = [];
      if (parent) {
        try {
          htfCandles = await readBitgetFuturesCsv(symbol, parent);
        } catch {
          /* optional */
        }
      }
      file = computeVolumePhaseStatsFromCandles(symbol, tf, candles, {
        htfCandles: htfCandles.length >= 30 ? htfCandles : undefined,
        horizons: phaseHorizonsForTf(tf),
      });
    }

    const parent = parentHtfForPhaseStats(tf);
    let htfCandles: Awaited<ReturnType<typeof readBitgetFuturesCsv>> = [];
    if (parent) {
      try {
        htfCandles = await readBitgetFuturesCsv(symbol, parent);
      } catch {
        /* optional */
      }
    }

    return matchCurrentPhase(
      candles,
      tf,
      file,
      htfCandles.length >= 30 ? htfCandles : undefined
    );
  } catch {
    return null;
  }
}

function stubOverlay(z: MirageZoneIntelRequestZone): OverlayItem {
  return {
    id: z.id,
    kind: 'zone',
    label: z.role === 'resistance' || z.role === 'ob_bear' ? '저항' : '지지',
    x1: 0,
    y1: 0,
    price1: z.top,
    price2: z.bot,
    time1: 0,
    confidence: 0.75,
    overlayZoneExtraClass:
      z.role === 'ob_bull'
        ? 'merged-ares-mlsp-tv-ob-bull'
        : z.role === 'ob_bear'
          ? 'merged-ares-mlsp-tv-ob-bear'
          : z.role === 'resistance'
            ? 'merged-ares-mlsp-tv-resist-zone'
            : 'merged-ares-mlsp-tv-support-zone',
  };
}

/**
 * POST — Mirage zone 선반영: 체결·호가·볼륨페이즈·MTF·VRVP 통합.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      symbol?: string;
      timeframe?: string;
      zones?: MirageZoneIntelRequestZone[];
      keyZones?: MirageZoneKeyZoneRef[];
      criticalZones?: MirageZoneCriticalZoneRef[];
      vrvp?: { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;
      mtfRows?: MirageZoneMtfRowRef[];
      currentPrice?: number | null;
      deep?: MirageZoneDeepIntelInput | null;
    };

    const symbol = (body.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = normalizeChartTimeframe(body.timeframe || '4h');
    const zones = Array.isArray(body.zones) ? body.zones : [];
    const keyZones = Array.isArray(body.keyZones) ? body.keyZones : [];
    const criticalZones = Array.isArray(body.criticalZones) ? body.criticalZones : [];
    const vrvp = body.vrvp ?? null;
    const mtfRows = Array.isArray(body.mtfRows) ? body.mtfRows : [];
    const deep = body.deep ?? null;

    if (!zones.length) {
      return NextResponse.json({ ok: true, symbol, timeframe, intel: {} });
    }

    const [market, volumePhase, multiTape] = await Promise.all([
      fetchMarketData(symbol, timeframe),
      loadVolumePhaseMatch(symbol, timeframe),
      loadMultiExchangeTrades(symbol),
    ]);

    const currentPrice =
      typeof body.currentPrice === 'number' && Number.isFinite(body.currentPrice)
        ? body.currentPrice
        : market.currentPrice;

    const zoneTrades =
      multiTape.trades.length > 0
        ? multiTape.trades
        : market.trades.length
          ? market.trades
          : [];

    const vd = zoneTrades.length
      ? computeVolumeDelta(zoneTrades)
      : {
          buyPressure: market.buyPressure,
          sellPressure: market.sellPressure,
        };

    const snapshot: MirageZoneExchangeSnapshot = {
      trades: zoneTrades,
      currentPrice: market.currentPrice,
      buyPressure: vd.buyPressure,
      sellPressure: vd.sellPressure,
      orderbookImbalance: market.orderbookImbalance,
      orderbook: market.orderbook,
    };

    const intel: Record<string, MirageZoneProactiveIntel | null> = {};
    const zoneHold: Record<
      string,
      {
        holdPossible: boolean;
        buySellKo: string;
        zoneBuyPct: number;
        zoneSellPct: number;
        sampleN: number;
      }
    > = {};

    for (const z of zones.slice(0, 24)) {
      intel[z.id] = buildMirageZoneProactiveIntel(stubOverlay(z), market.candles, {
        snapshot,
        volumePhase,
        keyZones,
        criticalZones,
        vrvp,
        mtfRows,
        chartTimeframe: timeframe,
        currentPrice,
        deep,
      });

      const band = tradesAtPriceZone(zoneTrades, z.center, 0.008);
      const sampleN = band.tradeCount;
      const buyPct = sampleN > 0 ? Math.round(band.buyPressure * 100) : Math.round(vd.buyPressure * 100);
      const sellPct = 100 - buyPct;
      const expectBull = z.role === 'support' || z.role === 'ob_bull';
      const holdPossible = expectBull
        ? buyPct >= 54 && sampleN >= 3
        : sellPct >= 54 && sampleN >= 3;
      zoneHold[z.id] = {
        holdPossible,
        buySellKo:
          buyPct >= 56
            ? `매수 체결 우세 ${buyPct}%`
            : sellPct >= 56
              ? `매도 체결 우세 ${sellPct}%`
              : `매수·매도 혼조 (매수 ${buyPct}%)`,
        zoneBuyPct: buyPct,
        zoneSellPct: sellPct,
        sampleN,
      };
    }

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      currentPrice: market.currentPrice,
      tape: {
        buyPressure: vd.buyPressure,
        sellPressure: vd.sellPressure,
        orderbookImbalance: market.orderbookImbalance,
      },
      exchangeTape: multiTape.exchangeTape,
      zoneHold,
      volumePhase: volumePhase
        ? {
            label: volumePhase.label,
            eventType: volumePhase.eventType,
            probFavorable: volumePhase.horizons[0]?.probFavorable ?? null,
            sampleCount: volumePhase.horizons[0]?.sampleCount ?? 0,
          }
        : null,
      intel,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'mirage-zone-intel failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
