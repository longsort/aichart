/**
 * 유일후랜지 카탈로그(유일카다록) TOC·치수페이지에서 뽑은
 * 압력등급·제품/규격 칩 키. PDF는 스캔본이라 텍스트 추출 불가 —
 * TOC p.1 + 제품페이지(p.6/24–56) 제목·압력 헤더를 시드로 고정.
 */

export type CatalogPressureChip = {
  /** URL ?pressure= 값 · Item.pressureClass 저장 키와 맞춤 */
  key: string;
  /** 칩에 보이는 짧은 라벨 */
  label: string;
  /** 호버/title용 전체 카탈로그 표기 */
  title?: string;
  /** 시각 그룹: rating=압력숫자 · product=제품/규격명 */
  group: 'rating' | 'product';
  /** 필터 시 pressureClass 동등 매칭에 추가로 쓸 별칭 */
  pressureAliases?: string[];
  /** productType 포함 매칭 */
  productIncludes?: string[];
  /** standard 포함 매칭 */
  standardIncludes?: string[];
  /** itemName/itemCode 포함 매칭 */
  nameIncludes?: string[];
};

/** 압력 숫자·등급 칩 (KS kg / K / DIN BAR / ANSI / AWWA) */
const RATING_CHIPS: CatalogPressureChip[] = [
  { key: '5K', label: '5K', group: 'rating', pressureAliases: ['5kg/cm²', '5kg'] },
  { key: '10K', label: '10K', group: 'rating', pressureAliases: ['10kg/cm²', '10kg'] },
  { key: '16K', label: '16K', group: 'rating', pressureAliases: ['16kg/cm²', '16kg'] },
  { key: '20K', label: '20K', group: 'rating', pressureAliases: ['20kg/cm²', '20kg', '20kgf/cm²'] },
  { key: '30K', label: '30K', group: 'rating', pressureAliases: ['30kg/cm²', '30kg'] },
  { key: '40K', label: '40K', group: 'rating' },
  { key: '63K', label: '63K', group: 'rating' },
  { key: '5kg/cm²', label: '5kg/cm²', group: 'rating', pressureAliases: ['5K'] },
  { key: '10kg/cm²', label: '10kg/cm²', group: 'rating', pressureAliases: ['10K', '10kg'] },
  { key: '16kg/cm²', label: '16kg/cm²', group: 'rating', pressureAliases: ['16K', '16kg'] },
  { key: '20kg/cm²', label: '20kg/cm²', group: 'rating', pressureAliases: ['20K', '20kgf/cm²'] },
  { key: '30kg/cm²', label: '30kg/cm²', group: 'rating', pressureAliases: ['30K'] },
  { key: '6BAR', label: '6BAR', group: 'rating', title: 'DIN 6BAR (2573/2527/2631)' },
  { key: '10BAR', label: '10BAR', group: 'rating', title: 'DIN 10BAR (2576/2527/2632)' },
  { key: '16BAR', label: '16BAR', group: 'rating', title: 'DIN 16BAR (2543/2527/2633)' },
  { key: '25BAR', label: '25BAR', group: 'rating', title: 'DIN 25BAR (2544/2527/2634)' },
  { key: '40BAR', label: '40BAR', group: 'rating', title: 'DIN 40BAR (2545/2527/2635)' },
  // ANSI / Class = 별도 SKU·필터 (검색 150# = Class only; ANSI 는 ansi150 명시)
  { key: 'ANSI150', label: 'ANSI150', group: 'rating', pressureAliases: ['150LB'] },
  { key: 'ANSI300', label: 'ANSI300', group: 'rating', pressureAliases: ['300LB'] },
  { key: 'Class150', label: 'Class150', group: 'rating', pressureAliases: ['Class 150'] },
  { key: 'Class300', label: 'Class300', group: 'rating', pressureAliases: ['Class 300'] },
  { key: 'AWWA-B', label: 'AWWA-B', group: 'rating', title: 'AWWA Class B (86 psi)' },
  { key: 'AWWA-D', label: 'AWWA-D', group: 'rating', title: 'AWWA Class D (175–150 psi)' },
  { key: 'AWWA-E', label: 'AWWA-E', group: 'rating', title: 'AWWA Class E (275 psi)' },
  {
    key: '210kgf/cm²',
    label: '210kgf/cm²',
    group: 'rating',
    title: '210kgf/cm² (JIS B2291) Oil Pressure',
  },
  { key: '기타', label: '기타', group: 'rating' },
];

