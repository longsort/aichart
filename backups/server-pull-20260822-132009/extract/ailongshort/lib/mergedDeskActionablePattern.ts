/**
 * 통합·분석 — 실전용 캔들 패턴 1개만 (깔끔·방향정렬·데스크 플랜과 중복 최소).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { PatternVisionResult } from '@/types/patternVision';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import { getDominantPattern, runPatternVision } from '@/lib/patternVision/patternVisionEngine';
import { visionResultsToOverlays } from '@/lib/patternVision/patternLabeler';
import { OVERLAY_COLORS } from '@/lib/overlayColors';

const MIN_CONF = 72;
const MIN_CONF_NEUTRAL = 78;

export type MergedDeskActionablePatternBrief = {
  labelKo: string;
  labelShort: string;
  confidence: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  aligned: boolean;
  rr: number | null;
  necklinePrice: number | null;
  summaryKo: string;
};

const TYPE_KO: Record<string, string> = {
  'Double Top': '이중 천장',
  'Double Bottom': '이중 바닥',
  'Triple Top': '삼중 천장',
  'Triple Bottom': '삼중 바닥',
  'Head and Shoulders': '헤드앤숄더',
  'Inverse Head and Shoulders': '역헤드앤숄더',
  'Bull Flag': '상승 깃발',
  'Bear Flag': '하락 깃발',
  'Rising Wedge': '상승 쐐기',
  'Falling Wedge': '하락 쐐기',
  'Ascending Triangle': '상승 삼각',
  'Descending Triangle': '하락 삼각',
  'Symmetrical Triangle': '대칭 삼각',
};

const TYPE_SHORT: Record<string, string> = {
  'Double Top': 'DT',
  'Double Bottom': 'DB',
  'Triple Top': 'TT',
  'Triple Bottom': 'TB',
  'Head and Shoulders': 'H&S',
  'Inverse Head and Shoulders': 'iH&S',
  'Bull Flag': 'BF',
  'Bear Flag': 'BeF',
  'Rising Wedge': 'RW',
  'Falling Wedge': 'FW',
  'Ascending Triangle': 'AT',
  'Descending Triangle': 'DTri',
  'Symmetrical Triangle': 'STri',
};

function patternLabelKo(type: string): string {
  return TYPE_KO[type] ?? type;
}

function patternLabelShort(type: string): string {
  return TYPE_SHORT[type] ?? type.slice(0, 6);
}

function biasToDir(bias: string): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (bias === 'bullish') return 'LONG';
  if (bias === 'bearish') return 'SHORT';
  return 'NEUTRAL';
}

function patternAligned(
  pattern: PatternVisionResult,
  planDir: 'LONG' | 'SHORT' | 'NEUTRAL'
): boolean {
  const pDir = biasToDir(pattern.bias);
  if (planDir === 'NEUTRAL') return pattern.confidence >= MIN_CONF_NEUTRAL;
  return pDir === planDir;
}

function pickPattern(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): PatternVisionResult | null {
  const cached = analysis?.detectedVisionPatterns as PatternVisionResult[] | undefined;
  const results = cached?.length ? cached : candles.length >= 40 ? runPatternVision(candles) : [];
  if (!results.length) return null;
  const dom = getDominantPattern(results);
  if (!dom || dom.confidence < MIN_CONF) return null;
  return dom;
}

function computeRr(plan: UnifiedDeskTradePlan | null | undefined): number | null {
  if (!plan || plan.direction === 'NEUTRAL') return null;
  const { entry, stopLoss, tp1 } = plan;
  if (entry == null || stopLoss == null || tp1 == null) return null;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(tp1 - entry);
  if (!(risk > 0)) return null;
  return Math.round((reward / risk) * 10) / 10;
}

function necklineMid(pattern: PatternVisionResult): number | null {
  const neck = pattern.lines.find((l) => l.role === 'neckline');
  if (!neck) return null;
  return (neck.startPrice + neck.endPrice) / 2;
}

function buildNecklineOverlay(pattern: PatternVisionResult, candles: Candle[]): OverlayItem | null {
  const neck = pattern.lines.find((l) => l.role === 'neckline');
  if (!neck || candles.length < 2) return null;
  const idx = (i: number) => Math.max(0, Math.min(candles.length - 1, i));
  const t1 = Number(candles[idx(neck.startIndex)]!.time);
  const t2 = Number(candles[candles.length - 1]!.time);
  const price = (neck.startPrice + neck.endPrice) / 2;
  return {
    id: `merged-desk-pattern-${pattern.id}-neckline`,
    kind: 'resistanceLine',
    label: 'Neck',
    x1: 0,
    y1: 0,
    time1: t1,
    time2: t2,
    price1: price,
    price2: price,
    lineDash: '5 4',
    lineStrokeWidth: 1.5,
    color: OVERLAY_COLORS.patternVisionLineNeutral,
    category: 'patternVision',
    confidence: pattern.confidence,
    overlayZoneExtraClass: 'merged-desk-actionable-pattern merged-desk-pattern-neckline',
  };
}

function buildSummaryKo(
  pattern: PatternVisionResult,
  planDir: 'LONG' | 'SHORT' | 'NEUTRAL',
  plan: UnifiedDeskTradePlan | null | undefined
): string {
  const name = patternLabelKo(pattern.type);
  const dir =
    planDir === 'LONG' ? '롱' : planDir === 'SHORT' ? '숏' : biasToDir(pattern.bias) === 'LONG' ? '롱' : biasToDir(pattern.bias) === 'SHORT' ? '숏' : '관망';
  const rr = computeRr(plan);
  const rrPart = rr != null && rr >= 1.5 ? ` · RR 약 1:${rr}` : rr != null ? ` · RR 1:${rr}(낮음)` : '';
  return `${name} ${pattern.confidence}% · ${dir} 시나리오${rrPart} — 조건부 참고`;
}

export function buildMergedDeskActionablePatternPack(params: {
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  enabled?: boolean;
}): { overlays: OverlayItem[]; brief: MergedDeskActionablePatternBrief | null } {
  if (params.enabled === false) return { overlays: [], brief: null };

  const pattern = pickPattern(params.analysis, params.candles);
  if (!pattern) return { overlays: [], brief: null };

  const planDir = params.tradePlan?.direction ?? 'NEUTRAL';
  if (!patternAligned(pattern, planDir)) return { overlays: [], brief: null };

  const candles = params.candles;
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const hasPlanLevels =
    (params.tradePlan?.entry ?? 0) > 0 && params.tradePlan?.direction !== 'NEUTRAL';

  const raw = visionResultsToOverlays([pattern], candles.length, 0, min, max, candles);
  const overlays: OverlayItem[] = [];

  const neck = buildNecklineOverlay(pattern, candles);
  if (neck) overlays.push(neck);

  for (const o of raw) {
    if (o.kind === 'zone') continue;
    const isLabel = o.kind === 'label';
    const isLevel = o.kind === 'entry' || o.kind === 'target' || o.kind === 'stop';
    if (hasPlanLevels && isLevel) continue;
    if (!isLabel && !isLevel) continue;

    overlays.push({
      ...o,
      id: `merged-desk-pattern-${o.id}`,
      category: 'patternVision',
      overlayZoneExtraClass: [o.overlayZoneExtraClass, 'merged-desk-actionable-pattern']
        .filter(Boolean)
        .join(' '),
      label: isLabel
        ? `${patternLabelShort(pattern.type)} ${pattern.confidence}%`
        : o.label,
    });
  }

  const brief: MergedDeskActionablePatternBrief = {
    labelKo: patternLabelKo(pattern.type),
    labelShort: patternLabelShort(pattern.type),
    confidence: pattern.confidence,
    bias: pattern.bias,
    aligned: true,
    rr: computeRr(params.tradePlan),
    necklinePrice: necklineMid(pattern),
    summaryKo: buildSummaryKo(pattern, planDir, params.tradePlan),
  };

  return { overlays, brief };
}

/** Zone 클릭 카드 — 패턴이 zone 방향과 맞을 때 한 줄 */
export function mergedDeskPatternZoneHint(
  brief: MergedDeskActionablePatternBrief | null,
  zoneRole: 'support' | 'resistance' | 'ob_bull' | 'ob_bear' | 'neutral'
): string | null {
  if (!brief) return null;
  const bullZone = zoneRole === 'support' || zoneRole === 'ob_bull';
  const bearZone = zoneRole === 'resistance' || zoneRole === 'ob_bear';
  if (brief.bias === 'bullish' && bullZone) {
    return `차트 모양(${brief.labelKo})이 이 받침 구간과 맞아 보여요.`;
  }
  if (brief.bias === 'bearish' && bearZone) {
    return `차트 모양(${brief.labelKo})이 이 막힘 구간과 맞아 보여요.`;
  }
  return null;
}
