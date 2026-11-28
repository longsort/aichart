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

/** 압력 × 사이즈 전체 그리드 (수량 0 시드용) — KS Flange 기본 축 */
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

/**
 * 제품·규격 칩별 시드 축.
 * rating 그리드(KS Flange)만으로는 WELDING NECK / DIN / ANSI 제품칩이 비므로
 * 칩 매칭용 productType·standard·itemName 을 압력×사이즈로 채운다.
 * (KS-FLANGES 는 rating 그리드 productType 으로 이미 매칭 → 여기 제외)
 */
export type CatalogProductSeedSpec = {
  chipKey: string;
  codeToken: string;
  productType: string;
  standard: string;
  namePrefix: string;
  pressures: readonly string[];
};

const KS_RATING = ['5K', '10K', '16K', '20K', '30K', '40K', '63K'] as const;
const DIN_BARS = ['6BAR', '10BAR', '16BAR', '25BAR', '40BAR'] as const;

export const CATALOG_PRODUCT_SEED_SPECS: CatalogProductSeedSpec[] = [
  {
    chipKey: 'WELDING-NECK',
    codeToken: 'WN',
    productType: 'Welding Neck',
    standard: 'JIS B2220 / KS B1506',
    namePrefix: 'Welding Neck',
    pressures: KS_RATING,
  },
  {
    chipKey: 'OIL-PRESSURE',
    codeToken: 'OIL',
    productType: 'Oil Pressure',
    standard: 'JIS B2291-1907',
    namePrefix: 'Oil Pressure SHA',
    pressures: ['210kgf/cm²'],
  },
  {
    chipKey: 'ANSI-FLANGES',
    codeToken: 'ANSI',
    productType: 'ANSI Flange',
    standard: 'ANSI B16.5 / JPI 7S-15',
    namePrefix: 'ANSI Flange',
    pressures: ['ANSI150', 'ANSI300'],
  },
  {
    chipKey: 'AWWA-FLANGES',
    codeToken: 'AWWA',
    productType: 'AWWA Flange',
    standard: 'AWWA C207 / C20',
    namePrefix: 'AWWA Flange',
    pressures: ['AWWA-B', 'AWWA-D', 'AWWA-E'],
  },
  {
    chipKey: 'DIN-FLANGES',
    codeToken: 'DIN',
    productType: 'DIN Flange',
    standard: 'DIN slip-on/blind/WN',
    namePrefix: 'DIN Flange',
    pressures: DIN_BARS,
  },
  {
    chipKey: 'DIN-2545',
    codeToken: 'DIN2545',
    productType: 'DIN Flange',
    standard: 'DIN 2545',
    namePrefix: 'DIN 2545 SLIP-ON',
    pressures: ['40BAR'],
  },
  {
    chipKey: 'DIN-2527',
    codeToken: 'DIN2527',
    productType: 'DIN Flange',
    standard: 'DIN 2527',
    namePrefix: 'DIN 2527 BLIND',
    pressures: DIN_BARS,
  },
  {
    chipKey: 'DIN-2635',
    codeToken: 'DIN2635',
    productType: 'DIN Flange',
    standard: 'DIN 2635',
    namePrefix: 'DIN 2635 WELDING NECK',
    pressures: ['40BAR'],
  },
  {
    chipKey: 'DIN-2573',
    codeToken: 'DIN2573',
    productType: 'DIN Flange',
    standard: 'DIN 2573',
    namePrefix: 'DIN 2573 SLIP-ON',
    pressures: ['6BAR'],
  },
  {
    chipKey: 'DIN-2631',
    codeToken: 'DIN2631',
    productType: 'DIN Flange',
    standard: 'DIN 2631',
    namePrefix: 'DIN 2631 WELDING NECK',
    pressures: ['6BAR'],
  },
  {
    chipKey: 'SSC13-ACF',
    codeToken: 'SSC13',
    productType: 'SSC13 ACF',
    standard: 'SSC13 ACF',
    namePrefix: 'SSC13 ACF 원심주조플랜지',
    pressures: ['10K'],
  },
  {
    chipKey: 'JESU-KSD4308',
    codeToken: 'JESU4308',
    productType: '제수변 Flange',
    standard: 'KSD 4308',
    namePrefix: '제수변 KSD 4308',
    pressures: ['10K'],
  },
  {
    chipKey: 'KS-B2332',
    codeToken: 'B2332',
    productType: '제수변 Flange',
    standard: 'KS B 2332-1994',
    namePrefix: '수도용 제수밸브용 플랜지',
    pressures: ['10K', '16K'],
  },
  {
    chipKey: 'KS-B2333',
    codeToken: 'B2333',
    productType: '제수변 Flange',
    standard: 'KS B 2333-1994',
    namePrefix: '수도용 버터플라이 밸브용 플랜지',
    pressures: ['10K', '16K'],
  },
  {
    chipKey: 'KS-D3578',
    codeToken: 'D3578',
    productType: '수도용 도복장',
    standard: 'KS D 3578-1997',
    namePrefix: '수도용 도복장 강관 이형관용 플랜지',
    pressures: ['10K', '16K', '20K'],
  },
  {
    chipKey: 'KS-B6216',
    codeToken: 'B6216',
    productType: '안전변 Flange',
    standard: 'KS B 6216-1998 / JIS B 8210',
    namePrefix: '스프링 안전밸브 설치 플랜지',
    pressures: ['10K', '20K'],
  },
];

