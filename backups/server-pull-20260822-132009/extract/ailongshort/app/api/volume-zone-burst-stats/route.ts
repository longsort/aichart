import { NextRequest, NextResponse } from 'next/server';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { loadVolumeShockCandles } from '@/lib/volumeShockCandleSource';
import {
  buildVolumeZoneBurstMtfPack,
  computeVolumeZoneBurstStats,
  resolveVolumeZoneFromPrice,
} from '@/lib/volumeZoneBurstIntel';
import {
  parentHtfForPhaseStats,
  phaseLookbackDaysForTf,
  VOLUME_PHASE_STATS_TIMEFRAMES,
} from '@/lib/volumePhaseTimeframes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function loadListingCandles(symbol: string, tf: string): Promise<Candle[]> {
  try {
    const csv = await readBitgetFuturesCsv(symbol, tf);
    if (csv.length >= 80) return csv;
  } catch {
    /* fallback */
  }
  const loaded = await loadVolumeShockCandles(symbol, tf, phaseLookbackDaysForTf(tf));
  if ('error' in loaded) return [];
  return loaded.candles;
}

async function loadHtf(symbol: string, tf: string): Promise<Candle[]> {
  const parent = parentHtfForPhaseStats(tf);
  if (!parent) return [];
  return loadListingCandles(symbol, parent);
}

/** 거래량 터짐 + 가격 구간 일치 — 비트겟 상장~ 전구간 통계 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(searchParams.get('timeframe') || '4h');
  const mtf = searchParams.get('mtf') === '1';
  let zoneBot = Number(searchParams.get('zoneBot'));
  let zoneTop = Number(searchParams.get('zoneTop'));

  if (!Number.isFinite(zoneBot) || !Number.isFinite(zoneTop) || !(zoneTop > zoneBot)) {
    const price = Number(searchParams.get('price'));
    const resolved = resolveVolumeZoneFromPrice(Number.isFinite(price) ? price : null);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: 'zoneBot/zoneTop or price required' }, { status: 400 });
    }
    zoneBot = resolved.bot;
    zoneTop = resolved.top;
  }

  try {
    if (mtf) {
      const tfCandles: Array<{ tf: string; candles: Candle[]; htfCandles?: Candle[] }> = [];
      const chunk = 3;
      for (let i = 0; i < VOLUME_PHASE_STATS_TIMEFRAMES.length; i += chunk) {
        const part = VOLUME_PHASE_STATS_TIMEFRAMES.slice(i, i + chunk);
        const batch = await Promise.all(
          part.map(async (tf) => {
            const candles = await loadListingCandles(symbol, tf);
            const htfCandles = candles.length >= 80 ? await loadHtf(symbol, tf) : [];
            return { tf, candles, htfCandles: htfCandles.length >= 30 ? htfCandles : undefined };
          })
        );
        tfCandles.push(...batch);
        if (i + chunk < VOLUME_PHASE_STATS_TIMEFRAMES.length) {
          await new Promise((r) => setTimeout(r, 80));
        }
      }
      const pack = buildVolumeZoneBurstMtfPack({ symbol, zoneBot, zoneTop, tfCandles });
      const chartRow = pack.rows.find((r) => r.tf === timeframe);
      return NextResponse.json({
        ok: true,
        symbol,
        timeframe,
        zoneBot,
        zoneTop,
        match: chartRow?.match ?? null,
        mtfPack: pack,
        fromListing: true,
      });
    }

    const candles = await loadListingCandles(symbol, timeframe);
    if (candles.length < 80) {
      return NextResponse.json({ ok: false, error: 'candles insufficient' }, { status: 400 });
    }
    const htfCandles = await loadHtf(symbol, timeframe);
    const match = computeVolumeZoneBurstStats({
      candles,
      timeframe,
      zoneBot,
      zoneTop,
      htfCandles: htfCandles.length >= 30 ? htfCandles : undefined,
    });

    return NextResponse.json({
      ok: true,
      symbol,
      timeframe,
      zoneBot,
      zoneTop,
      match,
      totalBars: candles.length,
      fromListing: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'volume-zone-burst-stats failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
