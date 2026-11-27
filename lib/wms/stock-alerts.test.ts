import assert from 'node:assert/strict';
import {
  classifyStockBand,
  resolveSkuThreshold,
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

assert.equal(classifyStockBand(0, 20, 500), 'critical');
assert.equal(classifyStockBand(19, 20, 500), 'critical');
assert.equal(classifyStockBand(20, 20, 500), 'warn');
assert.equal(classifyStockBand(499, 20, 500), 'warn');
assert.equal(classifyStockBand(500, 20, 500), 'ok');

const withPressure = resolveSkuThreshold(
  {
    ...base,
    pressureOverrides: { '10K': { criticalBelow: 5, warnBelow: 50 } },
  },
  { pressureClass: '10K', size: '15A' },
);
assert.equal(withPressure.criticalBelow, 5);
assert.equal(withPressure.warnBelow, 50);

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

const withSafety = resolveSkuThreshold(base, {
  pressureClass: '10K',
  size: '15A',
  safetyStock: 100,
});
assert.equal(withSafety.criticalBelow, 20);
assert.equal(withSafety.warnBelow, 100);

console.log('stock-alerts.test.ts OK');