export function buildCatalogProductSpecItemCode(
  codeToken: string,
  pressure: string,
  size: string,
): string {
  let pTok = pressureKeyToCodeToken(pressure);
  // 가독성: AWWA-B → B, 210kgf/cm² → 210
  if (codeToken === 'AWWA' && /^AWWA-/i.test(pressure)) {
    pTok = pressure.replace(/^AWWA-/i, '');
  } else if (codeToken === 'OIL' && /210/.test(pressure)) {
    pTok = '210';
  }
  return `F-${codeToken}-${pTok}-${size}`;
}

/** 제품·규격 칩 × 해당 압력 × 사이즈 그리드 */
export function buildCatalogProductSpecSizeGrid(): CatalogGridSku[] {
  const out: CatalogGridSku[] = [];
  for (const spec of CATALOG_PRODUCT_SEED_SPECS) {
    for (const pressure of spec.pressures) {
      for (const size of CATALOG_SEED_NOMINAL_SIZES) {
        out.push({
          itemCode: buildCatalogProductSpecItemCode(spec.codeToken, pressure, size),
          itemName: `${spec.namePrefix} ${pressure} ${size} SCS304`,
          pressureClass: pressure,
          size,
          productType: spec.productType,
          standard: spec.standard,
          materialType: 'SCS304',
          unit: 'EA',
          safetyStock: 0,
          memo: `catalog product-spec seed · ${spec.chipKey} · qty 0`,
        });
      }
    }
  }
  return out;
}

/** rating 그리드 + 제품·규격 그리드 (itemCode 중복 없이 합침) */
export function buildAllCatalogSeedSkus(): CatalogGridSku[] {
  const rating = buildCatalogPressureSizeGrid();
  const products = buildCatalogProductSpecSizeGrid();
  const seen = new Set(rating.map((g) => g.itemCode));
  const merged = [...rating];
  for (const g of products) {
    if (seen.has(g.itemCode)) continue;
    seen.add(g.itemCode);
    merged.push(g);
  }
  return merged;
}

export function catalogGridSeedCounts() {
  const pressures = CATALOG_SEED_PRESSURE_KEYS.length;
  const sizes = CATALOG_SEED_NOMINAL_SIZES.length;
  const ratingSkus = pressures * sizes;
  const productSkus = buildCatalogProductSpecSizeGrid().length;
  const productSpecs = CATALOG_PRODUCT_SEED_SPECS.length;
  return {
    pressures,
    sizes,
    skus: ratingSkus,
    ratingSkus,
    productSkus,
    productSpecs,
    totalSkus: ratingSkus + productSkus,
    unusedSkipped: CATALOG_UNUSED_NOMINAL_SIZES.length,
  };
}
