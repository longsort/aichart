/**
 * Bitget USDT-M 선물 라이브 호가 (merge-depth · 공개 API).
 * 이 함수는 스냅샷만 반환한다. 시계열은 eagle1 seriesStore에 적재한다.
 * 실패 시 빈 북 — 추정/전진보간 금지.
 */
import { BITGET_BASE } from '@/lib/exchangeConfig';
import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';

function parseLevels(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];
  const out: Array<[number, number]> = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const p = Number(row[0]);
    const q = Number(row[1]);
    if (!(p > 0) || !(q > 0) || !Number.isFinite(p) || !Number.isFinite(q)) continue;
    out.push([p, q]);
  }
  return out;
}

export async function collectBitgetFuturesOrderbook(
  symbol: string,
  options?: { limit?: 1 | 5 | 15 | 50 }
): Promise<OrderbookSnapshot> {
  const lim = options?.limit ?? 15;
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const q = new URLSearchParams({
    symbol: sym,
    productType: 'USDT-FUTURES',
    precision: 'scale0',
    limit: String(lim),
  });
  const res = await fetch(`${BITGET_BASE}/api/v2/mix/market/merge-depth?${q}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`bitget orderbook ${res.status}`);
  const j = (await res.json()) as {
    code?: string;
    data?: { bids?: unknown; asks?: unknown; ts?: string | number };
  };
  if (j.code && j.code !== '00000') throw new Error(`bitget orderbook code ${j.code}`);
  const bids = parseLevels(j.data?.bids);
  const asks = parseLevels(j.data?.asks);
  const ts = Number(j.data?.ts);
  return {
    time: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
    bids,
    asks,
  };
}
