'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Candle } from '@/types';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import {
  buildTfCloseSettleBoard,
  TF_CLOSE_SETTLE_ORDER,
  type TfCloseSettleBoard,
  type TfCloseSettleTf,
} from '@/lib/tfCloseSettleAssessment';

function pickLatestDaily(candles: Candle[] | null): Candle | null {
  if (!candles?.length) return null;
  return candles[candles.length - 1] ?? null;
}

const CACHE_TTL_MS = 10_000;
const cacheByKey = new Map<string, { board: TfCloseSettleBoard | null; error: string | null; at: number }>();
const inflightByKey = new Map<string, Promise<{ board: TfCloseSettleBoard | null; error: string | null }>>();

async function fetchCandlesForTf(sym: string, tf: TfCloseSettleTf): Promise<Candle[]> {
  const q = `symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}`;
  const tryBitget = isBitgetPerpChartSymbol(sym);
  if (tryBitget) {
    try {
      const r = await fetch(`/api/market-bitget?${q}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; candles?: Candle[] };
      if (j.ok !== false && Array.isArray(j.candles) && j.candles.length >= 2) return j.candles;
    } catch {
      /* fall through */
    }
  }
  try {
    const r = await fetch(`/api/market?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; candles?: Candle[] };
    if (Array.isArray(j.candles) && j.candles.length) return j.candles;
  } catch {
    /* empty */
  }
  return [];
}

export async function fetchTfCloseSettleBoard(
  symbol: string,
  bustCache: boolean
): Promise<{ board: TfCloseSettleBoard | null; error: string | null }> {
  const sym = String(symbol ?? '').trim();
  if (!sym) return { board: null, error: null };
  const cacheKey = `${sym}|settle`;

  if (!bustCache) {
    const c = cacheByKey.get(cacheKey);
    if (c && Date.now() - c.at < CACHE_TTL_MS) {
      return { board: c.board, error: c.error };
    }
  } else {
    cacheByKey.delete(cacheKey);
  }

  const existing = inflightByKey.get(cacheKey);
  if (existing) return existing;

  const p = (async () => {
    try {
      const tfs: TfCloseSettleTf[] = [...TF_CLOSE_SETTLE_ORDER];
      const results = await Promise.all(tfs.map((tf) => fetchCandlesForTf(sym, tf)));

      const dailyIdx = tfs.indexOf('1d');
      const daily = dailyIdx >= 0 ? results[dailyIdx] : null;

      const candlesByTf: Partial<Record<TfCloseSettleTf, Candle[]>> = {};
      let anyOk = false;
      tfs.forEach((tf, i) => {
        const c = results[i] ?? [];
        if (c.length >= 2) anyOk = true;
        if (c.length) candlesByTf[tf] = c;
      });

      if (!anyOk) {
        const err = '15m·1h·4h·일·주·월 봉 데이터 부족 — 종가마감 선을 그릴 수 없습니다.';
        cacheByKey.set(cacheKey, { board: null, error: err, at: Date.now() });
        return { board: null, error: err };
      }

      const board = buildTfCloseSettleBoard(candlesByTf, Date.now(), pickLatestDaily(daily));
      let error: string | null = null;
      if (board.rows.length === 0) error = '종가마감 행을 만들 수 없습니다(데이터 부족).';
      cacheByKey.set(cacheKey, { board, error, at: Date.now() });
      return { board, error };
    } catch {
      const err = '종가마감 보드 네트워크 오류';
      cacheByKey.set(cacheKey, { board: null, error: err, at: Date.now() });
      return { board: null, error: err };
    }
  })();

  inflightByKey.set(cacheKey, p);
  p.finally(() => inflightByKey.delete(cacheKey));
  return p;
}

/** 마감·안착 보드 — Bitget 우선·폴백 market, 짧은 TTL·in-flight 합류 */
export function useTfCloseSettleBoard(symbol: string, enabled: boolean) {
  const [board, setBoard] = useState<TfCloseSettleBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(
    async (bustCache = false) => {
      if (!enabled || !String(symbol ?? '').trim()) {
        setBoard(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const r = await fetchTfCloseSettleBoard(symbol, bustCache);
      setBoard(r.board);
      setError(r.error);
      setLoading(false);
    },
    [enabled, symbol]
  );

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void reload(false);
    };
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 600 });
    } else {
      timeoutId = setTimeout(run, 80);
    }
    return () => {
      if (idleId != null && typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [reload]);

  useEffect(() => {
    if (!enabled || !String(symbol ?? '').trim()) return;
    const id = window.setInterval(() => {
      void fetchTfCloseSettleBoard(symbol, false).then((r) => {
        setBoard(r.board);
        setError(r.error);
      });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [enabled, symbol]);

  return { board, error, loading, reload };
}
