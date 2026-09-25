/**
 * 서버 크론 — 종가마감 보드 (앱 미접속, 스윙중투 E/SL/TP 보강).
 */
import type { Candle } from '@/types';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import {
  buildTfCloseSettleBoard,
  TF_CLOSE_SETTLE_ORDER,
  type TfCloseSettleBoard,
  type TfCloseSettleTf,
} from '@/lib/tfCloseSettleAssessment';

const CACHE_TTL_MS = 25_000;
const cache = new Map<string, { board: TfCloseSettleBoard | null; at: number }>();
const inflight = new Map<string, Promise<TfCloseSettleBoard | null>>();

async function fetchCandles(
  base: string,
  symbol: string,
  tf: TfCloseSettleTf
): Promise<Candle[]> {
  const q = `symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}`;
  const tryBitget = isBitgetPerpChartSymbol(symbol);
  if (tryBitget) {
    try {
      const r = await fetch(`${base}/api/market-bitget?${q}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; candles?: Candle[] };
      if (j.ok !== false && Array.isArray(j.candles) && j.candles.length >= 2) return j.candles;
    } catch {
      /* fall through */
    }
  }
  try {
    const r = await fetch(`${base}/api/market?${q}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; candles?: Candle[] };
    if (Array.isArray(j.candles) && j.candles.length) return j.candles;
  } catch {
    /* empty */
  }
  return [];
}

/**
 * 심볼당 종가마감 보드 1회 (캐시). 실패해도 null — 스윙중투는 settle 없이 동작.
 */
export async function fetchServerTfCloseSettleBoard(
  base: string,
  symbol: string
): Promise<TfCloseSettleBoard | null> {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;

  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.board;

  const existing = inflight.get(sym);
  if (existing) return existing;

  const p = (async () => {
    try {
      const tfs = [...TF_CLOSE_SETTLE_ORDER];
      const results = await Promise.all(tfs.map((tf) => fetchCandles(base, sym, tf)));
      const candlesByTf: Partial<Record<TfCloseSettleTf, Candle[]>> = {};
      let anyOk = false;
      tfs.forEach((tf, i) => {
        const c = results[i] ?? [];
        if (c.length >= 2) anyOk = true;
        if (c.length) candlesByTf[tf] = c;
      });
      if (!anyOk) {
        cache.set(sym, { board: null, at: Date.now() });
        return null;
      }
      const daily = candlesByTf['1d'] ?? null;
      const latestDaily = daily?.length ? daily[daily.length - 1]! : null;
      const board = buildTfCloseSettleBoard(candlesByTf, Date.now(), latestDaily);
      cache.set(sym, { board, at: Date.now() });
      return board;
    } catch {
      cache.set(sym, { board: null, at: Date.now() });
      return null;
    } finally {
      inflight.delete(sym);
    }
  })();

  inflight.set(sym, p);
  return p;
}
