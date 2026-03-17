import type { OverlayItem } from '@/types';
import type { PatternVisionResult } from '@/types/patternVision';

function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

/**
 * Pattern vision 결과를 차트용 OverlayItem[]으로 변환.
 * 캔들 인덱스/가격을 visible 기준 정규화 (x: 0~1, y: toRatio).
 * 중복/과다 표시 방지 후 1~3개만 반환.
 */
export function visionResultsToOverlays(
  results: PatternVisionResult[],
  visibleLen: number,
  baseIdx: number,
  min: number,
  max: number
): OverlayItem[] {
  if (visibleLen < 2 || !results.length) return [];
  const normX = (index: number) => {
    const inVisible = index - baseIdx;
    return Math.max(0, Math.min(1, inVisible / (visibleLen - 1)));
  };
  const items: OverlayItem[] = [];
  for (const p of results) {
    for (const l of p.lines) {
      const kind = l.role === 'resistance' ? 'resistanceLine' : l.role === 'support' ? 'supportLine' : 'trendLine';
      const color = p.bias === 'bullish' ? '#71f7bd' : p.bias === 'bearish' ? '#ff9b9b' : '#ffd666';
      items.push({
        id: `${p.id}-${l.role}-${l.startIndex}`,
        kind,
        label: '',
        x1: normX(l.startIndex),
        y1: toRatio(l.startPrice, min, max),
        x2: normX(l.endIndex),
        y2: toRatio(l.endPrice, min, max),
        confidence: p.confidence,
        color,
        category: 'patternVision',
      } as OverlayItem);
    }
    for (const z of p.zones) {
      items.push({
        id: `${p.id}-zone-${z.leftIndex}`,
        kind: 'zone',
        label: '',
        x1: normX(z.leftIndex),
        y1: toRatio(z.top, min, max),
        x2: normX(z.rightIndex),
        y2: toRatio(z.bottom, min, max),
        confidence: p.confidence,
        color: p.bias === 'bullish' ? 'rgba(113,247,189,0.12)' : p.bias === 'bearish' ? 'rgba(255,155,155,0.12)' : 'rgba(255,214,102,0.12)',
        category: 'patternVision',
      } as OverlayItem);
    }
    const labelX = Math.min(0.92, normX(p.endIndex) + 0.02);
    const midPrice = p.pivotPoints.length
      ? p.pivotPoints.reduce((s, q) => s + q.price, 0) / p.pivotPoints.length
      : (min + max) / 2;
    items.push({
      id: `${p.id}-label`,
      kind: 'label',
      label: `${p.label} ${p.confidence}%`,
      x1: labelX,
      y1: toRatio(midPrice, min, max),
      confidence: p.confidence,
      color: p.bias === 'bullish' ? '#71f7bd' : p.bias === 'bearish' ? '#ff9b9b' : '#ffd666',
      category: 'patternVision',
    } as OverlayItem);
  }
  return items;
}
