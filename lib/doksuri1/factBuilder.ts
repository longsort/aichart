/**
 * Doksuri-1 — FACT 빌더 (실측만 병합).
 */
import type { Candle, AnalyzeResponse } from '@/types';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import type { MergedDeskStructureVerdictPack } from '@/lib/mergedDeskStructureVerdict';
import {
  ACTION_KO,
  type ActionState,
  type DominantSide,
  type Doksuri1Fact,
} from '@/lib/doksuri1/types';
import { assessDoksuri1DataQuality, countBadSources } from '@/lib/doksuri1/dataQuality';
import { classifyBigMoneyFlow } from '@/lib/doksuri1/bigMoneyFlow';
import { scoreDumpZonesAttackDefense } from '@/lib/doksuri1/attackDefense';
import { buildDoksuri1DualPlans, type DualPlanSwingLite } from '@/lib/doksuri1/dualPlanBuilder';
import { buildDoksuri1MapLevels, resolveNextBattle } from '@/lib/doksuri1/nextBattle';
import { buildDoksuri1Paths } from '@/lib/doksuri1/pathEngine';
import { readDoksuri1DerivativesCase } from '@/lib/doksuri1/derivativesCase';
import { buildDoksuri1Absorption } from '@/lib/doksuri1/absorptionBridge';
import { buildDoksuri1LearningStats } from '@/lib/doksuri1/learningStats';
import { buildDoksuri1MergedDeskIntel } from '@/lib/doksuri1/mergedDeskIntel';
import { telegramAssetPricePlausible } from '@/lib/telegramSymbolPriceGuard';
import type { HqEntryZonesPack } from '@/lib/mergedDeskHqEntryZones';

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function rvolOf(candles: Candle[]): number | null {
  if (candles.length < 8) return null;
  const n = candles.length;
  const hist = candles
    .slice(Math.max(0, n - 21), n - 1)
    .map((c) => Number(c.volume) || 0)
    .filter((v) => v > 0);
  const last = Number(candles[n - 1]?.volume) || 0;
  if (!(last > 0) || !hist.length) return null;
  const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
  return avg > 0 ? Math.round((last / avg) * 100) / 100 : null;
}

function priceDeltaPct(candles: Candle[]): number | null {
  if (candles.length < 4) return null;
  const a = Number(candles[candles.length - 4]?.close);
  const b = Number(candles[candles.length - 1]?.close);
  if (!(a > 0) || !(b > 0)) return null;
  return ((b - a) / a) * 100;
}

/** 분석 오버레이에서 최근 EQH/EQL 가격 1개씩 */
function pickEqLiquidityFromAnalysis(
  analysis: AnalyzeResponse | null | undefined
): { eqh: number | null; eql: number | null } {
  const overlays = analysis?.overlays;
  if (!Array.isArray(overlays) || !overlays.length) return { eqh: null, eql: null };
  let eqh: number | null = null;
  let eql: number | null = null;
  for (let i = overlays.length - 1; i >= 0; i--) {
    const o = overlays[i] as { kind?: string; price?: number; y?: number };
    const kind = String(o?.kind || '');
    const px = Number(o?.price ?? o?.y);
    if (!(px > 0)) continue;
    if (!eqh && kind === 'eqh') eqh = px;
    if (!eql && kind === 'eql') eql = px;
    if (eqh && eql) break;
  }
  return { eqh, eql };
}

function dominantFromScores(
  buyer: number,
  seller: number,
  structure?: MergedDeskStructureVerdictPack | null
): DominantSide {
  if (structure?.verdict === 'DECLINE_CONFIRMED') return 'SELLERS';
  if (structure?.verdict === 'RISE_CONFIRMED') return 'BUYERS';
  if (seller >= buyer + 12) return 'SELLERS';
  if (buyer >= seller + 12) return 'BUYERS';
  return 'BALANCED';
}

