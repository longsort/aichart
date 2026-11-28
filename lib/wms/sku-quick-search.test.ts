import assert from 'node:assert/strict';
import {
  includesToken,
  matchesSkuQuickSearch,
  parseCompactSkuQuery,
} from '@/lib/wms/sku-quick-search';

assert.equal(includesToken('F-304-10K-50A', '50a'), true);
assert.equal(includesToken('F-304-10K-150A', '50a'), false);
assert.equal(includesToken('50A', '50a'), true);

const row50 = {
  pressureClass: '10K',
  size: '50A',
  itemCode: 'F-304-10K-50A',
  itemName: 'KS 10K 50A',
};
const row150 = {
  pressureClass: '10K',
  size: '150A',
  itemCode: 'F-304-10K-150A',
  itemName: 'KS 10K 150A',
};
const row20blrf = {
  pressureClass: '20K',
  size: '50A',
  itemCode: 'F-304-BLRF-20K-50A',
  itemName: 'KS Flange BLRF 20K 50A SCS304',
};
const row20blff = {
  pressureClass: '20K',
  size: '50A',
  itemCode: 'F-304-BLFF-20K-50A',
  itemName: 'KS Flange BLFF 20K 50A SCS304',
};
const row20soff = {
  pressureClass: '20K',
  size: '50A',
  itemCode: 'F-304-SOFF-20K-50A',
  itemName: 'KS Flange SOFF 20K 50A SCS304',
};
const row10 = {
  pressureClass: '10K',
  size: '50A',
  itemCode: 'F-304-BLRF-10K-50A',
  itemName: 'KS Flange BLRF 10K 50A SCS304',
};

assert.equal(matchesSkuQuickSearch(row50, '50a'), true);
assert.equal(matchesSkuQuickSearch(row50, '50A'), true);
assert.equal(matchesSkuQuickSearch(row150, '50a'), false);
assert.equal(matchesSkuQuickSearch(row150, '150a'), true);
assert.equal(matchesSkuQuickSearch(row50, '10K'), true);
assert.equal(matchesSkuQuickSearch(row50, 'F-304'), true);
assert.equal(matchesSkuQuickSearch(row50, ''), true);

// compact: 20K50A / 50A20K
assert.equal(matchesSkuQuickSearch(row20blrf, '20K50A'), true);
assert.equal(matchesSkuQuickSearch(row20blrf, '50A20K'), true);
assert.equal(matchesSkuQuickSearch(row10, '20K50A'), false);

// compact: 50A20BL — K optional, BL prefix → BLFF|BLRF
assert.equal(matchesSkuQuickSearch(row20blrf, '50A20BL'), true);
assert.equal(matchesSkuQuickSearch(row20blff, '50A20BL'), true);
assert.equal(matchesSkuQuickSearch(row20soff, '50A20BL'), false);
assert.equal(matchesSkuQuickSearch(row10, '50A20BL'), false);

// compact: 50A20BLRF
assert.equal(matchesSkuQuickSearch(row20blrf, '50A20BLRF'), true);
assert.equal(matchesSkuQuickSearch(row20blff, '50A20BLRF'), false);

// spaced tokens
assert.equal(matchesSkuQuickSearch(row20blrf, '50A 20K BLRF'), true);

const parsed = parseCompactSkuQuery('50A20BL');
assert.deepEqual(parsed.sizes, ['50a']);
assert.ok(parsed.pressures.includes('20'));
assert.ok(parsed.faces.some((f) => f === 'bl' || f.startsWith('bl')));

console.log('sku-quick-search.test.ts ok');
