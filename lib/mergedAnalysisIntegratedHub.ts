/**
 * 통합·분석 데스크 — 모든 카드·차트·MTF를 하나의 실시간 스냅샷으로 묶음.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedAnalysisCardPanel, MergedAnalysisDeskHud } from '@/lib/mergedAnalysisDeskEngine';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import {
  buildMergedMtfConsensus,
  type MergedMtfConsensusResult,
  MERGED_MTF_CONSENSUS_TFS,
} from '@/lib/mergedAnalysisMtfConsensus';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import {
  resolveUnifiedDeskTradePlan,
  type UnifiedDeskTradePlan,
} from '@/lib/unifiedDeskTradePlan';
import {
  buildUnifiedChartFeatureContext,
  type MergedDeskChartFeatureInput,
  type UnifiedChartFeatureContext,
} from '@/lib/unifiedChartFeatureContext';

export type MergedIntegratedModuleSnap = {
  key: string;
  labelKo: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  detailKo: string;
  live: boolean;
  aligned: boolean;
};

export type MergedIntegratedHubGauges = {
  longPct: number;
  shortPct: number;
  confidence: number;
  mtfAlignPct: number;
  gatesPct: number;
  strikeScore: number;
  syncPct: number;
  rr: number | null;
  precisionFusion: number;
};

export type MergedIntegratedHubSnapshot = {
  symbol: string;
  chartTf: string;
  currentPrice: number | null;
  candleCount: number;
  lastCandleTime: number | null;
  updatedAt: number;
  isLive: boolean;
  consensus: MergedMtfConsensusResult;
  gauges: MergedIntegratedHubGauges;
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  masterGrade: string;
  modules: MergedIntegratedModuleSnap[];
  headlineKo: string;
  summaryKo: string;
  liveKo: string;
  actionLine: string;
  reasonsKo: string[];
  tradeLevels: {
    entry: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
  };
  unifiedTradePlan: UnifiedDeskTradePlan;
  chartFeatures: UnifiedChartFeatureContext | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normDir(v: string | null | undefined): 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT' {
  const u = String(v ?? '').toUpperCase();
  if (u === 'LONG') return 'LONG';
  if (u === 'SHORT') return 'SHORT';
  if (u === 'WAIT' || u === '') return 'WAIT';
  return 'NEUTRAL';
}

function masterFromVotes(
  votes: Array<{ dir: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT'; weight: number }>
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  let long = 0;
  let short = 0;
  for (const v of votes) {
    if (v.dir === 'WAIT') continue;
    if (v.dir === 'LONG') long += v.weight;
    else if (v.dir === 'SHORT') short += v.weight;
    else {
      long += v.weight * 0.15;
      short += v.weight * 0.15;
    }
  }
  if (long > short + 0.8) return 'LONG';
  if (short > long + 0.8) return 'SHORT';
  return 'NEUTRAL';
}

export function buildMergedIntegratedHubSnapshot(params: {
  symbol: string;
  chartTf: string;
  analysis: AnalyzeResponse | null | undefined;
  candles: Candle[] | null | undefined;
  settleBoard: TfCloseSettleBoard | null | undefined;
  mtfAnalyzes: Array<{ tf: string; analyze: AnalyzeResponse | null }>;
  trade: MergedTradeSignal | null | undefined;
  judgment: MergedTradeJudgment | null | undefined;
  cardPanel: MergedAnalysisCardPanel | null | undefined;
  strikeBundle: MonthDeskStrikeDeskBundle | null | undefined;
  deskHud: MergedAnalysisDeskHud | null | undefined;
  updatedAt?: number;
  deskChart?: MergedDeskChartFeatureInput | null;
}): MergedIntegratedHubSnapshot | null {
  const candles = params.candles ?? [];
  const last = candles.length ? candles[candles.length - 1] : null;
  const consensus = buildMergedMtfConsensus({
    chartTf: params.chartTf,
    analysis: params.analysis ?? null,
    candles: params.candles ?? null,
    settleBoard: params.settleBoard ?? null,
    mtfAnalyzes: params.mtfAnalyzes,
    trade: params.trade ?? null,
    judgment: params.judgment ?? null,
  });

  const chartDir = normDir(params.analysis?.verdict);
  const strikeDir = normDir(params.strikeBundle?.primary);
  const tradeDir = normDir(params.trade?.primary);
  const judgmentDir = normDir(params.judgment?.direction);
  const panelDir = normDir(params.cardPanel?.direction);
  const mtfDir = consensus.finalDirection;

  const masterDirection = masterFromVotes([
    { dir: mtfDir, weight: 3.2 },
    { dir: strikeDir, weight: 2.4 },
    { dir: tradeDir, weight: 2.2 },
    { dir: panelDir, weight: 1.8 },
    { dir: chartDir, weight: 1.6 },
    { dir: judgmentDir, weight: 1.8 },
  ]);

  const chartLong = Number(params.analysis?.longScore ?? 50);
  const chartShort = Number(params.analysis?.shortScore ?? 50);
  const panelLong = params.cardPanel?.longPct ?? chartLong;
  const panelShort = params.cardPanel?.shortPct ?? chartShort;

  const longPct = Math.round(
    (consensus.longPct * 0.38 + panelLong * 0.22 + chartLong * 0.2 + (masterDirection === 'LONG' ? 62 : 38) * 0.2)
  );
  const shortPct = 100 - clamp(longPct, 8, 92);

  const strikeScore = params.strikeBundle?.ai?.confluence ?? Math.max(
    params.strikeBundle?.long?.score ?? 0,
    params.strikeBundle?.short?.score ?? 0
  );

  const mtfAlignPct = Math.round((consensus.alignedTfCount / MERGED_MTF_CONSENSUS_TFS.length) * 100);
  const gatesPct = Math.round((consensus.gatesPassCount / 5) * 100);

  let settleLong = 0;
  let settleShort = 0;
  for (const row of params.settleBoard?.rows ?? []) {
    if (row.confirmedEdge === '롱 유리') settleLong++;
    else if (row.confirmedEdge === '숏 유리') settleShort++;
  }
  const settleDir =
    settleLong > settleShort ? 'LONG' : settleShort > settleLong ? 'SHORT' : 'NEUTRAL';

  const bm = consensus.boardMetrics;
  const precisionFusion = bm
    ? clamp(Math.round((bm.confidence ?? consensus.confidence) * 0.55 + consensus.confidence * 0.45), 0, 100)
    : consensus.confidence;

  const hud = params.deskHud;
  const mirageDash = hud?.mirageDashboard;
  const mirageDir: 'LONG' | 'SHORT' | 'NEUTRAL' =
    mirageDash?.headerTone === 'bull'
      ? 'LONG'
      : mirageDash?.headerTone === 'bear'
        ? 'SHORT'
        : 'NEUTRAL';

  const modules: MergedIntegratedModuleSnap[] = [
    {
      key: 'chart',
      labelKo: '차트 AI',
      direction: chartDir,
      detailKo: params.analysis
        ? `L${Math.round(chartLong)} S${Math.round(chartShort)}`
        : '분석 대기',
      live: !!params.analysis,
      aligned: chartDir === 'WAIT' || chartDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'mtf',
      labelKo: 'MTF 합의',
      direction: mtfDir,
      detailKo: `${consensus.alignedTfCount}/${MERGED_MTF_CONSENSUS_TFS.length} TF`,
      live: consensus.rows.some((r) => r.direction !== 'WAIT'),
      aligned: mtfDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'strike',
      labelKo: 'Strike',
      direction: strikeDir,
      detailKo: params.strikeBundle?.primaryKo?.slice(0, 24) ?? '—',
      live: !!params.strikeBundle,
      aligned: strikeDir === 'WAIT' || strikeDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'trade',
      labelKo: '트레이드',
      direction: tradeDir,
      detailKo: params.trade ? `E ${params.trade.entry.toFixed(1)}` : '—',
      live: !!params.trade,
      aligned: tradeDir === 'WAIT' || tradeDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'judgment',
      labelKo: '매매판단',
      direction: judgmentDir,
      detailKo: params.judgment?.stanceKo?.slice(0, 20) ?? '—',
      live: !!params.judgment,
      aligned: judgmentDir === 'WAIT' || judgmentDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'panel',
      labelKo: '통합패널',
      direction: panelDir,
      detailKo: params.cardPanel ? `conf ${Math.round(params.cardPanel.confidence)}%` : '—',
      live: !!params.cardPanel,
      aligned: panelDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'settle',
      labelKo: '마감·안착',
      direction: settleDir,
      detailKo: params.settleBoard?.rows?.length ? `${settleLong}L/${settleShort}S` : '—',
      live: !!(params.settleBoard?.rows?.length),
      aligned: settleDir === masterDirection || masterDirection === 'NEUTRAL',
    },
    {
      key: 'core',
      labelKo: '핵심보드',
      direction: bm?.verdict ? normDir(bm.verdict) : 'NEUTRAL',
      detailKo: bm?.verdictLabel ?? '—',
      live: !!bm,
      aligned:
        !bm?.verdict ||
        bm.verdict === 'WAIT' ||
        normDir(bm.verdict) === masterDirection ||
        masterDirection === 'NEUTRAL',
    },
  ];

  if (hud?.mirageLspKo || mirageDash) {
    modules.push({
      key: 'mirage',
      labelKo: 'Mirage LSP',
      direction: mirageDir,
      detailKo: hud?.mirageLspKo?.slice(0, 28) ?? mirageDash?.market.signalKo ?? '—',
      live: true,
      aligned: mirageDir === masterDirection || masterDirection === 'NEUTRAL',
    });
  }

  const liveModules = modules.filter((m) => m.live);
  const alignedCount = liveModules.filter((m) => m.aligned).length;
  const syncPct = liveModules.length
    ? Math.round((alignedCount / liveModules.length) * 100)
    : 0;

  const updatedAt = params.updatedAt ?? Date.now();
  const isLive = Boolean(params.analysis && (params.candles?.length ?? 0) > 0);

  const masterGrade = consensus.grade !== '—' ? consensus.grade : syncPct >= 75 ? 'B' : syncPct >= 50 ? 'C' : '—';

  const headlineKo =
    masterDirection === 'LONG'
      ? `통합 판단 · 롱 (연동 ${syncPct}%)`
      : masterDirection === 'SHORT'
        ? `통합 판단 · 숏 (연동 ${syncPct}%)`
        : `통합 판단 · 관망 (연동 ${syncPct}%)`;

  const summaryKo = [
    headlineKo,
    `L ${longPct}% / S ${shortPct}% · MTF ${consensus.confidence}% · 등급 ${masterGrade}`,
    hud?.mtfAligned ? 'MTF 정렬' : hud?.mtfAlignKo,
    consensus.gatesPassCount > 0 ? `확정 ${consensus.gatesPassCount}/5` : null,
    params.symbol,
    params.chartTf,
  ]
    .filter(Boolean)
    .join(' · ');

  const liveKo = [
    last ? `종가 ${last.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : null,
    candles.length ? `봉 ${candles.length}` : null,
    isLive ? '실시간' : '동기화',
  ]
    .filter(Boolean)
    .join(' · ');

  const trade = params.trade;
  const currentPrice = last?.close ?? params.analysis?.currentPrice ?? null;

  const chartFeatures = buildUnifiedChartFeatureContext({
    direction: masterDirection,
    currentPrice,
    candles: params.candles ?? null,
    keyZones: params.deskChart?.keyZones ?? null,
    directionConfirms: params.deskChart?.directionConfirms ?? null,
    criticalZones: params.deskChart?.criticalZones ?? null,
    bounceScenarios: params.deskChart?.bounceScenarios ?? null,
    smcLeading: params.deskChart?.smcLeading ?? null,
    vrvp: params.deskChart?.vrvp ?? null,
    deskHud: params.deskHud ?? null,
    analysis: params.analysis ?? null,
    tradeEntry: trade?.entry ?? null,
    tradeSl: trade?.stopLoss ?? null,
    tradeTp1: trade?.tp1 ?? null,
  });

  const unifiedTradePlan = resolveUnifiedDeskTradePlan({
    masterDirection,
    trade: trade ?? null,
    analysis: params.analysis ?? null,
    judgment: params.judgment ?? null,
    currentPrice,
    chartFeatures,
  });

  const actionLine =
    params.judgment?.actionKo ??
    (trade?.primary === 'LONG'
      ? '롱 시그널 · 조건 확인 후 진입'
      : trade?.primary === 'SHORT'
        ? '숏 시그널 · 조건 확인 후 진입'
        : '관망 · 신호 축적');

  const reasonsKo = [
    bm?.verdictReasonKo,
    params.judgment?.stanceKo,
    trade?.invalidationKo,
    consensus.reasonsKo[0],
    hud?.mirageLspKo,
  ].filter(Boolean) as string[];

  return {
    symbol: params.symbol,
    chartTf: params.chartTf,
    currentPrice: last?.close ?? params.analysis?.currentPrice ?? null,
    candleCount: candles.length,
    lastCandleTime: last?.time ?? null,
    updatedAt,
    isLive,
    consensus,
    gauges: {
      longPct: clamp(longPct, 0, 100),
      shortPct: clamp(shortPct, 0, 100),
      confidence: consensus.confidence,
      mtfAlignPct,
      gatesPct,
      strikeScore: clamp(Math.round(strikeScore), 0, 100),
      syncPct,
      rr: consensus.trade.rr,
      precisionFusion,
    },
    masterDirection,
    masterGrade,
    modules,
    headlineKo,
    summaryKo,
    liveKo,
    actionLine,
    reasonsKo: [...new Set(reasonsKo)].slice(0, 8),
    tradeLevels: {
      entry: unifiedTradePlan.entry,
      stopLoss: unifiedTradePlan.stopLoss,
      tp1: unifiedTradePlan.tp1,
      tp2: unifiedTradePlan.tp2,
      tp3: unifiedTradePlan.tp3,
    },
    unifiedTradePlan,
    chartFeatures,
  };
}
