import { NextRequest, NextResponse } from 'next/server';
import {
  clientIpFromHeaders,
  consumeRouteRateLimit,
} from '@/lib/serverRouteGuard';
import {
  parseBinance24hTickers,
  parseBybitSpotTickers,
  rankPreSurgeTickers,
  rankSurgeTickers,
  type SurgeCoinScanPack,
  type SurgeRawTicker,
} from '@/lib/surgeCoinScan';
import { refinePreSurgePack } from '@/lib/preSurgeRefine';

export const dynamic = 'force-dynamic';

let cache: { at: number; raw: SurgeRawTicker[]; source: 'binance' | 'bybit' } | null = null;
let preCache: { at: number; key: string; pack: SurgeCoinScanPack } | null = null;
const CACHE_MS = 40_000;
const PRE_CACHE_MS = 55_000;

async function fetchJson(url: string, ms = 9000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadTickers(): Promise<{ raw: SurgeRawTicker[]; source: 'binance' | 'bybit' }> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { raw: cache.raw, source: cache.source };
  }

  let source: 'binance' | 'bybit' = 'binance';
  let raw: SurgeRawTicker[] = [];
  try {
    const j = await fetchJson('https://api.binance.com/api/v3/ticker/24hr');
    raw = parseBinance24hTickers(j);
  } catch {
    raw = [];
  }
  if (raw.length < 20) {
    try {
      const j = await fetchJson('https://api.bybit.com/v5/market/tickers?category=spot');
      const by = parseBybitSpotTickers(j);
      if (by.length > raw.length) {
        raw = by;
        source = 'bybit';
      }
    } catch {
      /* keep */
    }
  }
  if (raw.length >= 5) cache = { at: Date.now(), raw, source };
  return { raw, source };
}

export async function GET(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  if (!consumeRouteRateLimit(`surge-scan:${ip}`, 24, 60_000)) {
    return NextResponse.json({ ok: false, error: '요청이 잦습니다. 잠시 후 다시.' }, { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') === 'pre' ? 'pre' : 'surge';
  const limitDefault = mode === 'pre' ? 8 : 20;
  const limit = Math.min(40, Math.max(4, Number(sp.get('limit') || limitDefault) || limitDefault));
  const minQuoteVol = Math.max(
    0,
    Number(sp.get('minQuoteVol') || (mode === 'pre' ? 4_000_000 : 3_000_000)) || (mode === 'pre' ? 4_000_000 : 3_000_000)
  );

  try {
    const { raw, source } = await loadTickers();
    if (raw.length < 5) {
      return NextResponse.json({ ok: false, error: '티커 조회 실패' }, { status: 502 });
    }
    if (mode === 'pre') {
      const key = `${minQuoteVol}:${source}`;
      if (
        preCache &&
        preCache.key === key &&
        Date.now() - preCache.at < PRE_CACHE_MS &&
        preCache.pack.rows.length >= Math.min(limit, 8)
      ) {
        const sliced = { ...preCache.pack, rows: preCache.pack.rows.slice(0, limit) };
        return NextResponse.json({ ok: true, ...sliced, cached: true });
      }
      const seed = { ...rankPreSurgeTickers(raw, { limit: 24, minQuoteVol }), source };
      const pack = await refinePreSurgePack(seed, 16);
      preCache = { at: Date.now(), key, pack };
      return NextResponse.json({ ok: true, ...pack, rows: pack.rows.slice(0, limit), cached: false });
    }
    const pack = { ...rankSurgeTickers(raw, { limit, minQuoteVol }), source };
    return NextResponse.json({ ok: true, ...pack });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'surge-scan failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
