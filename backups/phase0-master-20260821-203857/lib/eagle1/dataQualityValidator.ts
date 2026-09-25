/**
 * Eagle1 Data Quality Engine.
 * 인위 캔들 생성 금지. 이상만 보고한다.
 */
import {
  EAGLE1_ENGINE_VERSION,
  type Eagle1QualityIssue,
  type Eagle1QualityReport,
  type Eagle1RawCandle,
  type Eagle1QualitySeverity,
} from '@/lib/eagle1/rawTypes';

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1H': 3_600_000,
  '2H': 7_200_000,
  '4H': 14_400_000,
  '6H': 21_600_000,
  '12H': 43_200_000,
  '1D': 86_400_000,
  '1W': 7 * 86_400_000,
};

function tfStepMs(tf: string): number | null {
  if (TF_MS[tf]) return TF_MS[tf];
  const n = String(tf || '').toLowerCase();
  if (n === '1h') return TF_MS['1H'];
  if (n === '4h') return TF_MS['4H'];
  if (n === '12h') return TF_MS['12H'];
  if (n === '1d') return TF_MS['1D'];
  if (n === '1w') return TF_MS['1W'];
  return null;
}

function isValidOhlc(c: Eagle1RawCandle): boolean {
  const { open, high, low, close } = c;
  if (![open, high, low, close].every((x) => Number.isFinite(x) && x > 0)) return false;
  if (high < low) return false;
  if (high < open || high < close) return false;
  if (low > open || low > close) return false;
  return true;
}

export function expectedCloseTime(openTime: number, timeframe: string): number | null {
  const step = tfStepMs(timeframe);
  if (!step) return null;
  return openTime + step;
}

export function validateRawCandles(
  candles: Eagle1RawCandle[],
  opts?: { symbol?: string; timeframe?: string }
): Eagle1QualityReport {
  const issues: Eagle1QualityIssue[] = [];
  const symbol = opts?.symbol || candles[0]?.symbol || 'UNKNOWN';
  const timeframe = opts?.timeframe || candles[0]?.timeframe || 'UNKNOWN';
  const step = tfStepMs(timeframe);

  const sorted = [...candles].sort((a, b) => a.open_time - b.open_time);
  let duplicate_count = 0;
  let gap_count = 0;
  let invalid_ohlc_count = 0;
  let negative_volume_count = 0;
  let zero_volume_count = 0;

  const seen = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    if (seen.has(c.open_time)) {
      duplicate_count++;
      issues.push({
        code: 'duplicate_candle',
        severity: 'fail',
        message: `duplicate open_time ${c.open_time}`,
        open_time: c.open_time,
      });
      continue;
    }
    seen.add(c.open_time);

    if (!isValidOhlc(c)) {
      invalid_ohlc_count++;
      issues.push({
        code: 'invalid_ohlc',
        severity: 'fail',
        message: `invalid OHLC o=${c.open} h=${c.high} l=${c.low} c=${c.close}`,
        open_time: c.open_time,
      });
    }

    if (!Number.isFinite(c.base_volume) || c.base_volume < 0) {
      negative_volume_count++;
      issues.push({
        code: 'negative_volume',
        severity: 'fail',
        message: `volume ${c.base_volume}`,
        open_time: c.open_time,
      });
    } else if (c.base_volume === 0) {
      zero_volume_count++;
      if (zero_volume_count <= 8) {
        issues.push({
          code: 'zero_volume_anomaly',
          severity: 'warning',
          message: 'zero base_volume',
          open_time: c.open_time,
        });
      }
    }

    if (step && i > 0) {
      const prev = sorted[i - 1];
      const delta = c.open_time - prev.open_time;
      if (delta > step * 1.5) {
        gap_count++;
        if (gap_count <= 40) {
          issues.push({
            code: 'timestamp_gap',
            severity: 'warning',
            message: `gap ${delta}ms (step ${step}ms)`,
            open_time: c.open_time,
          });
        }
      }
    }
  }

  const sourceMismatch = sorted.some(
    (c) => c.exchange !== 'bitget' || (c.source !== 'bitget-api' && c.source !== 'bitget-csv' && c.source !== 'bitget-merged')
  );
  if (sourceMismatch) {
    issues.push({
      code: 'source_mismatch',
      severity: 'fail',
      message: 'Eagle1 확정은 Bitget USDT-M 캔들만 — 타거래소 혼입 금지',
    });
  }

  const confirmed_signal_blocked =
    invalid_ohlc_count > 0 ||
    negative_volume_count > 0 ||
    duplicate_count > 0 ||
    sorted.length === 0 ||
    sourceMismatch;

  let severity: Eagle1QualitySeverity = 'ok';
  if (confirmed_signal_blocked) severity = 'fail';
  else if (gap_count > 0 || zero_volume_count > 0) severity = 'warning';

  if (sorted.length === 0) {
    issues.push({ code: 'missing_candle', severity: 'fail', message: '데이터 없음' });
  }

  return {
    symbol,
    timeframe,
    sample_count: sorted.length,
    duplicate_count,
    gap_count,
    invalid_ohlc_count,
    negative_volume_count,
    zero_volume_count,
    severity,
    confirmed_signal_blocked,
    issues: issues.slice(0, 200),
    calculated_at: Date.now(),
    engine_version: EAGLE1_ENGINE_VERSION,
  };
}
