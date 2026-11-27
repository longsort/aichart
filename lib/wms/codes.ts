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

/** 호칭지름(사이즈) — 카탈로그·레거시 패널과 동일 축 */
export const NOMINAL_SIZES = [
  '15A',
  '20A',
  '25A',
  '32A',
  '40A',
  '50A',
  '65A',
  '80A',
  '90A',
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
  '550A',
  '600A',
  '650A',
  '700A',
  '750A',
  '800A',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
export type PressureClass = (typeof PRESSURE_CLASSES)[number];
export type NominalSize = (typeof NOMINAL_SIZES)[number];