/** 카탈로그 제품군·규격명 칩 (TOC + 치수페이지 제목) */
const PRODUCT_CHIPS: CatalogPressureChip[] = [
  {
    key: 'SSC13-ACF',
    label: 'SSC13 ACF 원심주조',
    title: 'SSC13 ACF 원심주조플랜지',
    group: 'product',
    productIncludes: ['SSC13', '원심주조'],
    nameIncludes: ['SSC13', 'ACF', '원심주조'],
  },
  {
    key: 'KS-FLANGES',
    label: 'KS FLANGES',
    title: 'KS FLANGES (KSB 1506)',
    group: 'product',
    productIncludes: ['KS Flange', 'KS FLANGES'],
    standardIncludes: ['KSB 1506', 'KS B1506', 'JIS B2220'],
    nameIncludes: ['KS Flange', 'KSB 1506'],
  },
  {
    key: 'WELDING-NECK',
    label: 'WELDING NECK',
    title: 'WELDING NECK FLANGES',
    group: 'product',
    productIncludes: ['Welding Neck', 'WELDING NECK'],
    nameIncludes: ['Welding Neck', 'WN'],
  },
  {
    key: 'OIL-PRESSURE',
    label: 'OIL PRESSURE',
    title: 'FLANGES FOR OIL PRESSURE · 210kgf/cm² (JIS B2291)',
    group: 'product',
    productIncludes: ['Oil', 'OIL PRESSURE'],
    standardIncludes: ['JIS B2291'],
    nameIncludes: ['Oil', 'OIL', '210kgf'],
    pressureAliases: ['210kgf/cm²'],
  },
  {
    key: 'ANSI-FLANGES',
    label: 'ANSI FLANGES',
    title: 'ANSI FLANGES · JPI 7S-15 / ANSI B16.5',
    group: 'product',
    productIncludes: ['ANSI Flange', 'ANSI FLANGES'],
    standardIncludes: ['ANSI B16.5', 'JPI 7S-15'],
    nameIncludes: ['ANSI'],
  },
  {
    key: 'AWWA-FLANGES',
    label: 'AWWA FLANGES',
    title: 'AWWA FLANGES · C207 / C20',
    group: 'product',
    productIncludes: ['AWWA'],
    standardIncludes: ['AWWA C207', 'AWWA C20'],
    nameIncludes: ['AWWA'],
  },
  {
    key: 'DIN-FLANGES',
    label: 'DIN FLANGES',
    title: 'DIN FLANGES · 6~40BAR slip-on/blind/WN',
    group: 'product',
    productIncludes: ['DIN Flange', 'DIN FLANGES'],
    standardIncludes: ['DIN '],
    nameIncludes: ['DIN'],
  },
  {
    key: 'DIN-2545',
    label: 'DIN 2545',
    title: '40BAR DIN 2545 SLIP-ON FLANGES',
    group: 'product',
    standardIncludes: ['DIN 2545'],
    nameIncludes: ['DIN 2545'],
  },
  {
    key: 'DIN-2527',
    label: 'DIN 2527',
    title: 'DIN 2527 BLIND FLANGES',
    group: 'product',
    standardIncludes: ['DIN 2527'],
    nameIncludes: ['DIN 2527'],
  },
  {
    key: 'DIN-2635',
    label: 'DIN 2635',
    title: '40BAR DIN 2635 WELDING NECK FLANGES',
    group: 'product',
    standardIncludes: ['DIN 2635'],
    nameIncludes: ['DIN 2635'],
  },
  {
    key: 'DIN-2573',
    label: 'DIN 2573',
    title: '6BAR DIN 2573 SLIP-ON',
    group: 'product',
    standardIncludes: ['DIN 2573'],
    nameIncludes: ['DIN 2573'],
  },
  {
    key: 'DIN-2631',
    label: 'DIN 2631',
    title: '6BAR DIN 2631 WELDING NECK',
    group: 'product',
    standardIncludes: ['DIN 2631'],
    nameIncludes: ['DIN 2631'],
  },
  {
    key: 'JESU-KSD4308',
    label: '제수변 KSD 4308',
    title: '제수변 KSD 4308',
    group: 'product',
    productIncludes: ['제수변'],
    standardIncludes: ['KSD 4308', 'KS D 4308'],
    nameIncludes: ['제수변', '4308'],
  },
  {
    key: 'KS-B2332',
    label: '수도용 제수밸브',
    title: '수도용 제수밸브용 플랜지 (KS B 2332-1994)',
    group: 'product',
    productIncludes: ['제수변'],
    standardIncludes: ['KS B 2332', '2332'],
    nameIncludes: ['제수밸브', '2332'],
  },
  {
    key: 'KS-B2333',
    label: '수도용 버터플라이',
    title: '수도용 버터플라이 밸브용 플랜지 (KS B 2333-1994)',
    group: 'product',
    productIncludes: ['제수변', '버터플라이'],
    standardIncludes: ['KS B 2333', '2333'],
    nameIncludes: ['버터플라이', '2333'],
  },
  {
    key: 'KS-D3578',
    label: '수도용 도복장(KS D 3578)',
    title: '수도용 도복장 강관 이형관용(KS D 3578-1997)플랜지 · 10kg/16kg/20kg',
    group: 'product',
    productIncludes: ['도복장', 'KS D 3578'],
    standardIncludes: ['KS D 3578', '3578'],
    nameIncludes: ['도복장', '3578', '이형관'],
  },
  {
    key: 'KS-B6216',
    label: '스프링 안전밸브',
    title: '스프링 안전밸브의 설치 플랜지 (KS B 6216-1998 / JIS B 8210)',
    group: 'product',
    productIncludes: ['안전변'],
    standardIncludes: ['KS B 6216', '6216', 'JIS B 8210'],
    nameIncludes: ['안전밸브', '안전변', '6216'],
  },
];

