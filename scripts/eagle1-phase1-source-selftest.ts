#!/usr/bin/env node
/**
 * PHASE 1 source / no-fake-number / quality mismatch tests (no network).
 */
import { resolveAnalyzeCandleVenue, analyzeBitgetUsesRecentOnly } from '../lib/analyzeCandleSource';
import { chartCandlesToEagle1Raw } from '../lib/eagle1/canonicalCandle';
import { validateRawCandles } from '../lib/eagle1/dataQualityValidator';
import { evaluateQualityGate } from '../lib/eagle1/qualityGate';
import { shouldShowFeatureProbabilityGauge, historicalStatLabel } from '../lib/eagle1/noFakeNumbers';
import { EAGLE1_AVAILABILITY_NONE, eagle1RawMarketType } from '../lib/eagle1/rawTypes';
import { defaultAvailabilityForOhlcvOnly } from '../lib/eagle1/historicalDatabase';

const fail: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) fail.push(msg);
}

assert(resolveAnalyzeCandleVenue('BTCUSDT') === 'bitget', 'BTCUSDT venue must be bitget');
assert(resolveAnalyzeCandleVenue('ETHUSDT') === 'bitget', 'ETHUSDT venue must be bitget');
assert(resolveAnalyzeCandleVenue('USDKRW') === 'forex', 'USDKRW venue must be forex');
assert(analyzeBitgetUsesRecentOnly('15m') === false, '15m analyze should use CSV+API merge');
assert(analyzeBitgetUsesRecentOnly('1d') === true, '1d analyze should be recentOnly');

assert(eagle1RawMarketType('bitget') === 'usdt-futures', 'bitget market_type');
assert(eagle1RawMarketType('binance') === 'spot', 'binance market_type');

const bitgetRaw = chartCandlesToEagle1Raw(
  [{ time: 1_700_000_000, open: 1, high: 2, low: 1, close: 1.5, volume: 10 }],
  { symbol: 'BTCUSDT', timeframe: '1h', source: 'bitget-csv', exchange: 'bitget' }
);
assert(bitgetRaw[0]?.exchange === 'bitget', 'bitget raw exchange');
assert(bitgetRaw[0]?.source === 'bitget-csv', 'must keep declared source, not hardcode bitget-api');
assert(!validateRawCandles(bitgetRaw, { symbol: 'BTCUSDT', timeframe: '1h' }).confirmed_signal_blocked, 'valid bitget not blocked');

const binanceRaw = chartCandlesToEagle1Raw(
  [{ time: 1_700_000_000, open: 1, high: 2, low: 1, close: 1.5, volume: 10 }],
  { symbol: 'BTCUSDT', timeframe: '1h', source: 'binance-spot', exchange: 'binance' }
);
const mismatch = validateRawCandles(binanceRaw, { symbol: 'BTCUSDT', timeframe: '1h' });
assert(mismatch.confirmed_signal_blocked, 'binance labeled as eagle1 must block confirmed');
assert(mismatch.issues.some((i) => i.code === 'source_mismatch'), 'source_mismatch issue required');
assert(evaluateQualityGate(mismatch).code === 'DATA_QUALITY_WARNING', 'quality gate warning on mismatch');

const none = defaultAvailabilityForOhlcvOnly();
assert(none.has_oi === false && none.has_cvd === false && none.has_orderbook === false, 'OHLCV-only availability must be false');
assert(
  JSON.stringify(none) === JSON.stringify(EAGLE1_AVAILABILITY_NONE),
  'availability must match EAGLE1_AVAILABILITY_NONE'
);

assert(
  shouldShowFeatureProbabilityGauge({ uiMode: 'MERGED_ANALYSIS_DESK', eagle1ChartMode: 'practical', hasRows: true }) === false,
  'merged practical hides lookahead gauge'
);
assert(
  shouldShowFeatureProbabilityGauge({ uiMode: 'MERGED_ANALYSIS_DESK', eagle1ChartMode: 'analysis', hasRows: true }) === false,
  'merged analysis hides lookahead gauge'
);
assert(
  shouldShowFeatureProbabilityGauge({ uiMode: 'MERGED_ANALYSIS_DESK', eagle1ChartMode: 'research', hasRows: true }) === true,
  'merged research may show gauge with low-confidence label'
);
assert(historicalStatLabel({ sampleCount: 0, valuePct: 71 }) === '데이터 없음', 'empty sample');
assert(historicalStatLabel({ sampleCount: 12, valuePct: 71 }) === '통계 부족', 'short sample');
assert(historicalStatLabel({ sampleCount: 40, valuePct: 71, quality: 'lookahead' }) === '신뢰도 낮음', 'lookahead');
assert(historicalStatLabel({ sampleCount: 40, valuePct: 71.4, quality: 'ok' }) === '71.4%', 'real stat');

if (fail.length) {
  console.error('PHASE1 SOURCE SELFTEST FAIL:', fail.join('; '));
  process.exit(1);
}
console.error('PHASE1 SOURCE SELFTEST OK');
