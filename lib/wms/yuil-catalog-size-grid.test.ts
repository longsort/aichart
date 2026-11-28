import assert from 'node:assert/strict';
import { compareNominalSize } from '@/lib/wms/codes';
import {
  CATALOG_PRODUCT_SEED_SPECS,
  CATALOG_SEED_NOMINAL_SIZES,
  CATALOG_SEED_PRESSURE_KEYS,
  CATALOG_UNUSED_NOMINAL_SIZES,
  buildAllCatalogSeedSkus,
  buildCatalogGridItemCode,
  buildCatalogPressureSizeGrid,
  buildCatalogProductSpecSizeGrid,
  catalogGridSeedCounts,
} from '@/lib/wms/yuil-catalog-size-grid';
import { itemMatchesCatalogPressure } from '@/lib/wms/yuil-catalog-filters';

assert.ok(compareNominalSize('15A', '1000A') < 0);
assert.ok(compareNominalSize('100A', '1000A') < 0);
assert.ok(compareNominalSize('900A', '1000A') < 0);
assert.deepEqual(
  ['1000A', '15A', '100A', '50A'].sort(compareNominalSize),
  ['15A', '50A', '100A', '1000A'],
);

assert.ok(CATALOG_SEED_NOMINAL_SIZES.includes('15A'));
assert.ok(CATALOG_SEED_NOMINAL_SIZES.includes('1000A'));
assert.ok(CATALOG_SEED_NOMINAL_SIZES.includes('900A'));
assert.ok(!CATALOG_SEED_NOMINAL_SIZES.includes('90A')); // catalog unused
assert.ok(!CATALOG_SEED_NOMINAL_SIZES.includes('550A'));
assert.ok(!CATALOG_SEED_NOMINAL_SIZES.includes('10A'));

assert.ok(CATALOG_UNUSED_NOMINAL_SIZES.includes('90A'));
assert.ok(CATALOG_UNUSED_NOMINAL_SIZES.includes('850A'));

assert.ok(CATALOG_SEED_PRESSURE_KEYS.includes('10K'));
assert.ok(CATALOG_SEED_PRESSURE_KEYS.includes('5K'));
assert.ok(CATALOG_SEED_PRESSURE_KEYS.includes('40BAR'));
assert.ok(CATALOG_SEED_PRESSURE_KEYS.includes('ANSI150'));
assert.ok(CATALOG_SEED_PRESSURE_KEYS.includes('210kgf/cm²'));
assert.ok(!CATALOG_SEED_PRESSURE_KEYS.includes('10kg/cm²')); // alias-only
assert.ok(!CATALOG_SEED_PRESSURE_KEYS.includes('Class150'));
assert.ok(!CATALOG_SEED_PRESSURE_KEYS.includes('KS-FLANGES')); // product chip

assert.equal(buildCatalogGridItemCode('10K', '15A'), 'F-304-10K-15A');
assert.equal(buildCatalogGridItemCode('210kgf/cm²', '25A'), 'F-304-210kgf-25A');

const grid = buildCatalogPressureSizeGrid();
const counts = catalogGridSeedCounts();
assert.equal(grid.length, counts.skus);
assert.equal(counts.skus, counts.pressures * counts.sizes);
assert.equal(counts.sizes, 23);
assert.ok(counts.pressures >= 18);
assert.ok(counts.skus >= 18 * 23);

const tenK = grid.filter((g) => g.pressureClass === '10K');
assert.equal(tenK.length, counts.sizes);
assert.ok(tenK.every((g) => g.itemCode.startsWith('F-304-10K-')));
assert.ok(tenK.some((g) => g.size === '1000A'));

const codes = new Set(grid.map((g) => g.itemCode));
assert.equal(codes.size, grid.length, 'itemCode unique');

assert.ok(CATALOG_PRODUCT_SEED_SPECS.some((s) => s.chipKey === 'WELDING-NECK'));
assert.ok(CATALOG_PRODUCT_SEED_SPECS.some((s) => s.chipKey === 'DIN-2545'));
assert.ok(!CATALOG_PRODUCT_SEED_SPECS.some((s) => s.chipKey === 'KS-FLANGES'));

const productGrid = buildCatalogProductSpecSizeGrid();
assert.equal(productGrid.length, counts.productSkus);
assert.ok(counts.productSkus >= CATALOG_SEED_NOMINAL_SIZES.length * 10);

const wn = productGrid.filter((g) => g.productType === 'Welding Neck');
assert.equal(wn.length, 7 * counts.sizes);
assert.ok(wn.every((g) => itemMatchesCatalogPressure(g, 'WELDING-NECK')));
assert.ok(
  productGrid
    .filter((g) => g.standard === 'DIN 2545')
    .every((g) => itemMatchesCatalogPressure(g, 'DIN-2545') && itemMatchesCatalogPressure(g, 'DIN-FLANGES')),
);

const all = buildAllCatalogSeedSkus();
assert.equal(all.length, counts.ratingSkus + counts.productSkus);
assert.equal(new Set(all.map((g) => g.itemCode)).size, all.length, 'merged itemCode unique');

console.log(
  'yuil-catalog-size-grid.test.ts OK',
  counts.pressures,
  '×',
  counts.sizes,
  '=',
  counts.ratingSkus,
  '+ product',
  counts.productSkus,
  '=',
  counts.totalSkus,
);
