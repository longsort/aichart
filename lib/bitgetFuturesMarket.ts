/**
 * Bitget USDT-M 캔들 로드 — CSV → Bitget 공개 API → market 폴백.
 */
import type { Candle } from '@/types';
import { BITGET_BASE } from '@/lib/exchangeConfig';
import { readBitgetFuturesCsv } from '@/lib/bitgetFuturesCsv';
import { fetchMarketCandles } from '@/lib/market';

const TF_MAP: Record<string, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '1H': '1H',
  '4h': '4H',
  '4H': '4H',
  '1d': '1D',
  '1D': '1D',
};

async function fetchBitgetMixCandles(
  symbol: string,
  timeframe: string,
  limit = 200
): Promise<Candle[]> {
  const sym = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const gran = TF_MAP[timeframe] || TF_MAP[String(timeframe).toLowerCase()] || '15m';
  const url =
    `${BITGET_BASE}/api/v2/mix/market/candles` +
    `?productType=USDT-FUTURES&symbol=${encodeURIComponent(sym)}` +
    `&granularity=${encodeURIComponent(gran)}&limit=${Math.min(1000, Math.max(50, limit))}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    code?: string;
    data?: string[][] | Array<{ start?: string; open?: string; high?: string; low?: string; close?: string; baseVolume?: string }>;
  };
  if (String(j.code || '') !== '00000' || !j.data?.length) return [];
  const out: Candle[] = [];
  for (const row of j.data) {
    if (Array.isArray(row)) {
      const ms = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5] || 0);
      if (![ms, open, high, low, close].every(Number.isFinite) || !(close > 0)) continue;
      out.push({
        time: Math.floor(ms / 1000),
        open,
        high,
        low,
        close,
        volume,
      });
    } else {
      const ms = Number(row.start);
      const open = Number(row.open);
      const high = Number(row.high);
      const low = Number(row.low);
      const close = Number(row.close);
      const volume = Number(row.baseVolume || 0);
      if (![ms, open, high, low, close].every(Number.isFinite) || !(close > 0)) continue;
      out.push({
        time: Math.floor(ms / 1000),
        open,
        high,
        low,
        close,
        volume,
      });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

export async function loadBitgetFuturesChartCandles(
  symbol: string,
  timeframe: string,
  opts?: { recentOnly?: boolean; limit?: number }
): Promise<{ candles: Candle[]; source: string }> {
  const limit = opts?.limit || 200;
  try {
    const csv = await readBitgetFuturesCsv(symbol, timeframe);
    if (csv.length >= 80) {
      return {
        candles: opts?.recentOnly ? csv.slice(-limit) : csv,
        source: 'csv',
      };
    }
  } catch {
    /* fall through */
  }
  try {
    const api = await fetchBitgetMixCandles(symbol, timeframe, limit);
    if (api.length >= 80) return { candles: api, source: 'bitget-public' };
  } catch {
    /* fall through */
  }
  try {
    const mkt = await fetchMarketCandles(symbol, timeframe);
    if (mkt.length) {
      return {
        candles: opts?.recentOnly ? mkt.slice(-limit) : mkt,
        source: 'market',
      };
    }
  } catch {
    /* ignore */
  }
  return { candles: [], source: 'none' };
}
