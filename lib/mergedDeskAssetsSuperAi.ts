/**
 * 통합·분석 Super AI — assets 353 지식 → 라이브 캔들 작도 + LONG/SHORT.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { AssetsChartAiMatch } from '@/lib/assetsChartAiDraw';
import type { SmcZoneBattleVerdict } from '@/lib/assets353SmcZoneConflictIntel';
import {
  runAssets353CandleKnowledgeEngine,
  type Assets353Direction,
  type Assets353Verdict,
} from '@/lib/assets353CandleKnowledgeEngine';

export type MergedDeskAssetsSuperAiBrief = {
  titleKo: string;
  summaryKo: string;
  catalogTotal: number;
  catalogChartable: number;
  matchedAllCount: number;
  confidencePct: number;
  liveBiasKo: string;
  topRefs: AssetsChartAiMatch[];
  adaptiveLines: string[];
  drawCount: number;
  fusedZoneCount: number;
  /** 롱/숏 판정 — assets 353 + 라이브 캔들 */
  direction: Assets353Direction;
  longPct: number;
  shortPct: number;
  edgePct: number;
  headlineKo: string;
  actionKo: string;
  invalidationKo: string;
  reasonsKo: string[];
  verdict: Assets353Verdict;
};

export type MergedDeskAssetsSuperAiPack = {
  overlays: OverlayItem[];
  brief: MergedDeskAssetsSuperAiBrief | null;
  matches: AssetsChartAiMatch[];
  allMatches: AssetsChartAiMatch[];
  zoneBattles: SmcZoneBattleVerdict[];
};

function verdictToTopRefs(verdict: Assets353Verdict): AssetsChartAiMatch[] {
  return verdict.topKnowledgeKo.slice(0, 5).map((titleKo, i) => ({
    id: `knowledge-${i}`,
    titleKo,
    score: verdict.confidencePct / 100,
    reasonKo: verdict.reasonsKo[0] ?? '353 지식',
    category: 'knowledge',
    tags: ['353'],
  }));
}

export function buildMergedDeskAssetsSuperAiPack(params: {
  candles: Candle[];
  timeframe?: string;
  analysis?: AnalyzeResponse | null;
  smcLeading?: MergedSmcLeadingContext | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  enabled?: boolean;
}): MergedDeskAssetsSuperAiPack {
  const empty: MergedDeskAssetsSuperAiPack = {
    overlays: [],
    brief: null,
    matches: [],
    allMatches: [],
    zoneBattles: [],
  };

  if (params.enabled === false || params.candles.length < 24) return empty;

  const pack = runAssets353CandleKnowledgeEngine({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
    smcLeading: params.smcLeading,
    tradePlan: params.tradePlan,
  });

  const v = pack.verdict;
  if (pack.overlayCount === 0) return empty;

  const liveBiasKo =
    v.direction === 'LONG' ? '롱' : v.direction === 'SHORT' ? '숏' : '관망';

  const topRefs = verdictToTopRefs(v);
  const adaptiveLines = [
    ...v.reasonsKo.slice(0, 3),
    v.actionKo,
  ];

  const brief: MergedDeskAssetsSuperAiBrief = {
    titleKo: '353 Chart AI · 롱숏 분석',
    summaryKo: v.headlineKo,
    catalogTotal: v.catalogTotal,
    catalogChartable: 324,
    matchedAllCount: v.matchedCount,
    confidencePct: v.confidencePct,
    liveBiasKo,
    topRefs,
    adaptiveLines,
    drawCount: pack.overlayCount,
    fusedZoneCount: pack.overlays.filter((o) => o.kind === 'zone').length,
    direction: v.direction,
    longPct: v.longPct,
    shortPct: v.shortPct,
    edgePct: v.edgePct,
    headlineKo: v.headlineKo,
    actionKo: v.actionKo,
    invalidationKo: v.invalidationKo,
    reasonsKo: v.reasonsKo,
    verdict: v,
  };

  return {
    overlays: pack.overlays,
    brief,
    matches: topRefs,
    allMatches: topRefs,
    zoneBattles: pack.zoneBattles ?? [],
  };
}

export function superAiZoneHintKo(
  brief: MergedDeskAssetsSuperAiBrief | null,
  overlays?: OverlayItem[]
): string | null {
  if (!brief) return null;
  const dir =
    brief.direction === 'LONG'
      ? '롱(상승)'
      : brief.direction === 'SHORT'
        ? '숏(하락)'
        : '관망';
  const battle = overlays?.length ? superAiZoneBattleFromOverlays(overlays) : null;
  const pct =
    brief.direction === 'LONG'
      ? brief.longPct
      : brief.direction === 'SHORT'
        ? brief.shortPct
        : Math.max(brief.longPct, brief.shortPct);
  if (battle) return `${battle} · 353 ${dir} ${pct}%`;
  return `353 AI · ${dir} ${pct}% — ${brief.verdict.topMatches[0]?.scenarioKo ?? ''}`;
}

export function superAiZoneBattleFromOverlays(overlays: OverlayItem[]): string | null {
  const battle = overlays.find((o) => String(o.id || '').includes('merged-ares-mlsp-tv-conflict-'));
  if (!battle) return null;
  const tip = String(battle.labelTooltip || battle.zoneFaceDetailKo || '').trim();
  const head = String(battle.label || battle.zoneFaceBase || '').trim();
  return tip || head || null;
}