export const YUIL_CATALOG_PRESSURE_CHIPS: CatalogPressureChip[] = [...RATING_CHIPS, ...PRODUCT_CHIPS];

/** 칩 키 순서 유지 목록 (필터 옵션 기본값) */
export const YUIL_PRESSURE_CHIP_KEYS: string[] = YUIL_CATALOG_PRESSURE_CHIPS.map((c) => c.key);

const CHIP_BY_KEY = new Map(YUIL_CATALOG_PRESSURE_CHIPS.map((c) => [c.key, c]));

export function getCatalogPressureChip(key: string): CatalogPressureChip | undefined {
  return CHIP_BY_KEY.get(key);
}

export function catalogPressureChipLabel(key: string): string {
  return CHIP_BY_KEY.get(key)?.label ?? key;
}

export function catalogPressureChipTitle(key: string): string {
  const c = CHIP_BY_KEY.get(key);
  return c?.title || c?.label || key;
}

/** 신규 등록 select용 — 짧은 압력코드 우선 + 카탈로그 키 */
export const PRESSURE_CLASS_OPTIONS: string[] = YUIL_PRESSURE_CHIP_KEYS;

export type CatalogFilterItem = {
  pressureClass: string;
  productType: string;
  standard: string;
  itemName: string;
  itemCode: string;
};

function includesAny(hay: string, needles?: string[]): boolean {
  if (!needles?.length) return false;
  const h = hay.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

/** 선택한 압력/카탈로그 칩이 이 SKU에 해당하는지 */
export function itemMatchesCatalogPressure(item: CatalogFilterItem, pressureKey: string): boolean {
  const key = (pressureKey || '').trim();
  if (!key || key === 'ALL') return true;

  const chip = CHIP_BY_KEY.get(key);
  const pc = (item.pressureClass || '').trim();
  const pt = item.productType || '';
  const st = item.standard || '';
  const name = `${item.itemName || ''} ${item.itemCode || ''}`;

  // 1) pressureClass 정확 일치 (시드·등록 키)
  if (pc === key) return true;

  if (!chip) {
    // 알 수 없는 키 → pressureClass 정확 일치만
    return pc === key;
  }

  // 2) 별칭 pressureClass — 반드시 전체 문자열 동등 (10kg ⊂ 210kg 부분일치 금지)
  if (chip.pressureAliases?.some((a) => a === pc)) return true;

  // 3) 제품타입 / 규격 / 명칭 (제품·규격 칩)
  if (includesAny(pt, chip.productIncludes)) return true;
  if (includesAny(st, chip.standardIncludes)) return true;
  if (includesAny(name, chip.nameIncludes)) return true;

  return false;
}
