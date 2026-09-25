/**
 * MACRO HTF 캔들 병렬 로드 — 1M/1W/1D/4H/1H.
 * API·서버스캔 공용. 심볼당 짧은 TTL+inflight로 다수 유저 중복 완화.
 */
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import type { TapMacroCandlePack, TapMacroBar } from './macroFrames';

type Pack = Awaited<ReturnType<typeof loadBitgetFuturesChartCandles>>;

const HTF_TTL_MS = Math.max(
  8_000,
  Math.min(60_000, Number(process.env.TAPOINT_HTF_CACHE_TTL_MS || 20_000) || 20_000)
);

const htfCache = new Map<string, { at: number; result: TapointHtfLoadResult }>();
const htfInflight = new Map<string, Promise<TapointHtfLoadResult>>();

async function loadTf(symbol: string, tf: string): Promise<TapMacroBar[]> {
  try {
    const pack: Pack = await loadBitgetFuturesChartCandles(symbol, tf, {
      recentOnly: true,
    });
    return (pack.candles || []) as TapMacroBar[];
  } catch {
    return [];
  }
}

export type TapointHtfLoadResult = {
  pack: TapMacroCandlePack;
  dailyCandles: TapMacroBar[];
  weeklyCandles: TapMacroBar[];
  monthlyCandles: TapMacroBar[];
};

async function loadTapointHtfMacroCandlesFresh(
  symbol: string
): Promise<TapointHtfLoadResult> {
  const [m1, w1, d1, h4, h1] = await Promise.all([
    loadTf(symbol, '1M'),
    loadTf(symbol, '1w'),
    loadTf(symbol, '1d'),
    loadTf(symbol, '4h'),
    loadTf(symbol, '1h'),
  ]);
  return {
    pack: {
      '1M': m1,
      '1W': w1,
      '1D': d1,
      '4H': h4,
      '1H': h1,
    },
    dailyCandles: d1,
    weeklyCandles: w1,
    monthlyCandles: m1,
  };
}

export async function loadTapointHtfMacroCandles(
  symbol: string
): Promise<TapointHtfLoadResult> {
  const sym = String(symbol || '').toUpperCase() || 'BTCUSDT';
  const hit = htfCache.get(sym);
  if (hit && Date.now() - hit.at < HTF_TTL_MS) {
    return hit.result;
  }
  const pending = htfInflight.get(sym);
  if (pending) return pending;

  const p = loadTapointHtfMacroCandlesFresh(sym)
    .then((result) => {
      htfCache.set(sym, { at: Date.now(), result });
      if (htfCache.size > 40) {
        const oldest = [...htfCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) htfCache.delete(oldest[0]);
      }
      return result;
    })
    .finally(() => {
      htfInflight.delete(sym);
    });
  htfInflight.set(sym, p);
  return p;
}
