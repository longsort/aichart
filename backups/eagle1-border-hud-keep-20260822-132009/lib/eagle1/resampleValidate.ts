/**
 * 하위 TF 네이티브 봉과 리샘플 결과를 비교한다.
 * 불일치 시 네이티브를 조용히 바꾸지 않는다.
 */
import type { Eagle1RawCandle } from '@/lib/eagle1/rawTypes';

export type Eagle1ResampleMismatch = {
  open_time: number;
  field: 'open' | 'high' | 'low' | 'close' | 'base_volume';
  native: number;
  resampled: number;
};

export type Eagle1ResampleReport = {
  compared: number;
  mismatch_count: number;
  mismatches: Eagle1ResampleMismatch[];
  replace_native: false;
};

function bucketStart(openTime: number, bucketMs: number): number {
  return Math.floor(openTime / bucketMs) * bucketMs;
}

export function resampleOhlcv(source: Eagle1RawCandle[], bucketMs: number, timeframe: string): Eagle1RawCandle[] {
  const groups = new Map<number, Eagle1RawCandle[]>();
  for (const c of source) {
    const b = bucketStart(c.open_time, bucketMs);
    const arr = groups.get(b);
    if (arr) arr.push(c);
    else groups.set(b, [c]);
  }
  const out: Eagle1RawCandle[] = [];
  for (const [open_time, rows] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a.open_time - b.open_time);
    const first = rows[0];
    const last = rows[rows.length - 1];
    out.push({
      ...first,
      timeframe,
      open_time,
      close_time: open_time + bucketMs,
      open: first.open,
      high: Math.max(...rows.map((r) => r.high)),
      low: Math.min(...rows.map((r) => r.low)),
      close: last.close,
      base_volume: rows.reduce((s, r) => s + r.base_volume, 0),
      quote_volume: rows.every((r) => r.quote_volume != null)
        ? rows.reduce((s, r) => s + (r.quote_volume || 0), 0)
        : null,
      source: first.source,
    });
  }
  return out;
}

export function compareNativeToResampled(
  native: Eagle1RawCandle[],
  resampled: Eagle1RawCandle[],
  relTol = 1e-6
): Eagle1ResampleReport {
  const map = new Map(resampled.map((c) => [c.open_time, c]));
  const mismatches: Eagle1ResampleMismatch[] = [];
  let compared = 0;
  for (const n of native) {
    const r = map.get(n.open_time);
    if (!r) continue;
    compared++;
    const fields: Array<'open' | 'high' | 'low' | 'close' | 'base_volume'> = [
      'open',
      'high',
      'low',
      'close',
      'base_volume',
    ];
    for (const f of fields) {
      const a = n[f];
      const b = r[f];
      const den = Math.max(Math.abs(a), 1e-12);
      if (Math.abs(a - b) / den > relTol && Math.abs(a - b) > 1e-8) {
        mismatches.push({ open_time: n.open_time, field: f, native: a, resampled: b });
      }
    }
  }
  return {
    compared,
    mismatch_count: mismatches.length,
    mismatches: mismatches.slice(0, 40),
    replace_native: false,
  };
}
