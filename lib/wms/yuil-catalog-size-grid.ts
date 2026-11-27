/**
 * 유일후랜지 카탈로그(KS B1506 / JIS B2220 치수표) 기준
 * 압력등급 × 호칭지름(15A~1000A) SKU 그리드.
 *
 * PDF 스캔본 — 치수페이지(p.24–26 등) 표에서:
 * - 호칭 15A … 1000A (사용자 요청 상한 ~1000A)
 * - 괄호 ( ) = 「가능한 한 사용하지 않는다」→ 시드에서 제외
 * - 10A·1100A+ 는 범위 밖
 */

import { YUIL_CATALOG_PRESSURE_CHIPS } from '@/lib/wms/yuil-catalog-filters';

/** 카탈로그 표에 자주 괄호로 표기된 비권장 호칭 (시드 스킵) */
export const CATALOG_UNUSED_NOMINAL_SIZES = [
  '10A',
  '90A',
  '175A',
  '225A',
  '550A',
  '650A',
  '750A',
  '850A',
  '1100A',
] as const;

/**
 * 15A~1000A 권장 호칭 (괄호 비권장·범위 밖 제외).
 * 5K/10K/16K 페이지 공통으로 쓰이는 축 + 900A·1000A.
 */
export const CATALOG_SEED_NOMINAL_SIZES = [
  '15A',
  '20A',
  '25A',
  '32A',
  '40A',
  '50A',
  '65A',
  '80A',
  '100A',
  '125A',
  '150A',
  '200A',
  '250A',
  '300A',
  '350A',
  '400A',
  '450A',
  '500A',
  '600A',
  '700A',
  '800A',
  '900A',
  '1000A',
] as const;

export type CatalogSeedNominalSize = (typeof CATALOG_SEED_NOMINAL_SIZES)[number];

/**
 * 시드용 압력등급 칩만 (product 칩·별칭 키 제외).
 * 10kg/cm²·Class150 등은 필터 별칭으로 기존 short key SKU에 매칭.
 */
export const CATALOG_SEED_PRESSURE_KEYS: string[] = YUIL_CATALOG_PRESSURE_CHIPS.filter(
  (c) => c.group === 'rating' && !isAliasOnlyRatingKey(c.key),
).map((c) => c.key);

function isAliasOnlyRatingKey(key: string): boolean {
  // short 코드와 동일 의미 — 별도 SKU 만들면 10K 필터에 중복 행
  if (/^\d+kg\/cm²$/i.test(key)) return true;
  if (/^Class\d+$/i.test(key)) return true;
  return false;
}

/** itemCode용 압력 토큰 (슬래시·² 제거) */
export function pressureKeyToCodeToken(pressure: string): string {
  return String(pressure || '')
    .replace(/kgf\/cm²/gi, 'kgf')
    .replace(/kg\/cm²/gi, 'kg')
    .replace(/[^A-Za-z0-9가-힣_-]/g, '')
    .trim();
}

export function buildCatalogGridItemCode(pressure: string, size: string): string {
  return `F-304-${pressureKeyToCodeToken(pressure)}-${size}`;
}

export function buildCatalogGridItemName(pressure: string, size: string): string {
  return `KS Flange ${pressure} ${size} SCS304`;
}

export type CatalogGridSku = {
  itemCode: string;
  itemName: string;
  pressureClass: string;
  size: string;
  productType: string;
  standard: string;
  materialType: 'SCS304';
  unit: 'EA';
  safetyStock: number;
  memo: string;
};

/** 압력 × 사이즈 전체 그리드 (수량 0 시드용) */
export function buildCatalogPressureSizeGrid(): CatalogGridSku[] {
  const out: CatalogGridSku[] = [];
  for (const pressure of CATALOG_SEED_PRESSURE_KEYS) {
    for (const size of CATALOG_SEED_NOMINAL_SIZES) {
      out.push({
        itemCode: buildCatalogGridItemCode(pressure, size),
        itemName: buildCatalogGridItemName(pressure, size),
        pressureClass: pressure,
        size,
        productType: 'KS Flange',
        standard: 'KS B1506 / JIS B2220',
        materialType: 'SCS304',
        unit: 'EA',
        safetyStock: 0,
        memo: 'catalog size-grid seed · qty 0 until stock move',
      });
    }
  }
  return out;
}

export function catalogGridSeedCounts() {
  const pressures = CATALOG_SEED_PRESSURE_KEYS.length;
  const sizes = CATALOG_SEED_NOMINAL_SIZES.length;
  return {
    pressures,
    sizes,
    skus: pressures * sizes,
    unusedSkipped: CATALOG_UNUSED_NOMINAL_SIZES.length,
  };
}
