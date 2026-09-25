/**

 * assets 353 AI — 이미지 추출 없이 353자료 지식 + 라이브 캔들 → 작도 + LONG/SHORT.

 * (조건부 참고 — 확정 수익·투자 권유 아님)

 */

import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';

import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';

import { buildLiveStructureFeatures } from '@/lib/assetsChartAiDraw';

import {

  getAssetsImageCatalog,

  type AssetsImageCatalogEntry,

} from '@/lib/assetsImageCatalog';

import {
  playbookVoteWeights,
  resolvePlaybookForEntry,
  resolvePlaybookForLive,
} from '@/lib/assets353Playbooks';

import { buildAssets353SmcChartOverlays } from '@/lib/assets353SmcChartDraw';



export type Assets353Direction = 'LONG' | 'SHORT' | 'NEUTRAL';



export type Assets353MatchedKnowledge = {

  id: string;

  titleKo: string;

  score: number;

  bias: string;

  playbookId: string;

  playbookLabel: string;

  scenarioKo: string;

};



export type Assets353Verdict = {

  direction: Assets353Direction;

  longPct: number;

  shortPct: number;

  confidencePct: number;

  edgePct: number;

  headlineKo: string;

  actionKo: string;

  invalidationKo: string;

  invalidationPrice: number | null;

  reasonsKo: string[];

  matchedCount: number;

  catalogTotal: number;

  topKnowledgeKo: string[];

  topMatches: Assets353MatchedKnowledge[];

  topPlaybookLabel: string;

};



export type Assets353CandleKnowledgePack = {

  verdict: Assets353Verdict;

  overlays: OverlayItem[];

  overlayCount: number;

  zoneBattles: import('@/lib/assets353SmcZoneConflictIntel').SmcZoneBattleVerdict[];

};



const CATEGORY_WEIGHT: Record<string, number> = {

  smc_candle: 1.35,

  tv_chart: 1.2,

  chinese_chart: 1.15,

  edu_forex: 1.05,

  harmonic: 1.1,

  screenshot: 0.85,

  unknown: 0.7,

  fulink_ui: 0.35,

};



function pivotLows(candles: Candle[], wing = 2): Array<{ idx: number; price: number }> {

  const out: Array<{ idx: number; price: number }> = [];

  for (let i = wing; i < candles.length - wing; i++) {

    let ok = true;

    for (let j = 1; j <= wing; j++) {

      if (candles[i]!.low >= candles[i - j]!.low || candles[i]!.low >= candles[i + j]!.low) {

        ok = false;

        break;

      }

    }

    if (ok) out.push({ idx: i, price: candles[i]!.low });

  }

  return out;

}



function pivotHighs(candles: Candle[], wing = 2): Array<{ idx: number; price: number }> {

  const out: Array<{ idx: number; price: number }> = [];

  for (let i = wing; i < candles.length - wing; i++) {

    let ok = true;

    for (let j = 1; j <= wing; j++) {

      if (candles[i]!.high <= candles[i - j]!.high || candles[i]!.high <= candles[i + j]!.high) {

        ok = false;

        break;

      }

    }

    if (ok) out.push({ idx: i, price: candles[i]!.high });

  }

  return out;

}



function knowledgeSimilarity(

  live: ReturnType<typeof buildLiveStructureFeatures>,

  entry: AssetsImageCatalogEntry

): number {

  const sf = entry.structureFeatures;

  let score = 0;

  const w = 0.1;

  if (sf.bos && live.bos) score += w;

  if (sf.choch && live.choch) score += w;

  if ((sf.fvg ?? 0) > 0 && (live.fvg ?? 0) > 0) score += w;

  if ((sf.ob ?? 0) > 0 && (live.ob ?? 0) > 0) score += w;

  if (sf.sweep && live.sweep) score += w;

  if (sf.eqh && live.eqh) score += w * 0.6;

  if (sf.eql && live.eql) score += w * 0.6;

  const lp = String(live.pattern || '');

  const rp = String(sf.pattern || '');

  if (rp && lp && (lp === rp || lp.includes(rp) || rp.includes(lp))) score += w * 1.6;

  else if (rp && entry.chartable) score += w * 0.2;

  if (sf.bias && live.bias && sf.bias === live.bias) score += w * 1.1;

  if (entry.category === 'smc_candle' && (live.bos || live.choch)) score += 0.06;

  if (entry.category === 'harmonic' && lp.includes('harmonic')) score += 0.08;

  return Math.min(1, score + 0.04);

}



