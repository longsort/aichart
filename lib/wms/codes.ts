/** 품목 유형(기초코드) — UI 셀렉트·필터용 */
export const PRODUCT_TYPES = [
  'KS Flange',
  'Welding Neck',
  'ANSI Flange',
  'DIN Flange',
  'AWWA Flange',
  '제수변 Flange',
  '안전변 Flange',
  '기타',
] as const;

/** 압력등급(기초코드) */
export const PRESSURE_CLASSES = [
  '5K',
  '10K',
  '16K',
  '20K',
  '30K',
  'ANSI150',
  'ANSI300',
  '기타',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
export type PressureClass = (typeof PRESSURE_CLASSES)[number];
