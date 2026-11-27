import type { MaterialType } from '@prisma/client';

/** 제품 타입 (기초코드) */
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

/** 압력 등급 (기초코드) */
export const PRESSURE_CLASSES = ['5K', '10K', '16K', '20K', '30K', 'ANSI150', 'ANSI300', '기타'] as const;

/** 재질 표시명 (UI) */
export const MATERIAL_LABELS: Record<MaterialType, string> = {
  SCS304: 'SCS304',
  SCS316: 'SCS316',
  SEMI_RAW: '毛皮 반제품',
};

/** LOT 상태 한글 */
export const LOT_STATUS_LABELS: Record<string, string> = {
  NORMAL: '정상',
  WAIT_INSPECTION: '검사대기',
  PROCESSING: '가공중',
  DEFECT: '불량',
  SHIPPED: '출고완료',
  HOLD: '보류',
};

/** 이동 유형 한글 */
export const MOVE_TYPE_LABELS: Record<string, string> = {
  IN: '입고',
  OUT: '출고',
  ADJUST: '조정',
  PROCESS_IN: '가공투입',
  PROCESS_OUT: '가공산출',
  TRANSFER: '이동',
};
