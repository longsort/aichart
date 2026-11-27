import {
  PRESSURE_CLASS_OPTIONS,
  YUIL_PRESSURE_CHIP_KEYS,
} from '@/lib/wms/yuil-catalog-filters';
import { CATALOG_SEED_NOMINAL_SIZES } from '@/lib/wms/yuil-catalog-size-grid';

/** 품목 유형(기초코드) — UI 셀렉트·필터용 · 유일 카탈로그 TOC 제품군 */
export const PRODUCT_TYPES = [
  'KS Flange',
  'Welding Neck',
  'Oil Pressure',
  'ANSI Flange',
  'AWWA Flange',
  'DIN Flange',
  '제수변 Flange',
  '안전변 Flange',
  'SSC13 ACF',
  '수도용 도복장',
  '기타',
] as const;

/**
 * 압력등급·카탈로그 제품/규격 칩 키
 * (유일카다록 TOC + 치수페이지: 5K~63K, kg/cm², BAR, ANSI, AWWA, DIN·KS 제품명)
 */
export const PRESSURE_CLASSES = PRESSURE_CLASS_OPTIONS as readonly string[];

/** 대시보드 압력등급 행에 항상 노출할 카탈로그 칩 키 (순서 고정) */
export const CATALOG_PRESSURE_CHIP_KEYS = YUIL_PRESSURE_CHIP_KEYS;

/**
 * 호칭지름(사이즈) — 카탈로그 치수표 권장축 15A~1000A
 * (괄호 비권장·10A·1100A+ 제외 — yuil-catalog-size-grid)
 */
export const NOMINAL_SIZES = CATALOG_SEED_NOMINAL_SIZES;

export type ProductType = (typeof PRODUCT_TYPES)[number];
export type PressureClass = string;
export type NominalSize = (typeof NOMINAL_SIZES)[number];

/** 호칭지름 숫자 비교 — 15A < 100A < 1000A (문자열 정렬 금지) */
export function compareNominalSize(a: string, b: string): number {
  const na = parseInt(String(a || '').replace(/[^0-9]/g, ''), 10);
  const nb = parseInt(String(b || '').replace(/[^0-9]/g, ''), 10);
  const aOk = Number.isFinite(na);
  const bOk = Number.isFinite(nb);
  if (aOk && bOk && na !== nb) return na - nb;
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  return String(a || '').localeCompare(String(b || ''), 'ko');
}
