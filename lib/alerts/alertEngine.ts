import { getStructureAlerts, type DominantLike } from './structureDetector';

const MAX_ALERTS = 10;

export type StructureAlertItem = { id: string; message: string; at: number };

let alertQueue: StructureAlertItem[] = [];
let lastDominant: DominantLike = null;

/** 분석 결과 반영 후 호출. dominant가 바뀌면 알림 큐에 추가 */
export function pushStructureAlertsFromAnalysis(dominant: DominantLike): StructureAlertItem[] {
  const newAlerts = getStructureAlerts(lastDominant, dominant);
  lastDominant = dominant;
  for (const msg of newAlerts) {
    alertQueue = [{ id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message: msg, at: Date.now() }, ...alertQueue].slice(0, MAX_ALERTS);
  }
  return alertQueue;
}

/** 현재 알림 목록 (UI 표시용) */
export function getStructureAlertsQueue(): StructureAlertItem[] {
  return [...alertQueue];
}

/** 알림 초기화 (테스트/리셋용) */
export function clearStructureAlerts(): void {
  alertQueue = [];
  lastDominant = null;
}
