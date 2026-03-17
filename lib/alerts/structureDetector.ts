/** 이전/현재 분석 비교로 구조·패턴 변화 알림 메시지 생성 */
export type DominantLike = { type: string; confidence: number; bias: string; label?: string } | null;

const PATTERN_ALERT: Record<string, string> = {
  'Falling Wedge': '하락웨지 감지 — 반등 가능성',
  'Rising Wedge': '상승웨지 감지 — 하락 전환 주의',
  'Head and Shoulders': 'Head & Shoulders 감지 — 하락 전환 주의',
  'Inverse Head and Shoulders': 'Inverse H&S 감지 — 반등 가능성',
  'Double Top': '더블탑 감지 — 하락 가능성',
  'Double Bottom': '더블바텀 감지 — 반등 가능성',
  'Ascending Triangle': '상승삼각형 감지 — 상승 돌파 관심',
  'Descending Triangle': '하락삼각형 감지 — 하락 돌파 관심',
  'Symmetrical Triangle': '대칭삼각형 감지 — 돌파 방향 주시',
  'Bull Flag': '불 플래그 감지 — 상승 연속 가능',
  'Bear Flag': '베어 플래그 감지 — 하락 연속 가능',
  'Channel Up': '상승채널 — 상승 추세 지속',
  'Channel Down': '하락채널 — 하락 추세 지속',
  'Range': '레인지 — 횡보 구간',
};

export function getStructureAlerts(
  prevDominant: DominantLike,
  currentDominant: DominantLike
): string[] {
  const out: string[] = [];
  if (!currentDominant) return out;
  const prevKey = prevDominant?.type ?? '';
  const currKey = currentDominant.type;
  if (prevKey !== currKey) {
    const msg = PATTERN_ALERT[currKey] ?? `${currentDominant.label ?? currKey} 감지`;
    out.push(msg);
  }
  return out;
}
