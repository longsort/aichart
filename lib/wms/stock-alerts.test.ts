import assert from 'node:assert/strict';
import {
  classifyStockBand,
  classifyStockBandByTargetPct,
  resolveSkuThreshold,
  stockFillPct,
  type ThresholdBundle,
} from '@/lib/wms/stock-alerts';

const base: ThresholdBundle = {
  global: {
    criticalBelowSku: 20,
    warnBelowSku: 500,
    criticalBelowSize: 20,
    warnBelowSize: 500,
    criticalBelowPressure: 20,
    warnBelowPressure: 500,
  },
  sizeOverrides: {},
  pressureOverrides: {},
};

// 0 = 미입고(empty), not 긴급
assert.equal(classifyStockBand(0, 20, 500), 'empty');
assert.equal(classifyStockBand(19, 20, 500), 'critical');
assert.equal(classifyStockBand(20, 20, 500), 'warn');
assert.equal(classifyStockBand(499, 20, 500), 'warn');
assert.equal(classifyStockBand(500, 20, 500), 'ok');

// % of target: 0=미입고 · ≤20 red · ≤40 yellow · else green
assert.equal(classifyStockBandByTargetPct(0, 100), 'empty');
assert.equal(classifyStockBandByTargetPct(20, 100), 'critical');
assert.equal(classifyStockBandByTargetPct(21, 100), 'warn');
assert.equal(classifyStockBandByTargetPct(40, 100), 'warn');
assert.equal(classifyStockBandByTargetPct(41, 100), 'ok');
assert.equal(classifyStockBandByTargetPct(100, 100), 'ok');
assert.equal(classifyStockBandByTargetPct(50, 50), 'ok'); // 100% of own max
assert.equal(classifyStockBandByTargetPct(10, 100), 'critical'); // 10%
assert.equal(classifyStockBandByTargetPct(8, 20), 'warn'); // 40% of small SKU max
assert.equal(classifyStockBandByTargetPct(0, 0), 'empty');

assert.equal(stockFillPct(50, 100), 50);
assert.equal(stockFillPct(0, 0), null);

const withPressure = resolveSkuThreshold(
  {
    ...base,
    pressureOverrides: { '10K': { criticalBelow: 5, warnBelow: 50 } },
  },
  { pressureClass: '10K', size: '15A' },
);
assert.equal(withPressure.criticalBelow, 5);
assert.equal(withPressure.warnBelow, 50);
assert.equal(withPressure.targetMax, 50); // alert max when no item target

const withSize = resolveSkuThreshold(
  {
    ...base,
    pressureOverrides: { '10K': { criticalBelow: 5, warnBelow: 50 } },
    sizeOverrides: { '15A': { criticalBelow: 2, warnBelow: 10 } },
  },
  { pressureClass: '10K', size: '15A' },
);
assert.equal(withSize.criticalBelow, 2);
assert.equal(withSize.warnBelow, 10);
assert.equal(withSize.targetMax, 10);

const withSafety = resolveSkuThreshold(base, {
  pressureClass: '10K',
  size: '15A',
  safetyStock: 100,
});
assert.equal(withSafety.criticalBelow, 20);
assert.equal(withSafety.warnBelow, 100);
assert.equal(withSafety.targetMax, 100);

const withItemTarget = resolveSkuThreshold(base, {
  pressureClass: '10K',
  size: '15A',
  safetyStock: 100,
  targetStock: 80,
});
assert.equal(withItemTarget.targetMax, 80); // per-SKU target wins
assert.equal(classifyStockBandByTargetPct(16, withItemTarget.targetMax), 'critical'); // 20%
assert.equal(classifyStockBandByTargetPct(32, withItemTarget.targetMax), 'warn'); // 40%
assert.equal(classifyStockBandByTargetPct(80, withItemTarget.targetMax), 'ok'); // 100%

console.log('stock-alerts.test.ts OK');
