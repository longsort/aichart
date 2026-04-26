import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

function toOkxInstId(binanceSymbol: string): string | null {
  const u = binanceSymbol.toUpperCase();
  if (!u.endsWith('USDT')) return null;
  const base = u.slice(0, -4);
  return `${base}-USDT-SWAP`;
}

/** OKX 스왑 최근 체결 */
export async function collectOkxSwapTrades(binanceSymbol: string, limit = 500): Promise<AggTrade[]> {
  const instId = toOkxInstId(binanceSymbol);
  if (!instId) return [];
  const lim = Math.min(500, Math.max(1, limit));
  const url = `https://www.okx.com/api/v5/market/trades?instId=${encodeURIComponent(instId)}&limit=${lim}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const j = (await res.json()) as { code?: string; data?: Array<{ ts?: string; px?: string; sz?: string; side?: string }> };
  if (j.code !== '0' || !j.data?.length) return [];
  return j.data.map((t) => {
    const time = Math.floor(Number(t.ts ?? Date.now()));
    const price = Number(t.px ?? 0);
    const qty = Number(t.sz ?? 0);
    const side = String(t.side || '').toLowerCase();
    const isBuyerMaker = side === 'sell';
    return { time, price, qty, isBuyerMaker };
  });
}