function biasFromPattern(pattern: string): 'bullish' | 'bearish' | 'neutral' {

  const p = pattern.toLowerCase();

  if (/double_top|head_shoulders|rising_wedge|desc_triangle|bear/.test(p)) return 'bearish';

  if (/double_bottom|inverse|falling_wedge|asc_triangle|bull/.test(p)) return 'bullish';

  return 'neutral';

}



function vote353Knowledge(

  live: ReturnType<typeof buildLiveStructureFeatures>,

  analysis?: AnalyzeResponse | null,

  smcLeading?: MergedSmcLeadingContext | null

): {

  longW: number;

  shortW: number;

  matched: Assets353MatchedKnowledge[];

} {

  const cat = getAssetsImageCatalog();

  let longW = 0;

  let shortW = 0;

  const matched: Assets353MatchedKnowledge[] = [];

  const livePlaybook = resolvePlaybookForLive(live);



  for (const entry of cat.entries) {

    if (!entry.chartable && entry.category === 'fulink_ui') continue;

    const sim = knowledgeSimilarity(live, entry);

    if (sim < 0.1) continue;

    const cw = CATEGORY_WEIGHT[entry.category] ?? 0.8;

    const playbook = resolvePlaybookForEntry(entry);

    const sf = entry.structureFeatures;

    let bias = sf.bias ?? 'neutral';

    if (bias === 'neutral' && sf.pattern) {

      const pb = biasFromPattern(String(sf.pattern));

      if (pb !== 'neutral') bias = pb;

    }

    const vote = playbookVoteWeights(playbook, sim * cw, bias, live.bias ?? 'neutral');

    longW += vote.long;

    shortW += vote.short;

    matched.push({

      id: entry.id,

      titleKo: entry.titleKo,

      score: sim,

      bias,

      playbookId: playbook.id,

      playbookLabel: playbook.labelEn,

      scenarioKo: playbook.scenarioKo,

    });

  }



  const liveVote = playbookVoteWeights(livePlaybook, 0.35, live.bias ?? 'neutral', live.bias ?? 'neutral');

  longW += liveVote.long;

  shortW += liveVote.short;



  if (analysis?.verdict === 'LONG') longW += 0.5;

  else if (analysis?.verdict === 'SHORT') shortW += 0.5;



  const ls = analysis?.longScore ?? 0;

  const ss = analysis?.shortScore ?? 0;

  if (ls > ss + 8) longW += 0.3;

  else if (ss > ls + 8) shortW += 0.3;



  const st = analysis?.structureState?.state;

  if (st === 'trend_up') longW += 0.22;

  else if (st === 'trend_down') shortW += 0.22;



  if (smcLeading?.legDirection === 'up') longW += 0.18;

  else if (smcLeading?.legDirection === 'down') shortW += 0.18;



  if (live.bias === 'bullish') longW += 0.15;

  else if (live.bias === 'bearish') shortW += 0.15;



  matched.sort((a, b) => b.score - a.score);

  return { longW, shortW, matched };

}



