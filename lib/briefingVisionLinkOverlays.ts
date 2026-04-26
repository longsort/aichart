import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { PatternLine, PatternVisionResult } from '@/types/patternVision';
import { OVERLAY_COLORS } from '@/lib/overlayColors';

function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

function mapRoleToKind(role: PatternLine['role']): OverlayItem['kind'] {
  if (role === 'resistance') return 'resistanceLine';
  if (role === 'support') return 'supportLine';
  if (role === 'neckline') return 'trendLine';
  if (role === 'entry') return 'entry';
  if (role === 'target') return 'target';
  if (role === 'stop') return 'stop';
  return 'trendLine';
}

function lineColorForRole(
  role: PatternLine['role'],
  bias: PatternVisionResult['bias']
): string {
  if (role === 'resistance') return OVERLAY_COLORS.patternVisionLineBearish;
  if (role === 'support') return OVERLAY_COLORS.patternVisionLineBullish;
  if (role === 'neckline') return OVERLAY_COLORS.patternVisionLineNeutral;
  if (bias === 'bullish') return OVERLAY_COLORS.patternVisionLineBullish;
  if (bias === 'bearish') return OVERLAY_COLORS.patternVisionLineBearish;
  return OVERLAY_COLORS.patternVisionLineNeutral;
}

function gradeFromConfidence(confidence: number): 'A' | 'B' | 'C' {
  if (confidence >= 80) return 'A';
  if (confidence >= 65) return 'B';
  return 'C';
}

/** 브리핑·학습·참조·요약 문자열과 Vision 패턴 타입의 유사도 점수 */
export function scoreBriefingVisionMatch(bundle: string, p: PatternVisionResult): number {
  const b = bundle.toLowerCase();
  const t = p.type.toLowerCase();
  let s = 0;
  if (b.includes(t)) s += 120;
  const parts = t.split(/\s+/).filter((w) => w.length > 2);
  for (const w of parts) {
    if (b.includes(w)) s += 28;
  }
  if (t.includes('falling wedge')) {
    if (b.includes('falling wedge') || (b.includes('falling') && b.includes('wedge'))) s += 90;
    if (b.includes('폴링') || b.includes('하락') || b.includes('웨지')) s += 45;
  }
  if (t.includes('rising wedge')) {
    if (b.includes('rising wedge') || (b.includes('rising') && b.includes('wedge'))) s += 90;
    if (b.includes('상승') || b.includes('리징')) s += 40;
  }
  if (t.includes('bull flag')) {
    if (b.includes('bull flag') || (b.includes('bull') && b.includes('flag'))) s += 90;
  }
  if (t.includes('bear flag')) {
    if (b.includes('bear flag') || (b.includes('bear') && b.includes('flag'))) s += 90;
  }
  if (t.includes('symmetrical triangle') || t.includes('ascending triangle') || t.includes('descending triangle')) {
    if (b.includes('triangle') || b.includes('삼각')) s += 70;
  }
  if (t.includes('double top') || t.includes('double bottom')) {
    if (b.includes('double') || b.includes('더블')) s += 70;
  }
  if (t.includes('head and shoulders') || t.includes('inverse head')) {
    if (b.includes('head') || b.includes('어깨')) s += 70;
  }
  s += Math.min(25, p.confidence * 0.22);
  return s;
}

/**
 * `dominantPattern` / 학습 / 참조 / recallSummary 와 타입이 맞는 Vision 결과 1개 선택.
 */
export function pickVisionPatternLinkedToBriefing(analysis: AnalyzeResponse | null): PatternVisionResult | null {
  const raw = analysis?.detectedVisionPatterns;
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;

  const learned = analysis.learnedPatternsTop5?.[0];
  const dom = analysis.dominantPattern;
  const ref = analysis.topReferences?.[0];
  const recall = analysis.recallSummary || '';

  const bundle = [
    learned?.title,
    learned?.reason,
    learned?.patternType,
    dom?.label,
    dom?.type,
    ref?.title,
    ref?.reason,
    recall,
  ]
    .filter(Boolean)
    .join(' ');

  const patterns = raw as PatternVisionResult[];
  const scored: { p: PatternVisionResult; score: number }[] = [];

  for (const p of patterns) {
    let sc = scoreBriefingVisionMatch(bundle, p);
    if (dom?.type && p.type === dom.type) sc += 60;
    if (dom?.label && String(dom.label).toLowerCase().includes(p.type.toLowerCase())) sc += 45;
    if (sc >= 38) scored.push({ p, score: sc });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].p;
}

