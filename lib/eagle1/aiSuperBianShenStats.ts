/**
 * AI超级变身统计 — 앱 전역 단일 판정 브랜드·소스 키.
 * 기능 삭제 없음. Hub·HUD·스트립·텔레·가격선이 동일 라벨을 공유.
 */
export const AI_SUPER_BIANSHEN_STATS = 'AI超级变身统计' as const;
export const AI_SUPER_BIANSHEN_STATS_SHORT = '变身统计' as const;
export const AI_SUPER_BIANSHEN_STATS_TAG = 'AI超级变身' as const;

export function aiSuperStatsSourceKo(): string {
  return AI_SUPER_BIANSHEN_STATS;
}

export function aiSuperStatsHeadline(
  verdictKo: string,
  longPct: number,
  shortPct: number,
  entry: number | null,
  stopLoss: number | null,
  tp1: number | null
): string {
  return `${AI_SUPER_BIANSHEN_STATS} · ${verdictKo} · 롱${longPct}%/숏${shortPct}% · E ${entry ?? '—'} · SL ${stopLoss ?? '—'} · TP1 ${tp1 ?? '—'}`;
}

export function aiSuperStatsDesignKo(): string {
  return `${AI_SUPER_BIANSHEN_STATS}: 카드·캔들·학파·POC·AVWAP·마스터·구조 투표 → 1판정 · E/SL/TP 기하고정 · TF스윙 현물% · 충돌시 WAIT · 확정수익 아님`;
}
