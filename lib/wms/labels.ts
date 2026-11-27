import type { InventoryLotStatus, ProcessStep } from '@prisma/client';

/** LOT 상태 한글 */
export function lotStatusLabel(s: InventoryLotStatus): string {
  const m: Record<InventoryLotStatus, string> = {
    NORMAL: '정상',
    WAIT_INSPECTION: '검사대기',
    PROCESSING: '가공중',
    DEFECT: '불량',
    SHIPPED: '출고완료',
    HOLD: '보류',
  };
  return m[s] ?? s;
}

/** 가공 단계 한글 */
export function processStepLabel(s: ProcessStep): string {
  const m: Record<ProcessStep, string> = {
    RAW: '원재료',
    CUTTING: '절단',
    CNC: 'CNC',
    DRILLING: '드릴',
    INSPECTION: '검사',
    FINISHED: '완료',
  };
  return m[s] ?? s;
}

/** 가공지시 상태 한글 */
export function processOrderStatusLabel(status: string): string {
  const m: Record<string, string> = {
    READY: '대기',
    PROCESSING: '가공중',
    DONE: '완료',
    CANCELLED: '취소',
  };
  return m[status] ?? status;
}
