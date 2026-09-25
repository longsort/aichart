/**
 * Coverage manifest — first/last, row count, missing intervals, source endpoint.
 * 빈 구간을 봉으로 채우지 않는다.
 */
import fs from 'fs';
import path from 'path';
import type { Eagle1RawCandle } from '@/lib/eagle1/rawTypes';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import { expectedCloseTime } from '@/lib/eagle1/dataQualityValidator';

export type Eagle1MissingInterval = {
  from_open_time: number;
  to_open_time: number;
  gap_ms: number;
};

export type Eagle1CoverageManifest = {
  exchange: 'bitget';
  symbol: string;
  market_type: 'usdt-futures';
  timeframe: string;
  first_open_time: number | null;
  last_open_time: number | null;
  first_iso: string | null;
  last_iso: string | null;
  row_count: number;
  gap_count: number;
  missing_intervals: Eagle1MissingInterval[];
  source_endpoint: string;
  downloaded_at: number;
  engine_version: string;
};

export function buildCoverageManifest(
  candles: Eagle1RawCandle[],
  opts: { symbol: string; timeframe: string; source_endpoint?: string }
): Eagle1CoverageManifest {
  const sorted = [...candles].sort((a, b) => a.open_time - b.open_time);
  const missing_intervals: Eagle1MissingInterval[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const next = expectedCloseTime(prev.open_time, opts.timeframe);
    const step = next != null ? next - prev.open_time : 0;
    if (step > 0 && cur.open_time - prev.open_time > step * 1.5) {
      missing_intervals.push({
        from_open_time: prev.open_time,
        to_open_time: cur.open_time,
        gap_ms: cur.open_time - prev.open_time,
      });
    }
  }
  const first = sorted[0]?.open_time ?? null;
  const last = sorted[sorted.length - 1]?.open_time ?? null;
  return {
    exchange: 'bitget',
    symbol: opts.symbol,
    market_type: 'usdt-futures',
    timeframe: opts.timeframe,
    first_open_time: first,
    last_open_time: last,
    first_iso: first != null ? new Date(first).toISOString() : null,
    last_iso: last != null ? new Date(last).toISOString() : null,
    row_count: sorted.length,
    gap_count: missing_intervals.length,
    missing_intervals: missing_intervals.slice(0, 80),
    source_endpoint: opts.source_endpoint || 'https://api.bitget.com/api/v2/mix/market/history-candles',
    downloaded_at: Date.now(),
    engine_version: EAGLE1_ENGINE_VERSION,
  };
}

export function coverageManifestPath(symbol: string, timeframe: string, _root = process.cwd()): string {
  void _root;
  return path.join(
    process.cwd(),
    'data',
    'eagle1',
    'coverage',
    `${String(symbol || 'BTCUSDT').toUpperCase()}_${timeframe}.json`
  );
}

export function writeCoverageManifest(m: Eagle1CoverageManifest, _root = process.cwd()): string {
  void _root;
  fs.mkdirSync(path.join(process.cwd(), 'data', 'eagle1', 'coverage'), { recursive: true });
  const file = path.join(
    process.cwd(),
    'data',
    'eagle1',
    'coverage',
    `${String(m.symbol || 'BTCUSDT').toUpperCase()}_${m.timeframe}.json`
  );
  fs.writeFileSync(file, JSON.stringify(m, null, 2), 'utf8');
  return file;
}

/** 빠른 경로 — 작은 sidecar만 읽고 CSV 전체는 건드리지 않음 */
export function readCoverageManifestLite(
  symbol: string,
  timeframe: string
): Pick<Eagle1CoverageManifest, 'row_count' | 'gap_count' | 'first_iso' | 'last_iso' | 'downloaded_at'> | null {
  try {
    const file = coverageManifestPath(symbol, timeframe);
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Eagle1CoverageManifest>;
    return {
      row_count: Number(j.row_count) || 0,
      gap_count: Number(j.gap_count) || 0,
      first_iso: j.first_iso ?? null,
      last_iso: j.last_iso ?? null,
      downloaded_at: Number(j.downloaded_at) || 0,
    };
  } catch {
    return null;
  }
}
