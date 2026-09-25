import type { Candle, OverlayItem } from '@/types';
import type { PatternVisionResult } from '@/types/patternVision';
import { OVERLAY_COLORS } from '@/lib/overlayColors';

function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

function mapRoleToKind(role: string): OverlayItem['kind'] {
  if (role === 'resistance') return 'resistanceLine';
  if (role === 'support') return 'supportLine';
  if (role === 'entry') return 'entry';
  if (role === 'target') return 'target';
  if (role === 'stop') return 'stop';
  return 'trendLine';
}

function gradeFromConfidence(confidence: number): 'A' | 'B' | 'C' {
  if (confidence >= 80) return 'A';
  if (confidence >= 65) return 'B';
  return 'C';
}

/**
 * Pattern vision 결과를 차트용 OverlayItem[]으로 변환.
 * LuxAlgo 스타일: Neck, Entry/TP/SL 라인·라벨 표시.
 * `visible`을 넘기면 time1/time2·price1/price2를 채워 mapOverlays가 나중 min/max와 어긋나며 가격이 날아가는 현상을 막음.
 */
export function visionResultsToOverlays(
  results: PatternVisionResult[],
  visibleLen: number,
  baseIdx: number,
  min: number,
  max: number,
  visible?: Candle[]
): OverlayItem[] {
  if (visibleLen < 2 || !results.length) return [];
  const normX = (index: number) => {
    const inVisible = index - baseIdx;
    return Math.max(0, Math.min(1, inVisible / (visibleLen - 1)));
  };
  /** 패턴 인덱스 → 해당 봉 시각(UTC 초) — 차트 오버레이와 동일 시계열 고정 */
  const timeAtBarIndex = (idx: number): number | undefined => {
    if (!visible?.length) return undefined;
    const i = Math.max(0, Math.min(visible.length - 1, idx));
    const t = visible[i]?.time;
    return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
  };
  const items: OverlayItem[] = [];
  for (const p of results) {
    for (const l of p.lines) {
      // 평행채널은 analyze 단일 채널로만 표시 — 패턴 resistance/support 중복선 제거
      if (l.role === 'resistance' || l.role === 'support') continue;
      // 대각 추세선은 LuxAlgo 피벗 추세선으로 대체 — Entry/TP/SL만 유지
      if (l.role !== 'entry' && l.role !== 'target' && l.role !== 'stop') continue;
      const kind = mapRoleToKind(l.role);
      const color =
        l.role === 'entry'
          ? OVERLAY_COLORS.entry
          : l.role === 'target'
            ? OVERLAY_COLORS.target
            : l.role === 'stop'
              ? OVERLAY_COLORS.stop
              : p.bias === 'bullish'
                ? OVERLAY_COLORS.patternVisionLineBullish
                : p.bias === 'bearish'
                  ? OVERLAY_COLORS.patternVisionLineBearish
                  : OVERLAY_COLORS.patternVisionLineNeutral;
      const label =
        l.role === 'entry' ? 'Entry' : l.role === 'target' ? 'TP' : l.role === 'stop' ? 'SL' : '';
      items.push({
        id: `${p.id}-${l.role}-${l.startIndex}`,
        kind,
        label,
        x1: normX(l.startIndex),
        y1: toRatio(l.startPrice, min, max),
        x2: normX(l.endIndex),
        y2: toRatio(l.endPrice, min, max),
        time1: timeAtBarIndex(l.startIndex),
        time2: timeAtBarIndex(l.endIndex),
        price1: l.startPrice,
        price2: l.endPrice,
        confidence: p.confidence,
        color,
        category: 'patternVision',
      } as OverlayItem);
    }
    for (const t of p.targets ?? []) {
      const kind = t.type === 'entry' ? 'entry' : t.type === 'tp' ? 'target' : 'stop';
      const color = kind === 'entry' ? OVERLAY_COLORS.entry : kind === 'target' ? OVERLAY_COLORS.target : OVERLAY_COLORS.stop;
      const startX = t.startIndex != null ? normX(t.startIndex) : normX(p.endIndex);
      const priceStr = t.price >= 1000 ? t.price.toFixed(2) : t.price >= 1 ? t.price.toFixed(4) : t.price.toFixed(6);
      const labelText = kind === 'entry' ? `Entry ${priceStr}` : kind === 'target' ? `TP ${priceStr}` : `SL ${priceStr}`;
      const tIdx = t.startIndex != null ? t.startIndex : p.endIndex;
      items.push({
        id: `${p.id}-${t.type}-${t.price}`,
        kind,
        label: labelText,
        x1: startX,
        y1: toRatio(t.price, min, max),
        x2: 1,
        y2: toRatio(t.price, min, max),
        time1: timeAtBarIndex(tIdx),
        time2: timeAtBarIndex(p.endIndex),
        price1: t.price,
        price2: t.price,
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
        time1: timeAtBarIndex(z.leftIndex),
        time2: timeAtBarIndex(z.rightIndex),
        price1: Math.max(z.top, z.bottom),
        price2: Math.min(z.top, z.bottom),
        confidence: p.confidence,
        color: p.bias === 'bullish' ? OVERLAY_COLORS.patternVisionZoneBullish : p.bias === 'bearish' ? OVERLAY_COLORS.patternVisionZoneBearish : OVERLAY_COLORS.patternVisionZoneNeutral,
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
      label: `${p.label} ${p.confidence}% · ${gradeFromConfidence(p.confidence)}`,
      x1: labelX,
      y1: toRatio(midPrice, min, max),
      time1: timeAtBarIndex(p.endIndex),
      price1: midPrice,
      confidence: p.confidence,
      color: p.bias === 'bullish' ? OVERLAY_COLORS.patternVisionLineBullish : p.bias === 'bearish' ? OVERLAY_COLORS.patternVisionLineBearish : OVERLAY_COLORS.patternVisionLineNeutral,
      category: 'patternVision',
    } as OverlayItem);
  }
  return items;
}
