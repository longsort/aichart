import assert from 'node:assert/strict';
import {
  comparePressureClass,
  parseSkuSortMode,
  sortSkuRows,
} from '@/lib/wms/sku-list-sort';

assert.equal(parseSkuSortMode(undefined), 'stock');
assert.equal(parseSkuSortMode('qty'), 'qty');
assert.equal(parseSkuSortMode('pressure'), 'pressure');

assert.ok(comparePressureClass('5K', '10K') < 0);
assert.ok(comparePressureClass('10K', '20K') < 0);

const rows = [
  { itemCode: 'A', size: '50A', pressureClass: '20K', onHand: 0 },
  { itemCode: 'B', size: '50A', pressureClass: '10K', onHand: 5 },
  { itemCode: 'C', size: '15A', pressureClass: '10K', onHand: 2 },
  { itemCode: 'D', size: '50A', pressureClass: '10K', onHand: 0 },
];

const stock = sortSkuRows(rows, 'stock').map((r) => r.itemCode);
assert.deepEqual(stock.slice(0, 2).sort(), ['B', 'C']); // 보유>0 먼저
assert.ok(stock.indexOf('B') < stock.indexOf('A'));
assert.ok(stock.indexOf('C') < stock.indexOf('D'));

const qty = sortSkuRows(rows, 'qty').map((r) => r.itemCode);
assert.equal(qty[0], 'B'); // 5
assert.equal(qty[1], 'C'); // 2

const pressure = sortSkuRows(rows, 'pressure').map((r) => r.itemCode);
// 10K before 20K
assert.ok(pressure.indexOf('B') < pressure.indexOf('A'));
assert.ok(pressure.indexOf('C') < pressure.indexOf('A'));

console.log('sku-list-sort.test.ts ok');
