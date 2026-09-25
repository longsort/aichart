/**
 * PHASE 1 — /api/analyze 캔들을 차트와 같은 Bitget USDT-M 소스로 맞춘다.
 * 바이낸스 현물과 Bitget 선물을 섞지 않는다. 없는 파생 시리즈는 만들지 않는다.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { fetchMarketCandles, fetchMarketCandlesTail } from '@/lib/market';
import { isForexSymbol } from '@/lib/forexMarket';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import type { Eagle1RawCandle } from '@/lib/eagle1/rawTypes';

export type AnalyzeCandleVenue = 'bitget' | 'binance' | 'forex';

export type AnalyzeCandlePack = {
  candles: Candle[];
  venue: AnalyzeCandleVenue;
  exchange: Eagle1RawCandle['exchange'];
  source: Eagle1RawCandle['source'];
  sample_count: number;
  fallbackFrom?: 'bitget';
  fallbackReason?: string;
};

const PACK_TTL_MS = 45_000;
const packCache = new Map<string, { expiresAt: number; pack: AnalyzeCandlePack }>();
const packInFlight = new Map<string, Promise<AnalyzeCandlePack>>();

export function resolveAnalyzeCandleVenue(symbol: string): AnalyzeCandleVenue {
  if (isForexSymbol(symbol)) return 'forex';
  if (isBitgetPerpChartSymbol(symbol)) return 'bitget';
  return 'binance';
}

/** 1d/1w/1M 전량 페이지네이션은 analyze마다 돌리지 않음 — 최근 구간만. 분·시 TF는 CSV+API 머지(차트와 동일). */
export function analyzeBitgetUsesRecentOnly(timeframe: string): boolean {
  const n = normalizeChartTimeframe(timeframe);
  return n === '1d' || n === '1w' || n === '1M' || n === '1Y';
}

function toPack(
  candles: Candle[],
  meta: Omit<AnalyzeCandlePack, 'candles' | 'sample_count'>
): AnalyzeCandlePack {
  return {
    ...meta,
    candles,
    sample_count: candles.length,
  };
}

async function cachedPack(key: string, run: () => Promise<AnalyzeCandlePack>): Promise<AnalyzeCandlePack> {
  const now = Date.now();
  const hit = packCache.get(key);
  if (hit && hit.expiresAt > now) return hit.pack;
  const inf = packInFlight.get(key);
  if (inf) return inf;
  const p = run();
  packInFlight.set(key, p);
  try {
    const pack = await p;
    packCache.set(key, { expiresAt: Date.now() + PACK_TTL_MS, pack });
    if (packCache.size > 240) {
      for (const [k, v] of packCache.entries()) {
        if (v.expiresAt <= Date.now()) packCache.delete(k);
      }
    }
    return pack;
  } finally {
    packInFlight.delete(key);
  }
}

async function fetchBitgetOrEmpty(
  symbol: string,
  timeframe: string,
  recentOnly: boolean
): Promise<AnalyzeCandlePack> {
  try {
    const { candles, source } = await loadBitgetFuturesChartCandles(symbol, timeframe, {
      recentOnly,
    });
    return toPack(candles, {
      venue: 'bitget',
      exchange: 'bitget',
      source,
    });
  } catch (e) {
    /** Bitget 실패 시 빈 배열 — 호출측에서 바이낸스 폴백 */
    return toPack([], {
      venue: 'bitget',
      exchange: 'bitget',
      source: 'bitget-api',
      fallbackFrom: 'bitget',
      fallbackReason: e instanceof Error ? e.message : String(e),
    });
  }
}

async function fetchBinanceSpotPack(symbol: string, timeframe: string): Promise<AnalyzeCandlePack> {
  const candles = await fetchMarketCandles(symbol, timeframe, 'analyze');
  return toPack(candles, { venue: 'binance', exchange: 'binance', source: 'binance-spot' });
}

/**
 * Bitget 우선 — 알트 상장 없거나 빈 응답이면 바이낸스 현물로 분석 유지
 * (위장 금지: venue=binance 로 명시, fallbackReason 기록)
 */
async function fetchBitgetWithBinanceFallback(
  symbol: string,
  timeframe: string,
  recentOnly: boolean
): Promise<AnalyzeCandlePack> {
  const bitget = await fetchBitgetOrEmpty(symbol, timeframe, recentOnly);
  if (bitget.candles.length >= 20) return bitget;
  try {
    const spot = await fetchBinanceSpotPack(symbol, timeframe);
    if (spot.candles.length >= 8) {
      return {
        ...spot,
        fallbackFrom: 'bitget',
        fallbackReason:
          bitget.fallbackReason ||
          (bitget.candles.length ? `bitget bars=${bitget.candles.length}` : 'bitget empty'),
      };
    }
  } catch (e) {
    if (bitget.candles.length > 0) return bitget;
    return toPack([], {
      venue: 'binance',
      exchange: 'binance',
      source: 'binance-spot',
      fallbackFrom: 'bitget',
      fallbackReason: e instanceof Error ? e.message : String(e),
    });
  }
  return bitget;
}

export async function fetchAnalyzeCandles(symbol: string, timeframe: string): Promise<AnalyzeCandlePack> {
  const venue = resolveAnalyzeCandleVenue(symbol);
  const tf = normalizeChartTimeframe(String(timeframe || '')) || String(timeframe || '15m');
  const key = `main|${venue}|${symbol}|${tf}`;
  return cachedPack(key, async () => {
    if (venue === 'forex') {
      const candles = await fetchMarketCandles(symbol, tf, 'analyze');
      return toPack(candles, { venue: 'forex', exchange: 'forex', source: 'forex' });
    }
    if (venue === 'bitget') {
      return fetchBitgetWithBinanceFallback(symbol, tf, analyzeBitgetUsesRecentOnly(tf));
    }
    return fetchBinanceSpotPack(symbol, tf);
  });
}

export async function fetchAnalyzeCandlesTail(
  symbol: string,
  timeframe: string,
  tailBars: number
): Promise<AnalyzeCandlePack> {
  const venue = resolveAnalyzeCandleVenue(symbol);
  const tf = normalizeChartTimeframe(String(timeframe || '')) || String(timeframe || '15m');
  const cap = Math.max(6, Math.min(200, Math.floor(Number(tailBars) || 32)));
  const key = `tail|${venue}|${symbol}|${tf}|${cap}`;
  return cachedPack(key, async () => {
    if (venue === 'forex') {
      const candles = await fetchMarketCandlesTail(symbol, tf, cap);
      return toPack(candles, { venue: 'forex', exchange: 'forex', source: 'forex' });
    }
    if (venue === 'bitget') {
      const pack = await fetchBitgetWithBinanceFallback(symbol, tf, true);
      return toPack(pack.candles.slice(-cap), {
        venue: pack.venue,
        exchange: pack.exchange,
        source: pack.source,
        fallbackFrom: pack.fallbackFrom,
        fallbackReason: pack.fallbackReason,
      });
    }
    const candles = await fetchMarketCandlesTail(symbol, tf, cap);
    return toPack(candles, { venue: 'binance', exchange: 'binance', source: 'binance-spot' });
  });
}