function resolveAction(params: {
  badCount: number;
  dominant: DominantSide;
  longStatus: string;
  shortStatus: string;
  swingSide?: string;
  swingStance?: string;
}): ActionState {
  if (params.badCount >= 2) return 'WAIT';
  if (params.longStatus === 'ACTIVE' && params.swingStance?.startsWith('ENTER')) {
    return 'CONFIRMED_LONG';
  }
  if (params.shortStatus === 'ACTIVE' && params.swingStance?.startsWith('ENTER')) {
    return 'CONFIRMED_SHORT';
  }
  if (params.longStatus === 'WAIT_CONFIRMATION' || params.longStatus === 'WAIT_PULLBACK') {
    if (params.dominant === 'BUYERS' || params.swingSide === 'LONG') return 'WATCH_LONG';
  }
  if (params.shortStatus === 'WAIT_PULLBACK' || params.shortStatus === 'WAIT_CONFIRMATION') {
    if (params.dominant === 'SELLERS' || params.swingSide === 'SHORT') return 'WATCH_SHORT';
  }
  return 'WAIT';
}

function buildLiveChain(params: {
  srPath?: DumpSupportResistPath | null;
  structure?: MergedDeskStructureVerdictPack | null;
  bigMoneyKo: string;
  nextKo: string | null;
  derivCaseKo?: string | null;
  whaleForceKo?: string | null;
  whaleBeamKo?: string | null;
}): string[] {
  const chain: string[] = [];
  if (params.structure?.summaryKo) chain.push(params.structure.summaryKo.slice(0, 72));
  if (params.srPath?.pathKo) chain.push(params.srPath.pathKo.slice(0, 72));
  if (params.srPath?.scenarioKo) chain.push(`상태 ${params.srPath.scenarioKo}`);
  chain.push(`세력 ${params.bigMoneyKo}`);
  if (params.whaleBeamKo || params.whaleForceKo) {
    chain.push(`고래 ${(params.whaleBeamKo || params.whaleForceKo || '').slice(0, 64)}`);
  }
  if (params.derivCaseKo) chain.push(params.derivCaseKo.slice(0, 72));
  if (params.nextKo) chain.push(`다음 ${params.nextKo}`);
  return chain.slice(0, 7);
}

