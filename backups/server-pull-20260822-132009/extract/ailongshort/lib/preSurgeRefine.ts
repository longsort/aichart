/**
 * 급등전 티커 1차 + 15m/1h 봉 2차. 확정 급등 아님.
 */
import type { Candle } from '@/types';
import type { SurgeCoinRow, SurgeCoinScanPack } from '@/lib/surgeCoinScan';
import { mergePreSurgeCandleIntoRow, readPreSurgeCandles } from '@/lib/preSurgeCandleScore';

function parseBinanceKline(c: unknown[]): Candle | null {
  const time = Math.floor(Number(c[0]) / 1000);
  const open = Number(c[1]);
  const high = Number(c[2]);
  const low = Number(c[3]);
  const close = Number(c[4]);
  const volume = Number(c[5] ?? 0);
  if (!Number.isFinite(time) || time <= 0 || !(close > 0)) return null;
  const taker = Number(c[9]);
  return {
    time,
    open,
    high,
    low,
    close,
    volume,
    takerBuyBaseVolume: Number.isFinite(taker) && taker > 0 ? taker : undefined,
  };
}

async function fetchJson(url: string, ms = 7000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchPreSurgeKlines(
  symbol: string,
  interval: '15m' | '1h',
  limit: number
): Promise<Candle[]> {
  const binance = await fetchJson(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
  );
  if (Array.isArray(binance) && binance.length >= 10) {
    return binance.map((r) => parseBinanceKline(r as unknown[])).filter((c): c is Candle => !!c);
  }
  const bybitIv = interval === '15m' ? '15' : '60';
  const by = (await fetchJson(
    `https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=${bybitIv}&limit=${limit}`
  )) as { result?: { list?: unknown[] } } | null;
  const list = by?.result?.list;
  if (!Array.isArray(list) || list.length < 10) return [];
  const rows: Candle[] = [];
  for (const row of list) {
    const a = row as unknown[];
    const time = Math.floor(Number(a[0]) / 1000);
    const open = Number(a[1]);
    const high = Number(a[2]);
    const low = Number(a[3]);
    const close = Number(a[4]);
    const volume = Number(a[5] ?? 0);
    if (!Number.isFinite(time) || !(close > 0)) continue;
    rows.push({ time, open, high, low, close, volume });
  }
  rows.sort((a, b) => a.time - b.time);
  return rows;
}

async function mapPool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    const chunk = items.slice(i, i + n);
    const part = await Promise.all(chunk.map((x, j) => fn(x, i + j)));
    out.push(...part);
    if (i + n < items.length) await new Promise((r) => setTimeout(r, 70));
  }
  return out;
}

export async function refinePreSurgePack(
  seed: SurgeCoinScanPack,
  outLimit: number
): Promise<SurgeCoinScanPack> {
  const pool = seed.rows.slice(0, Math.min(24, Math.max(outLimit + 6, 16)));
  const htfN = Math.min(12, pool.length);

  const enriched = await mapPool(pool, 4, async (row, idx) => {
    const c15 = await fetchPreSurgeKlines(row.symbol, '15m', 80);
    const c1h = idx < htfN ? await fetchPreSurgeKlines(row.symbol, '1h', 40) : null;
    const read = readPreSurgeCandles(c15, c1h);
    return mergePreSurgeCandleIntoRow(row, read);
  });

  const kept = enriched
    .filter((r) => r.grade !== 'C' || (r.score >= 48 && !/이미가속/.test(r.noteKo)))
    .filter((r) => !/이미가속/.test((r.tags || []).join(',')))
    .sort((a, b) => {
      const g = { A: 0, B: 1, C: 2 } as const;
      const ga = g[a.grade || 'C'];
      const gb = g[b.grade || 'C'];
      if (ga !== gb) return ga - gb;
      return b.score - a.score;
    });

  const rows = kept.slice(0, outLimit);
  const aN = rows.filter((r) => r.grade === 'A').length;
  const bN = rows.filter((r) => r.grade === 'B').length;
  return {
    ...seed,
    rows,
    scanned: seed.scanned,
    summaryKo: `급등전 ${rows.length}종 · A${aN} B${bN} · 15m압축·거래량점화·1h(참고) · 확정 아님 · BTC ${seed.btcChangePct >= 0 ? '+' : ''}${seed.btcChangePct.toFixed(1)}%`,
    at: Date.now(),
    mode: 'pre',
  };
}
