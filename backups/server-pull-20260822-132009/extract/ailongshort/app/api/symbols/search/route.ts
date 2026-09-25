import { NextRequest, NextResponse } from 'next/server';
import { matchForexSearch } from '@/lib/forexMarket';

export const dynamic = 'force-dynamic';

type SymbolRow = { symbol: string; baseAsset: string; quoteAsset: string };

let cache: { at: number; rows: SymbolRow[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;

async function loadSpotUsdtSymbols(): Promise<SymbolRow[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.rows;
  try {
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo', { cache: 'no-store' });
    if (!res.ok) return cache?.rows ?? [];
    const j = (await res.json()) as { symbols?: Array<Record<string, unknown>> };
    const rows: SymbolRow[] = [];
    for (const s of j.symbols ?? []) {
      if (s.status !== 'TRADING') continue;
      if (String(s.quoteAsset || '') !== 'USDT') continue;
      if (s.isSpotTradingAllowed === false) continue;
      const symbol = String(s.symbol || '');
      const baseAsset = String(s.baseAsset || '');
      if (!symbol || !baseAsset) continue;
      rows.push({ symbol, baseAsset, quoteAsset: 'USDT' });
    }
    cache = { at: now, rows };
    return rows;
  } catch {
    return cache?.rows ?? [];
  }
}

/** GET ?q=pepe&limit=20 — USDT 코인 + USDKRW/CNYKRW 환율 검색 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('q') || '').trim();
  const limitRaw = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);
  const limit = Math.min(40, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
  if (raw.length < 1) {
    return NextResponse.json({ ok: true, symbols: [] as Array<{ symbol: string; base: string }> });
  }
  const fx = matchForexSearch(raw, limit);
  const out: Array<{ symbol: string; base: string }> = [...fx];
  const seen = new Set(out.map((x) => x.symbol));
  if (out.length < limit) {
    const q = raw.toUpperCase();
    const all = await loadSpotUsdtSymbols();
    for (const r of all) {
      if (r.symbol.includes(q) || r.baseAsset.toUpperCase().includes(q)) {
        if (seen.has(r.symbol)) continue;
        out.push({ symbol: r.symbol, base: r.baseAsset });
        seen.add(r.symbol);
        if (out.length >= limit) break;
      }
    }
  }
  return NextResponse.json({ ok: true, symbols: out });
}
