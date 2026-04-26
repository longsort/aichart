import type { AnalyzeResponse, OverlayItem } from '@/types';

/** `close-*` 키레벨 id → AnalyzeResponse 종가 필드 */
const CLOSE_ID_TO_ANALYSIS_LEVEL: Record<
  string,
  keyof Pick<
    AnalyzeResponse,
    | 'closeLevel1m'
    | 'closeLevel5m'
    | 'closeLevel15m'
    | 'closeLevel1h'
    | 'closeLevel4h'
    | 'dailyCloseLevel'
    | 'weeklyCloseLevel'
    | 'monthlyCloseLevel'
  >
> = {
  'close-1m': 'closeLevel1m',
  'close-5m': 'closeLevel5m',
  'close-15m': 'closeLevel15m',
  'close-1h': 'closeLevel1h',
  'close-4h': 'closeLevel4h',
  'close-daily': 'dailyCloseLevel',
  'close-weekly': 'weeklyCloseLevel',
  'close-monthly': 'monthlyCloseLevel',
};

/**
 * 구버전 응답(y·closeOverlayRange만 있고 price 없음)에서도 축·캔들과 맞는 가격으로 복원.
 * 신버전은 API가 이미 `price1`/`price2`를 넣으므로 그대로 둠.
 */
export function patchCloseLevelOverlayPrices(
  overlays: OverlayItem[],
  analysis: AnalyzeResponse | null | undefined
): OverlayItem[] {
  if (!overlays.length || !analysis) return overlays;
  return overlays.map((item) => {
    const id = String((item as { id?: string }).id || '');
    const cur = item as OverlayItem & { price1?: number; price2?: number };
    if (typeof cur.price1 === 'number' && Number.isFinite(cur.price1)) return item;

    const field = CLOSE_ID_TO_ANALYSIS_LEVEL[id];
    if (field) {
      const p = analysis[field];
      if (p != null && typeof p === 'number' && Number.isFinite(p)) {
        return { ...item, price1: p, price2: p };
      }
    }
    if (id === 'key-mustHold-close' && analysis.mustHoldCloseLevel != null) {
      const p = analysis.mustHoldCloseLevel;
      return { ...item, price1: p, price2: p };
    }
    if (id === 'key-mustReclaim-close' && analysis.mustReclaimCloseLevel != null) {
      const p = analysis.mustReclaimCloseLevel;
      return { ...item, price1: p, price2: p };
    }
    return item;
  });
}
