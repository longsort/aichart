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

// Class via #: 150# / 300# / 100a150# → Class only (never ANSI)
const rowClass150 = {
  pressureClass: 'Class150',
  size: '100A',
  itemCode: 'F-304-CLASS150-100A',
  itemName: 'Class150 100A',
  extra: 'Class150',
};
const rowClass300 = {
  pressureClass: 'Class300',
  size: '100A',
  itemCode: 'F-304-CLASS300-100A',
  itemName: 'Class300 100A',
  extra: 'Class300',
};
const rowAnsi150 = {
  pressureClass: 'ANSI150',
  size: '100A',
  itemCode: 'F-304-ANSI150-100A',
  itemName: 'ANSI Class150 100A',
  extra: 'ANSI150',
};
const hash150 = parseCompactSkuQuery('150#');
assert.deepEqual(hash150.pressures, ['class150']);
const hashCombo = parseCompactSkuQuery('100a150#');
assert.deepEqual(hashCombo.sizes, ['100a']);
assert.ok(hashCombo.pressures.includes('class150'));
// bare 100a150 / 100A150 → class150 (not ANSI)
const bareCombo = parseCompactSkuQuery('100a150');
assert.deepEqual(bareCombo.sizes, ['100a']);
assert.deepEqual(bareCombo.pressures, ['class150']);
assert.deepEqual(parseCompactSkuQuery('100A150').pressures, ['class150']);
assert.deepEqual(parseCompactSkuQuery('150').pressures, ['class150']);
assert.deepEqual(parseCompactSkuQuery('ansi150').pressures, ['ansi150']);

assert.equal(matchesSkuQuickSearch(rowClass150, '150#'), true);
assert.equal(matchesSkuQuickSearch(rowClass150, '100a150#'), true);
assert.equal(matchesSkuQuickSearch(rowClass150, '100a150'), true);
assert.equal(matchesSkuQuickSearch(rowClass150, '100A150'), true);
assert.equal(matchesSkuQuickSearch(rowClass150, '150'), true);
assert.equal(matchesSkuQuickSearch(rowClass300, '150#'), false);
assert.equal(matchesSkuQuickSearch(rowClass300, '300#'), true);
assert.equal(matchesSkuQuickSearch(rowClass150, '300#'), false);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '150#'), false);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '100a150#'), false);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '100a150'), false);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '100A150'), false);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '150'), false);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '300#'), false);
// ANSI only when explicitly typed
assert.equal(matchesSkuQuickSearch(rowAnsi150, 'ansi150'), true);
assert.equal(matchesSkuQuickSearch(rowAnsi150, '100aansi150'), true);
assert.equal(matchesSkuQuickSearch(rowClass150, 'ansi150'), false);

console.log('sku-quick-search.test.ts ok');
