/**
 * assets 353 참조 → 라이브 캔들 좌표 OverlayItem 작도 + 구조 매칭.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { StructureFeatures } from '@/types/reference';
import {
  getChartableAssetsEntries,
  type AssetsDrawElement,
  type AssetsDrawTemplate,
  type AssetsImageCatalogEntry,
} from '@/lib/assetsImageCatalog';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';

export type AssetsChartAiMatch = {
  id: string;
  titleKo: string;
  score: number;
  reasonKo: string;
  category: string;
  tags: string[];
};

export type AssetsChartAiBrief = {
  match: AssetsChartAiMatch;
  summaryKo: string;
  drawCount: number;
};

function similarity(
  live: StructureFeatures & { pattern?: string },
  ref: StructureFeatures
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const w = 1 / 8;

  if (ref.bos !== undefined && !!live.bos === ref.bos) {
    score += w;
    reasons.push('BOS');
  }
  if (ref.choch !== undefined && !!live.choch === ref.choch) {
    score += w;
    reasons.push('CHOCH');
  }
  if (ref.fvg !== undefined && (live.fvg ?? 0) >= (ref.fvg ?? 0)) {
    score += w;
    reasons.push('FVG');
  }
  if (ref.ob !== undefined && (live.ob ?? 0) >= (ref.ob ?? 0)) {
    score += w;
    reasons.push('OB');
  }
  if (ref.sweep !== undefined && !!live.sweep === ref.sweep) {
    score += w;
    reasons.push('스윕');
  }
  if (ref.eqh !== undefined && !!live.eqh === ref.eqh) score += w * 0.5;
  if (ref.eql !== undefined && !!live.eql === ref.eql) score += w * 0.5;

  const lp = String(live.pattern || '');
  const rp = String(ref.pattern || '');
  if (rp && lp) {
    if (lp === rp || lp.includes(rp) || rp.includes(lp)) {
      score += w * 1.2;
      reasons.push('패턴');
    }
  } else if (rp && !lp) {
    score += w * 0.15;
  }

  if (ref.bias && live.bias && live.bias === ref.bias) {
    score += w;
    reasons.push('방향');
  }

  return { score: Math.min(1, score + 0.05), reasons };
}

export function buildLiveStructureFeatures(params: {
  analysis?: AnalyzeResponse | null;
  smcLeading?: MergedSmcLeadingContext | null;
  dominantPatternType?: string | null;
  dominantPatternBias?: string | null;
}): StructureFeatures & { pattern?: string } {
  const marks = params.smcLeading?.marks ?? [];
  const bos = marks.some((m) => m.tag === 'BOS');
  const choch = marks.some((m) => m.tag === 'CHOCH');
  const obs = params.smcLeading?.obs?.length ?? 0;

  let pattern = '';
  const dt = String(params.dominantPatternType || '').toLowerCase();
  if (dt.includes('double top')) pattern = 'double_top';
  else if (dt.includes('double bottom')) pattern = 'double_bottom';
  else if (dt.includes('head and shoulders') && !dt.includes('inverse')) pattern = 'head_shoulders';
  else if (dt.includes('inverse')) pattern = 'inverse_hs';
  else if (dt.includes('bull flag')) pattern = 'bull_flag';
  else if (dt.includes('bear flag')) pattern = 'bear_flag';
  else if (dt.includes('wedge')) pattern = dt.includes('rising') ? 'rising_wedge' : 'falling_wedge';
  else if (dt.includes('triangle')) pattern = 'triangle';
  else if (dt.includes('flag')) pattern = 'flag';

  let bias: StructureFeatures['bias'] = 'neutral';
  const v = params.analysis?.verdict;
  if (v === 'LONG') bias = 'bullish';
  else if (v === 'SHORT') bias = 'bearish';
  else if (params.dominantPatternBias === 'bullish') bias = 'bullish';
  else if (params.dominantPatternBias === 'bearish') bias = 'bearish';

  const fvg = (params.analysis?.volumeWhaleZoneConfluence ? 1 : 0) + (bos || choch ? 1 : 0);

  const recentHighs = marks.filter((m) => m.bias === 'bearish').slice(-3);
  const recentLows = marks.filter((m) => m.bias === 'bullish').slice(-3);
  const eqh = recentHighs.length >= 2;
  const eql = recentLows.length >= 2;

  return {
    bos,
    choch,
    fvg: Math.min(3, fvg + (bos || choch ? 1 : 0)),
    ob: Math.min(3, obs),
    sweep: marks.some((m) => String(m.tag).toLowerCase().includes('sweep')),
    eqh,
    eql,
    pattern,
    bias,
  };
}

export function matchAssetsImagesToLive(
  live: StructureFeatures & { pattern?: string },
  limit = 5,
  minScore = 0.28
): AssetsChartAiMatch[] {
  return getChartableAssetsEntries()
    .map((entry) => {
      const { score, reasons } = similarity(live, entry.structureFeatures);
      return {
        id: entry.id,
        titleKo: entry.titleKo,
        score,
        reasonKo: reasons.length ? `참조 ${reasons.join('·')} 유사` : '구조 일부 유사',
        category: entry.category,
        tags: entry.tags,
      };
    })
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function priceFromPct(pct: number, visLo: number, visHi: number): number {
  const range = Math.max(visHi - visLo, visLo * 1e-6);
  return visHi - range * pct;
}

function timeFromPct(pct: number, candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return Number(candles[0]?.time ?? 0);
  const idx = Math.max(0, Math.min(n - 1, Math.floor((n - 1) * pct)));
  return Number(candles[idx]!.time);
}

function scaleAbsolutePrice(price: number, templatePrices: number[], liveClose: number): number {
  if (!templatePrices.length || !(liveClose > 0)) return price;
  const mid =
    templatePrices.reduce((a, b) => a + b, 0) / Math.max(1, templatePrices.length);
  if (!(mid > 0)) return price;
  const ratio = liveClose / mid;
  if (ratio < 0.02 || ratio > 50) return price * ratio;
  return price * ratio;
}

function elementToOverlays(
  el: AssetsDrawElement,
  candles: Candle[],
  visLo: number,
  visHi: number,
  entry: AssetsImageCatalogEntry,
  idx: number,
  priceScale: (p: number) => number
): OverlayItem[] {
  const tEnd = Number(candles[candles.length - 1]!.time);
  const out: OverlayItem[] = [];
  const prefix = `merged-desk-assets-ai-${entry.id}`;

  if (el.type === 'zone') {
    const t1 = snapMergedOverlayTimeToCandles(timeFromPct(el.timePctStart, candles), candles);
    const top = priceFromPct(Math.min(el.pricePctTop, el.pricePctBot), visLo, visHi);
    const bot = priceFromPct(Math.max(el.pricePctTop, el.pricePctBot), visLo, visHi);
    const bull = el.role === 'demand' || el.role === 'flag';
    out.push({
      id: `${prefix}-zone-${idx}`,
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: tEnd,
      price1: top,
      price2: bot,
      confidence: 0.72,
      color: bull ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)',
      category: 'assetsChartAi',
      overlayZoneExtraClass: `merged-desk-assets-ai-zone merged-desk-assets-ai-${el.role}`,
      zoneFillPreserve: true,
    });
    return out;
  }

  if (el.type === 'hline') {
    const raw =
      el.price != null
        ? priceScale(el.price)
        : el.pricePct != null
          ? priceFromPct(el.pricePct, visLo, visHi)
          : null;
    if (raw == null || !Number.isFinite(raw)) return out;
    const t1 = snapMergedOverlayTimeToCandles(
      timeFromPct(0.35, candles),
      candles
    );
    const kind =
      el.role === 'entry'
        ? 'entry'
        : el.role === 'stop'
          ? 'stop'
          : el.role === 'target'
            ? 'target'
            : 'keyLevel';
    out.push({
      id: `${prefix}-hline-${idx}`,
      kind,
      label: el.label || el.role.toUpperCase(),
      x1: 0,
      y1: 0,
      time1: t1,
      time2: tEnd,
      price1: raw,
      price2: raw,
      confidence: 0.7,
      lineDash: el.role === 'neckline' ? '5 4' : undefined,
      category: 'assetsChartAi',
      overlayZoneExtraClass: `merged-desk-assets-ai-hline merged-desk-assets-ai-${el.role}`,
    });
    return out;
  }

  if (el.type === 'trend') {
    const t1 = snapMergedOverlayTimeToCandles(timeFromPct(el.timePctStart, candles), candles);
    const t2 = tEnd;
    const p1 = priceFromPct(el.pricePctStart, visLo, visHi);
    const p2 = priceFromPct(el.pricePctEnd, visLo, visHi);
    out.push({
      id: `${prefix}-trend-${idx}`,
      kind: 'trendLine',
      label: el.label || el.role,
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: p1,
      price2: p2,
      confidence: 0.68,
      category: 'assetsChartAi',
      overlayZoneExtraClass: 'merged-desk-assets-ai-trend merged-desk-candle-trend',
    });
  }

  return out;
}

export function applyAssetsDrawTemplate(
  entry: AssetsImageCatalogEntry,
  candles: Candle[],
  opts?: { skipTradeLevels?: boolean }
): OverlayItem[] {
  const template = entry.drawTemplate;
  if (!template?.elements?.length || candles.length < 12) return [];

  const visLo = Math.min(...candles.map((c) => c.low));
  const visHi = Math.max(...candles.map((c) => c.high));
  const liveClose = candles[candles.length - 1]!.close;

  const absPrices: number[] = [];
  for (const el of template.elements) {
    if (el.type === 'hline' && el.price != null) absPrices.push(el.price);
  }
  const priceScale = (p: number) =>
    template.mode === 'absolute_prices'
      ? scaleAbsolutePrice(p, absPrices, liveClose)
      : p;

  const overlays: OverlayItem[] = [];
  template.elements.forEach((el, i) => {
    if (
      opts?.skipTradeLevels &&
      el.type === 'hline' &&
      (el.role === 'entry' || el.role === 'stop' || el.role === 'target')
    ) {
      return;
    }
    overlays.push(...elementToOverlays(el, candles, visLo, visHi, entry, i, priceScale));
  });

  const labelPrice = (visLo + visHi) / 2;
  overlays.push({
    id: `merged-desk-assets-ai-${entry.id}-ref-label`,
    kind: 'label',
    label: `REF ${entry.id.replace('img', '')}`,
    x1: 0,
    y1: 0,
    time1: snapMergedOverlayTimeToCandles(Number(candles[candles.length - 1]!.time), candles),
    price1: labelPrice,
    confidence: 0.65,
    category: 'assetsChartAi',
    overlayZoneExtraClass: 'merged-desk-assets-ai-ref-label',
    labelBackgroundColor: 'rgba(15,23,42,0.92)',
    labelTextColor: '#a78bfa',
  });

  return overlays.slice(0, 8);
}

export function buildAssetsChartAiPack(params: {
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  smcLeading?: MergedSmcLeadingContext | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  enabled?: boolean;
  minMatchScore?: number;
}): { overlays: OverlayItem[]; brief: AssetsChartAiBrief | null; matches: AssetsChartAiMatch[] } {
  if (params.enabled === false || params.candles.length < 20) {
    return { overlays: [], brief: null, matches: [] };
  }

  const live = buildLiveStructureFeatures({
    analysis: params.analysis,
    smcLeading: params.smcLeading,
    dominantPatternType: params.analysis?.dominantPattern?.type ?? null,
    dominantPatternBias: params.analysis?.dominantPattern?.bias ?? null,
  });

  const matches = matchAssetsImagesToLive(live, 5, params.minMatchScore ?? 0.32);
  const top = matches[0];
  if (!top) return { overlays: [], brief: null, matches: [] };

  const entry = getChartableAssetsEntries().find((e) => e.id === top.id);
  if (!entry) return { overlays: [], brief: null, matches };

  const hasPlan =
    (params.tradePlan?.entry ?? 0) > 0 && params.tradePlan?.direction !== 'NEUTRAL';

  const overlays = applyAssetsDrawTemplate(entry, params.candles, {
    skipTradeLevels: hasPlan,
  });

  const brief: AssetsChartAiBrief = {
    match: top,
    summaryKo: `참조 ${top.titleKo} (${top.id}) · ${top.reasonKo} — 조건부 참고`,
    drawCount: overlays.length,
  };

  return { overlays, brief, matches };
}
