export type LiquidationCluster = {
  price: number;
  usd: number;
  side: 'long' | 'short';
};

export type LiquidationSummary = {
  longSideUsd: number;
  shortSideUsd: number;
  count: number;
  clusters: LiquidationCluster[];
};

const EMPTY: LiquidationSummary = { longSideUsd: 0, shortSideUsd: 0, count: 0, clusters: [] };

function bucketKey(price: number): number {
  if (!(price > 0)) return 0;
  const step = price >= 1000 ? 50 : price >= 100 ? 5 : price >= 1 ? 0.5 : price * 0.002;
  return Math.round(price / step) * step;
}

/** 바이낸스 선물 공개 강제청산 주문 (최근 N건) — SELL=롱청산, BUY=숏청산 */
export async function collectRecentLiquidations(symbol: string, limit = 80): Promise<LiquidationSummary> {
  const lim = Math.min(100, Math.max(1, limit));
  const url = `https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${encodeURIComponent(symbol)}&limit=${lim}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return { ...EMPTY };
  const raw = (await res.json()) as Array<{
    side?: string;
    price?: string;
    executedQty?: string;
    origQty?: string;
    cumQuote?: string;
  }>;
  if (!Array.isArray(raw)) return { ...EMPTY };
  let longSideUsd = 0;
  let shortSideUsd = 0;
  const buckets = new Map<string, LiquidationCluster>();
  for (const o of raw) {
    const sideRaw = String(o.side || '').toUpperCase();
    const q = Number(o.executedQty ?? o.origQty ?? 0);
    const p = Number(o.price ?? 0);
    const quote = Number(o.cumQuote);
    const usd = Number.isFinite(quote) && quote > 0 ? quote : p * q;
    if (!Number.isFinite(usd) || usd <= 0 || !(p > 0)) continue;
    const side: 'long' | 'short' | null = sideRaw === 'SELL' ? 'long' : sideRaw === 'BUY' ? 'short' : null;
    if (!side) continue;
    if (side === 'long') longSideUsd += usd;
    else shortSideUsd += usd;
    const bk = bucketKey(p);
    const key = `${side}:${bk}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.usd += usd;
      prev.price = (prev.price * (prev.usd - usd) + p * usd) / prev.usd;
    } else {
      buckets.set(key, { price: p, usd, side });
    }
  }
  const clusters = [...buckets.values()].sort((a, b) => b.usd - a.usd).slice(0, 6);
  return { longSideUsd, shortSideUsd, count: raw.length, clusters };
}
