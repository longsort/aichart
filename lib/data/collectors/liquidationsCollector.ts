export type LiquidationSummary = {
  longSideUsd: number;
  shortSideUsd: number;
  count: number;
};

/** 바이낸스 선물 공개 강제청산 주문 (최근 N건) — SELL=롱청산, BUY=숏청산 */
export async function collectRecentLiquidations(symbol: string, limit = 80): Promise<LiquidationSummary> {
  const lim = Math.min(100, Math.max(1, limit));
  const url = `https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${encodeURIComponent(symbol)}&limit=${lim}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return { longSideUsd: 0, shortSideUsd: 0, count: 0 };
  const raw = (await res.json()) as Array<{
    side?: string;
    price?: string;
    executedQty?: string;
    origQty?: string;
    cumQuote?: string;
  }>;
  if (!Array.isArray(raw)) return { longSideUsd: 0, shortSideUsd: 0, count: 0 };
  let longSideUsd = 0;
  let shortSideUsd = 0;
  for (const o of raw) {
    const side = String(o.side || '').toUpperCase();
    const q = Number(o.executedQty ?? o.origQty ?? 0);
    const p = Number(o.price ?? 0);
    const quote = Number(o.cumQuote);
    const usd = Number.isFinite(quote) && quote > 0 ? quote : p * q;
    if (!Number.isFinite(usd) || usd <= 0) continue;
    if (side === 'SELL') longSideUsd += usd;
    else if (side === 'BUY') shortSideUsd += usd;
  }
  return { longSideUsd, shortSideUsd, count: raw.length };
}
