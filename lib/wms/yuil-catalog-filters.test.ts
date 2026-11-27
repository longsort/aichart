import assert from 'node:assert/strict';
import {
  YUIL_CATALOG_PRESSURE_CHIPS,
  itemMatchesCatalogPressure,
} from '@/lib/wms/yuil-catalog-filters';

const sample = {
  pressureClass: '40BAR',
  productType: 'DIN Flange',
  standard: 'DIN 2545',
  itemName: '40BAR DIN 2545 SLIP-ON 50A',
  itemCode: 'F-DIN2545-40BAR-50A',
};

assert.equal(itemMatchesCatalogPressure(sample, 'ALL'), true);
assert.equal(itemMatchesCatalogPressure(sample, '40BAR'), true);
assert.equal(itemMatchesCatalogPressure(sample, 'DIN-2545'), true);
assert.equal(itemMatchesCatalogPressure(sample, 'DIN-FLANGES'), true);
assert.equal(itemMatchesCatalogPressure(sample, 'DIN-2527'), false);
assert.equal(itemMatchesCatalogPressure(sample, '10K'), false);

const coated = {
  pressureClass: '10kg/cm²',
  productType: '수도용 도복장',
  standard: 'KS D 3578-1997',
  itemName: '수도용 도복장 강관 이형관용(KS D 3578-1997)플랜지 10kg 100A',
  itemCode: 'F-3578-10KG-100A',
};
assert.equal(itemMatchesCatalogPressure(coated, 'KS-D3578'), true);
assert.equal(itemMatchesCatalogPressure(coated, '10kg/cm²'), true);
assert.equal(itemMatchesCatalogPressure(coated, '10K'), true); // alias exact
assert.equal(itemMatchesCatalogPressure(coated, '40BAR'), false);

const oil = {
  pressureClass: '210kgf/cm²',
  productType: 'Oil Pressure',
  standard: 'JIS B2291-1907',
  itemName: '210kgf/cm² Oil Pressure SHA 25A',
  itemCode: 'F-OIL-210-25A',
};
assert.equal(itemMatchesCatalogPressure(oil, '10K'), false); // no substring 10kg⊂210kg
assert.equal(itemMatchesCatalogPressure(oil, '210kgf/cm²'), true);
assert.equal(itemMatchesCatalogPressure(oil, 'OIL-PRESSURE'), true);

assert.ok(YUIL_CATALOG_PRESSURE_CHIPS.length >= 30);
assert.ok(YUIL_CATALOG_PRESSURE_CHIPS.some((c) => c.key === '40BAR'));
assert.ok(YUIL_CATALOG_PRESSURE_CHIPS.some((c) => c.key === 'KS-D3578'));
assert.ok(YUIL_CATALOG_PRESSURE_CHIPS.some((c) => c.group === 'product'));

console.log('yuil-catalog-filters.test.ts OK', YUIL_CATALOG_PRESSURE_CHIPS.length, 'chips');