function resolveVerdict(

  longW: number,

  shortW: number,

  matched: Assets353MatchedKnowledge[],

  candles: Candle[],

  analysis?: AnalyzeResponse | null

): Assets353Verdict {

  const total = longW + shortW + 1e-9;

  const longPct = Math.round((longW / total) * 100);

  const shortPct = Math.round((shortW / total) * 100);

  const edge = Math.abs(longPct - shortPct);

  const cat = getAssetsImageCatalog();

  const top = matched.slice(0, 8);



  let direction: Assets353Direction = 'NEUTRAL';

  if (longPct >= 54 && edge >= 8) direction = 'LONG';

  else if (shortPct >= 54 && edge >= 8) direction = 'SHORT';



  const confidencePct = Math.min(90, Math.max(35, 38 + edge * 0.9 + Math.min(matched.length, 50) * 0.25));



  const topKnowledgeKo = top.slice(0, 5).map((m) => m.titleKo.replace(/ 참조$/, ''));

  const topPlaybookLabel = top[0]?.playbookLabel ?? 'Pat';



  const reasonsKo: string[] = [

    `353자료 ${matched.length}개와 현재 캔들 구조 일치`,

    top[0]

      ? `주요 플레이북 ${top[0].playbookLabel} — ${top[0].scenarioKo}`

      : '플레이북 대조 중',

    direction === 'LONG'

      ? `롱 ${longPct}% · 숏 ${shortPct}%`

      : direction === 'SHORT'

        ? `숏 ${shortPct}% · 롱 ${longPct}%`

        : `롱 ${longPct}% / 숏 ${shortPct}% — 방향 대기`,

  ];



  if (analysis?.settlementZone?.state === 'confirmed') {

    reasonsKo.push(

      analysis.settlementZone.direction === 'LONG' ? '마감·안착 상방 확인' : '마감·안착 하방 확인'

    );

  }



  const last = candles[candles.length - 1]!;

  let invalidationKo = '무효화 — 핵심 구간 이탈 시 시나리오 재검토';

  let invalidationPrice: number | null = null;

  if (direction === 'LONG') {

    const sup = pivotLows(candles.slice(-80), 2).pop()?.price ?? last.low;

    invalidationPrice = sup;

    invalidationKo = `${sup.toFixed(0)} 아래 종가 마감 시 롱 시나리오 약화`;

  } else if (direction === 'SHORT') {

    const res = pivotHighs(candles.slice(-80), 2).pop()?.price ?? last.high;

    invalidationPrice = res;

    invalidationKo = `${res.toFixed(0)} 위 종가 마감 시 숏 시나리오 약화`;

  }



  const headlineKo =

    direction === 'LONG'

      ? `▲ 롱 — 353 AI + 캔들 (${longPct}%)`

      : direction === 'SHORT'

        ? `▼ 숏 — 353 AI + 캔들 (${shortPct}%)`

        : `◆ 관망 — 롱 ${longPct}% / 숏 ${shortPct}%`;



  const actionKo =

    direction === 'LONG'

      ? 'SUP·OB·FVG 반응 + 마감 확인 후 롱 시나리오'

      : direction === 'SHORT'

        ? 'RES·OB·유동성 스윕 후 하락 마감 확인 시 숏'

        : '353 플레이북 zone 반응 관찰 후 방향 확정';



  return {

    direction,

    longPct,

    shortPct,

    confidencePct,

    edgePct: edge,

    headlineKo,

    actionKo,

    invalidationKo,

    invalidationPrice,

    reasonsKo,

    matchedCount: matched.length,

    catalogTotal: cat.total,

    topKnowledgeKo,

    topMatches: top,

    topPlaybookLabel,

  };

}



/** assets 353 AI — 라이브 캔들 작도 + LONG/SHORT */

export function runAssets353CandleKnowledgeEngine(params: {

  candles: Candle[];

  timeframe?: string;

  analysis?: AnalyzeResponse | null;

  smcLeading?: MergedSmcLeadingContext | null;

  tradePlan?: UnifiedDeskTradePlan | null;

}): Assets353CandleKnowledgePack {

  const emptyVerdict: Assets353Verdict = {

    direction: 'NEUTRAL',

    longPct: 50,

    shortPct: 50,

    confidencePct: 0,

    edgePct: 0,

    headlineKo: '◆ 데이터 수집 중',

    actionKo: '캔들·분석 대기',

    invalidationKo: '—',

    invalidationPrice: null,

    reasonsKo: [],

    matchedCount: 0,

    catalogTotal: 353,

    topKnowledgeKo: [],

    topMatches: [],

    topPlaybookLabel: 'Pat',

  };



  if (params.candles.length < 24) {

    return { verdict: emptyVerdict, overlays: [], overlayCount: 0, zoneBattles: [] };

  }



  const live = buildLiveStructureFeatures({

    analysis: params.analysis,

    smcLeading: params.smcLeading,

    dominantPatternType: params.analysis?.dominantPattern?.type ?? null,

    dominantPatternBias: params.analysis?.dominantPattern?.bias ?? null,

  });



  const { longW, shortW, matched } = vote353Knowledge(live, params.analysis, params.smcLeading);

  const verdict = resolveVerdict(longW, shortW, matched, params.candles, params.analysis);



  const { overlays, battles } = buildAssets353SmcChartOverlays({
    candles: params.candles,
    direction: verdict.direction,
    verdict,
    smcLeading: params.smcLeading,
    timeframe: params.timeframe ?? params.analysis?.timeframe,
    currentPrice: params.analysis?.currentPrice ?? null,
  });



  return { verdict, overlays, overlayCount: overlays.length, zoneBattles: battles };

}


