/**
 * Eagle1 HistoricalDatabase — 기존 Bitget CSV를 raw로 읽는다.
 * API가 주지 않은 구간을 채우지 않는다. 파생 필드 없으면 NULL + availability false.
 */
import fs from 'fs';
import path from 'path';
import {
  EAGLE1_AVAILABILITY_NONE,
  type Eagle1AvailabilityFlags,
  type Eagle1RawCandle,
} from '@/lib/eagle1/rawTypes';

export const EAGLE1_RAW_DIR = path.join('data', 'bitget-futures');
export const EAGLE1_META_DIR = path.join('data', 'eagle1');

/** 동일 프로세스 내 CSV 재파싱 방지 (5m 62MB 등) */
const RAW_CACHE_TTL_MS = 90_000;
const rawCandleCache = new Map<string, { at: number; mtimeMs: number; rows: Eagle1RawCandle[] }>();

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '12H': 43_200_000,
  '1D': 86_400_000,
  '1W': 7 * 86_400_000,
};

export function csvPathFor(symbol: string, timeframe: string, root = process.cwd()): string {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const suffix = timeframe === '1m' ? '1min' : timeframe;
  return path.join(root, EAGLE1_RAW_DIR, `${sym}_${suffix}.csv`);
}

export function parseBitgetFuturesCsvText(
  text: string,
  meta: { symbol: string; timeframe: string; source?: Eagle1RawCandle['source'] }
): Eagle1RawCandle[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const step = TF_MS[meta.timeframe] ?? 0;
  const downloaded_at = Date.now();
  const out: Eagle1RawCandle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 7) continue;
    const open_time = Number(cols[0]);
    const open = Number(cols[2]);
    const high = Number(cols[3]);
    const low = Number(cols[4]);
    const close = Number(cols[5]);
    const base_volume = Number(cols[6]);
    const quote_volume = cols.length >= 8 ? Number(cols[7]) : NaN;
    if (![open_time, open, high, low, close, base_volume].every(Number.isFinite)) continue;
    out.push({
      exchange: 'bitget',
      symbol: meta.symbol,
      market_type: 'usdt-futures',
      timeframe: meta.timeframe,
      open_time,
      close_time: step ? open_time + step : open_time,
      open,
      high,
      low,
      close,
      base_volume,
      quote_volume: Number.isFinite(quote_volume) ? quote_volume : null,
      source: meta.source || 'bitget-csv',
      downloaded_at,
    });
  }
  out.sort((a, b) => a.open_time - b.open_time);
  return out;
}

export function loadEagle1RawCandles(
  symbol: string,
  timeframe: string,
  _root = process.cwd()
): Eagle1RawCandle[] {
  void _root;
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const suffix = timeframe === '1m' ? '1min' : timeframe;
  const cacheKey = `${sym}|${suffix}`;
  const now = Date.now();
  const hit = rawCandleCache.get(cacheKey);
  if (hit && now - hit.at <= RAW_CACHE_TTL_MS) return hit.rows;

  try {
    const file = path.join(process.cwd(), 'data', 'bitget-futures', `${sym}_${suffix}.csv`);
    const st = fs.statSync(file);
    if (hit && hit.mtimeMs === st.mtimeMs) {
      hit.at = now;
      return hit.rows;
    }
    const text = fs.readFileSync(file, 'utf8');
    const rows = parseBitgetFuturesCsvText(text, { symbol, timeframe, source: 'bitget-csv' });
    rawCandleCache.set(cacheKey, { at: now, mtimeMs: st.mtimeMs, rows });
    /** 캐시 폭주 방지 — 최근 24개 TF만 */
    if (rawCandleCache.size > 24) {
      const oldest = [...rawCandleCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) rawCandleCache.delete(oldest[0]);
    }
    return rows;
  } catch {
    return [];
  }
}

/** 구조·컴퍼스용 — 전체 CSV 파싱 없이 캐시/슬라이스만 */
export function loadEagle1RawCandleTail(
  symbol: string,
  timeframe: string,
  n = 500
): Eagle1RawCandle[] {
  const rows = loadEagle1RawCandles(symbol, timeframe);
  if (rows.length <= n) return rows;
  return rows.slice(-n);
}

export function defaultAvailabilityForOhlcvOnly(): Eagle1AvailabilityFlags {
  return { ...EAGLE1_AVAILABILITY_NONE };
}

export function writeEagle1Meta(
  name: string,
  payload: Record<string, unknown>,
  _root = process.cwd()
): string {
  void _root;
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1'), { recursive: true });
  const file = path.join(process.cwd(), 'data', 'eagle1', name);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}