export function buildDoksuri1Fact(params: {
  symbol: string;
  timeframe: string;
  price: number;
  candles: Candle[];
  dumpZones?: MtfDumpZoneSpec[] | null;
  srPath?: DumpSupportResistPath | null;
  whale?: WhaleBeamIntelPack | null;
  structure?: MergedDeskStructureVerdictPack | null;
  swing?: DualPlanSwingLite | null;
  levels?: {
    entry?: number | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
  } | null;
  analysis?: AnalyzeResponse | null;
  trades?: AggTrade[] | null;
  histBullPct?: number | null;
  histBearPct?: number | null;
  histN?: number | null;
  derivEnabled?: boolean;
  orderflowEnabled?: boolean;
  hqEntryZones?: HqEntryZonesPack | null;
  deskHud?: Parameters<typeof buildDoksuri1MergedDeskIntel>[0]['deskHud'];
  masterGrade?: string | null;
  masterSide?: string | null;
}): Doksuri1Fact {
  const symbol = String(params.symbol || '').toUpperCase();
  const price = params.price;
  const candles = params.candles ?? [];
  const priceOk = price > 0 && telegramAssetPricePlausible(symbol, price);
  const derivOn = params.derivEnabled !== false;
  const ofOn = params.orderflowEnabled === true;

  const rvol = rvolOf(candles);
  const dPct = priceDeltaPct(candles);
  const bm = classifyBigMoneyFlow({
    whale: params.whale,
    priceDeltaPct: dPct,
    rvol,
  });

  const zones = params.dumpZones ?? [];
  const absorb = buildDoksuri1Absorption({
    symbol,
    candles,
    zones,
    trades: params.trades,
    enabled: ofOn,
  });

  const zoneScores = scoreDumpZonesAttackDefense({
    symbol,
    price,
    zones,
    absorptionByZoneId: ofOn ? absorb.byZoneId : undefined,
  });

  const { long, short } = buildDoksuri1DualPlans({
    symbol,
    price,
    swing: params.swing,
    levels: params.levels,
    srPath: params.srPath,
  });

  const um = params.analysis?.unifiedMarketMetrics;
  const eqLiq = pickEqLiquidityFromAnalysis(params.analysis);

  const mapLevels = buildDoksuri1MapLevels({
    symbol,
    price,
    srPath: params.srPath,
    zones: zoneScores,
    long,
    short,
    whaleEntry: params.whale?.live?.entryPrice ?? null,
    whaleTarget: params.whale?.live?.targetPrice ?? null,
    liqLongCluster:
      um?.liqClusterLongPrice != null && Number(um.liqClusterLongPrice) > 0
        ? Number(um.liqClusterLongPrice)
        : null,
    liqShortCluster:
      um?.liqClusterShortPrice != null && Number(um.liqClusterShortPrice) > 0
        ? Number(um.liqClusterShortPrice)
        : null,
    eqh: eqLiq.eqh,
    eql: eqLiq.eql,
  });

  const next = resolveNextBattle({
    price,
    srPath: params.srPath,
    map: mapLevels,
  });

  const learn = buildDoksuri1LearningStats(params.analysis);
  const histN = params.histN ?? learn.sampleN;
  const histBullPct = params.histBullPct ?? learn.tp1ReachPct;
  const histBearPct = params.histBearPct ?? learn.slReachPct;

  const { paths, bull, bear } = buildDoksuri1Paths({
    symbol,
    price,
    long,
    short,
    srPath: params.srPath,
    histBullPct,
    histBearPct,
    histN,
  });

  const deriv = readDoksuri1DerivativesCase({
    analysis: params.analysis,
    candles,
    enabled: derivOn,
  });
  const structure = params.structure ?? null;

  let buyerStrength = 40;
  let sellerStrength = 40;
  if (
    bm.state === 'STRONG_BUY' ||
    bm.state === 'STEADY_BUY' ||
    bm.state === 'BREAKOUT_BUY' ||
    bm.state === 'CHASE_BUY' ||
    bm.state === 'SELL_ABSORPTION'
  ) {
    buyerStrength += 18;
  }
  if (
    bm.state === 'STRONG_SELL' ||
    bm.state === 'STEADY_SELL' ||
    bm.state === 'BREAKDOWN_SELL' ||
    bm.state === 'CHASE_SELL' ||
    bm.state === 'BUY_ABSORPTION'
  ) {
    sellerStrength += 18;
  }
  if (structure?.verdict === 'RISE_CONFIRMED' || structure?.verdict === 'BOUNCE') {
    buyerStrength += 15;
  }
  if (structure?.verdict === 'DECLINE_CONFIRMED') sellerStrength += 15;
  if (params.srPath?.supportFirm) buyerStrength += 8;
  if (params.srPath?.resistFirm) sellerStrength += 8;
  if (rvol != null && rvol >= 1.8 && dPct != null) {
    if (dPct < 0) sellerStrength += 10;
    if (dPct > 0) buyerStrength += 10;
  }
  if (absorb.absorptionScore != null && absorb.absorptionScore >= 60) {
    if (params.srPath?.supportFirm) buyerStrength += 8;
    else sellerStrength += 4;
  }
  buyerStrength = Math.min(100, buyerStrength);
  sellerStrength = Math.min(100, sellerStrength);

  const dominant = dominantFromScores(buyerStrength, sellerStrength, structure);

  const dq = assessDoksuri1DataQuality({
    price: priceOk ? price : 0,
    candles,
    dumpZones: zones,
    whale: params.whale,
    hasStructure: Boolean(structure?.labelKo),
    hasDerivatives: deriv.has,
    hasOrderflow: absorb.absorptionScore != null,
    hasPlanLevels: Boolean(long.entry || short.entry),
    expectDerivatives: derivOn,
    expectOrderflow: ofOn,
  });
  const badSourceCount = countBadSources(dq);

  const action = resolveAction({
    badCount: badSourceCount,
    dominant,
    longStatus: long.status,
    shortStatus: short.status,
    swingSide: params.swing?.side,
    swingStance: params.swing?.stance,
  });

  const liveChainKo = buildLiveChain({
    srPath: params.srPath,
    structure,
    bigMoneyKo: bm.ko,
    nextKo: next.ko,
    derivCaseKo: deriv.caseKo,
    whaleForceKo: bm.forceKo,
    whaleBeamKo: params.whale?.live
      ? `${params.whale.live.beamKo} · ${params.whale.live.verdictKo}`
      : null,
  });

  const confParts: number[] = [];
  if (structure?.confidence) confParts.push(structure.confidence);
  if (bm.confidence != null) confParts.push(bm.confidence);
  if (params.swing?.confluence != null) confParts.push(params.swing.confluence);
  const confidence =
    confParts.length > 0
      ? Math.round(confParts.reduce((a, b) => a + b, 0) / confParts.length)
      : null;

  const factHash = shortHash(
    [
      symbol,
      params.timeframe,
      Math.round(price),
      dominant,
      bm.state,
      action,
      next.price,
      long.status,
      short.status,
      deriv.caseKo ?? '',
      absorb.absorptionScore ?? '',
    ].join('|')
  );

  const mergedIntel = buildDoksuri1MergedDeskIntel({
    symbol,
    timeframe: params.timeframe,
    price: priceOk ? price : 0,
    candles,
    dumpZones: zones,
    whale: params.whale,
    analysis: params.analysis,
    hqEntryZones: params.hqEntryZones,
    deskHud: params.deskHud,
    masterGrade: params.masterGrade,
    masterSide: params.masterSide,
  });

  return {
    schema: 'doksuri1.fact.v1',
    symbol,
    timeframe: params.timeframe,
    at: Date.now(),
    currentPrice: priceOk ? price : 0,
    dominantSide: dominant,
    sellerStrength,
    buyerStrength,
    bigMoneyState: bm.state,
    bigMoneyConfidence: bm.confidence,
    bigMoneyKo: bm.ko,
    structureLabelKo: structure?.labelKo ?? null,
    structureSummaryKo: structure?.summaryKo ?? null,
    whaleDnaKo: bm.dnaKo,
    whaleForceKo: bm.forceKo,
    whaleBeamKo: params.whale?.live
      ? `${params.whale.live.beamKo} · ${params.whale.live.verdictKo}${
          params.whale.live.phase === 'accumulation'
            ? ' · 매집쪽'
            : params.whale.live.phase === 'distribution'
              ? ' · 분산쪽'
              : ''
        }`
      : null,
    whaleSampleN: params.whale?.live?.sampleCount ?? null,
    whaleForecastPct: params.whale?.live?.forecastPct ?? null,
    rvol,
    volumeLineKo: rvol != null ? `거래량 최근대비 ${rvol.toFixed(1)}배` : null,
    cvdState: deriv.cvdState,
    oiState: deriv.oiState,
    derivCaseKo: deriv.caseKo,
    absorptionScore: absorb.absorptionScore,
    absorptionNoteKo: absorb.absorptionNoteKo,
    learningSampleN: learn.sampleN,
    learningTp1ReachPct: learn.tp1ReachPct,
    learningSlReachPct: learn.slReachPct,
    learningProfitFactor: learn.profitFactor,
    learningLineKo: learn.lineKo,
    fundingKo: deriv.fundingKo,
    liqKo: deriv.liqKo,
    mapLevels,
    zoneScores,
    longPlan: long,
    shortPlan: short,
    nextBattlePrice: next.price,
    nextBattleKo: next.ko,
    bullPathPoints: bull,
    bearPathPoints: bear,
    paths,
    liveChainKo,
    action,
    actionKo: ACTION_KO[action],
    confidence,
    gatesPass: Math.max(long.confirmationCount, short.confirmationCount),
    gatesTotal: 5,
    dataQuality: dq,
    badSourceCount,
    factHash,
    tipKo: params.srPath?.tipKo || structure?.detailKo?.slice(0, 80) || null,
    mergedDeskIntelLinesKo: mergedIntel.linesKo,
    mergedDeskMoneyAnalysisKo: mergedIntel.moneyAnalysisKo,
    candleEventLinesKo: mergedIntel.candleEventLinesKo,
    candleEventFingerprint: mergedIntel.candleEventFingerprint,
    candleEventEmitWorthy: mergedIntel.candleEventEmitWorthy,
    mergedDeskIntelFlags: mergedIntel.flags,
  };
}
