/**
 * 1W / 1M from closed 1D only. No lookahead: incomplete week/month dropped.
 * Week boundary: Monday 00:00 UTC (Bitget 1W convention).
 * Month boundary: calendar month UTC.
 */
import { compareNativeToResampled } from '@/lib/eagle1/resampleValidate';
import type { Eagle1RawCandle } from '@/lib/eagle1/rawTypes';
import { storedToRaw } from '@/lib/patternMemory/uniqueStore';
import type { StoredCandle } from '@/lib/patternMemory/types';

export function utcMondayStart(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff);
}

export function utcMonthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function nextMonthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

function nextWeekStart(ms: number): number {
  return utcMondayStart(ms) + 7 * 86_400_000;
}

function aggregate(
  dailies: StoredCandle[],
  bucketStart: (ms: number) => number,
  bucketEnd: (start: number) => number,
  timeframe: '1w' | '1M',
  nowMs: number
): StoredCandle[] {
  const closedDaily = dailies.filter((c) => c.isClosed && c.closeTime <= nowMs);
  const groups = new Map<number, StoredCandle[]>();
  for (const c of closedDaily) {
    const b = bucketStart(c.openTime);
    const arr = groups.get(b);
    if (arr) arr.push(c);
    else groups.set(b, [c]);
  }
  const out: StoredCandle[] = [];
  for (const [openTime, rows] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a.openTime - b.openTime);
    const closeTime = bucketEnd(openTime);
    if (closeTime > nowMs) continue;
    const last = rows[rows.length - 1]!;
    if (last.closeTime > closeTime) continue;
    const first = rows[0]!;
    const quoteOk = rows.every((r) => r.quoteTurnover != null);
    out.push({
      symbol: first.symbol,
      timeframe,
      openTime,
      closeTime,
      open: first.open,
      high: Math.max(...rows.map((r) => r.high)),
      low: Math.min(...rows.map((r) => r.low)),
      close: last.close,
      baseVolume: rows.reduce((s, r) => s + r.baseVolume, 0),
      quoteTurnover: quoteOk ? rows.reduce((s, r) => s + (r.quoteTurnover || 0), 0) : null,
      isClosed: true,
    });
  }
  return out;
}

export function weeklyFromDaily(dailies: StoredCandle[], nowMs = Date.now()): StoredCandle[] {
  return aggregate(dailies, utcMondayStart, nextWeekStart, '1w', nowMs);
}

export function monthlyFromDaily(dailies: StoredCandle[], nowMs = Date.now()): StoredCandle[] {
  return aggregate(dailies, utcMonthStart, nextMonthStart, '1M', nowMs);
}

export function preferNativeOrDailyHtf(params: {
  native: StoredCandle[];
  daily: StoredCandle[];
  tf: '1w' | '1M';
  nowMs?: number;
}): { candles: StoredCandle[]; used: 'native' | 'daily-aggregate'; mismatchCount: number } {
  const nowMs = params.nowMs ?? Date.now();
  const built = params.tf === '1w' ? weeklyFromDaily(params.daily, nowMs) : monthlyFromDaily(params.daily, nowMs);
  const nativeClosed = params.native.filter((c) => c.isClosed);
  if (nativeClosed.length < 20) {
    return { candles: built, used: 'daily-aggregate', mismatchCount: 0 };
  }
  const nativeRaw: Eagle1RawCandle[] = nativeClosed.map(storedToRaw);
  const builtRaw: Eagle1RawCandle[] = built.map(storedToRaw);
  const cmp = compareNativeToResampled(nativeRaw, builtRaw, 5e-3);
  if (cmp.mismatch_count > Math.max(8, Math.floor(cmp.compared * 0.15))) {
    return { candles: built, used: 'daily-aggregate', mismatchCount: cmp.mismatch_count };
  }
  return { candles: nativeClosed, used: 'native', mismatchCount: cmp.mismatch_count };
}
