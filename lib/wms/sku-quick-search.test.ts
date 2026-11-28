import assert from 'node:assert/strict';
import { includesToken, matchesSkuQuickSearch } from '@/lib/wms/sku-quick-search';

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

assert.equal(matchesSkuQuickSearch(row50, '50a'), true);
assert.equal(matchesSkuQuickSearch(row50, '50A'), true);
assert.equal(matchesSkuQuickSearch(row150, '50a'), false);
assert.equal(matchesSkuQuickSearch(row150, '150a'), true);
assert.equal(matchesSkuQuickSearch(row50, '10K'), true);
assert.equal(matchesSkuQuickSearch(row50, 'F-304'), true);
assert.equal(matchesSkuQuickSearch(row50, ''), true);

console.log('sku-quick-search.test.ts ok');
