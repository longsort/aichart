/**
 * Bitget 공개 청산 히스토리 (최근 3일). 추정/타거래소 대입 금지.
 * GET /api/v3/market/liquidations
 */
import { BITGET_BASE } from '@/lib/exchangeConfig';
import type { LiqPoint } from '@/lib/eagle1/microstructureSeries';

type BitgetLiqRow = {
  symbol?: string;
  side?: string;
  price?: string;
  amount?: string;
  ts?: string;
};

function parseRow(row: BitgetLiqRow): LiqPoint | null {
  const price = Number(row.price);
  const amount = Number(row.amount);
  const t = Number(row.ts);
  const sideRaw = String(row.side || '').toLowerCase();
  if (!(price > 0) || !(amount > 0) || !Number.isFinite(t) || t <= 0) return null;
  const side: 'long' | 'short' | null = sideRaw === 'buy' ? 'long' : sideRaw === 'sell' ? 'short' : null;
  if (!side) return null;
  return { t, side, usd: price * amount, price, amount };
}

export async function collectBitgetFuturesLiquidations(
  symbol: string,
  options?: { limit?: number; pages?: number }
): Promise<LiqPoint[]> {
  const lim = Math.min(100, Math.max(1, options?.limit ?? 100));
  const pages = Math.min(5, Math.max(1, options?.pages ?? 3));
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const out: LiqPoint[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let i = 0; i < pages; i++) {
    const q = new URLSearchParams({
      category: 'USDT-FUTURES',
      symbol: sym,
      limit: String(lim),
    });
    if (cursor) q.set('cursor', cursor);
    const res = await fetch(`${BITGET_BASE}/api/v3/market/liquidations?${q}`, { cache: 'no-store' });
    if (!res.ok) break;
    const j = (await res.json()) as {
      code?: string;
      data?: { list?: BitgetLiqRow[]; cursor?: string };
    };
    if (j.code && j.code !== '00000') break;
    const list = Array.isArray(j.data?.list) ? j.data!.list! : [];
    if (!list.length) break;
    for (const row of list) {
      const p = parseRow(row);
      if (!p) continue;
      const key = `${p.t}:${p.side}:${p.price}:${p.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    const next = j.data?.cursor;
    if (!next || next === cursor || list.length < lim) break;
    cursor = next;
  }

  return out.sort((a, b) => a.t - b.t);
}