/** patternLabeler와 동일 좌표계 + 저항·지지·넥라인 포함 — 브리핑과 같은 Vision `id`로 연결 */
export function buildBriefingVisionGeometryOverlays(p: PatternVisionResult, candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 2) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

  const visibleLen = n;
  const baseIdx = 0;
  const normX = (index: number) => {
    const inVisible = index - baseIdx;
    return Math.max(0, Math.min(1, inVisible / Math.max(1, visibleLen - 1)));
  };
  const timeAtBarIndex = (idx: number): number | undefined => {
    const i = Math.max(0, Math.min(candles.length - 1, idx));
    const t = candles[i]?.time;
    return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
  };

  const prefix = `briefing-vision-link-${p.id}`;
  const tip = `브리핑·학습 문구와 Vision 패턴 동일 ID 연동 · ${p.type} · ${p.id}`;
  const items: OverlayItem[] = [];

  for (const l of p.lines) {
    const kind = mapRoleToKind(l.role);
    const color = lineColorForRole(l.role, p.bias);
    const label =
      l.role === 'resistance'
        ? '저항(브리핑연동)'
        : l.role === 'support'
          ? '지지(브리핑연동)'
          : l.role === 'neckline'
            ? '넥라인(브리핑연동)'
            : l.role === 'entry'
              ? 'Entry'
              : l.role === 'target'
                ? 'TP'
                : l.role === 'stop'
                  ? 'SL'
                  : l.role;
    items.push({
      id: `${prefix}-line-${l.role}-${l.startIndex}`,
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
      lineStrokeWidth: l.role === 'resistance' || l.role === 'support' || l.role === 'neckline' ? 2.1 : undefined,
      lineDash: l.role === 'neckline' ? '5 4' : undefined,
      labelTooltip: tip,
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
      id: `${prefix}-tgt-${t.type}-${Math.round(t.price * 1e6)}`,
      kind,
      label: `${labelText} · 브리핑연동`,
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
      labelTooltip: tip,
    } as OverlayItem);
  }

  for (const z of p.zones) {
    items.push({
      id: `${prefix}-zone-${z.leftIndex}`,
      kind: 'zone',
      label: '패턴 존(브리핑연동)',
      x1: normX(z.leftIndex),
      y1: toRatio(z.top, min, max),
      x2: normX(z.rightIndex),
      y2: toRatio(z.bottom, min, max),
      time1: timeAtBarIndex(z.leftIndex),
      time2: timeAtBarIndex(z.rightIndex),
      price1: Math.max(z.top, z.bottom),
      price2: Math.min(z.top, z.bottom),
      confidence: p.confidence,
      color:
        p.bias === 'bullish'
          ? OVERLAY_COLORS.patternVisionZoneBullish
          : p.bias === 'bearish'
            ? OVERLAY_COLORS.patternVisionZoneBearish
            : OVERLAY_COLORS.patternVisionZoneNeutral,
      category: 'patternVision',
      labelTooltip: tip,
      zonePulse: true,
    } as OverlayItem);
  }

  const midPrice = p.pivotPoints.length
    ? p.pivotPoints.reduce((s, q) => s + q.price, 0) / p.pivotPoints.length
    : (min + max) / 2;
  const labelX = Math.min(0.92, normX(p.endIndex) + 0.02);
  items.push({
    id: `${prefix}-caption`,
    kind: 'label',
    label: `${p.label} ${p.confidence}% · ${gradeFromConfidence(p.confidence)} · 브리핑연동`,
    x1: labelX,
    y1: toRatio(midPrice, min, max),
    time1: timeAtBarIndex(p.endIndex),
    price1: midPrice,
    confidence: p.confidence,
    color: p.bias === 'bullish' ? OVERLAY_COLORS.patternVisionLineBullish : p.bias === 'bearish' ? OVERLAY_COLORS.patternVisionLineBearish : OVERLAY_COLORS.patternVisionLineNeutral,
    category: 'patternVision',
    labelTooltip: tip,
    labelBackgroundColor: 'rgba(2,6,23,0.88)',
    labelTextColor: '#e2e8f0',
  } as OverlayItem);

  return items;
}
