import assert from 'node:assert/strict';
import { compareNominalSize } from '@/lib/wms/codes';
import {
  CATALOG_SEED_NOMINAL_SIZES,
  CATALOG_SEED_PRESSURE_KEYS,
  CATALOG_UNUSED_NOMINAL_SIZES,
  buildCatalogGridItemCode,
  buildCatalogPressureSizeGrid,
  catalogGridSeedCounts,
} from '@/lib/wms/yuil-catalog-size-grid';

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

console.log(
  'yuil-catalog-size-grid.test.ts OK',
  counts.pressures,
  '×',
  counts.sizes,
  '=',
  counts.skus,
);
