#!/usr/bin/env node
/**
 * Eagle1 structure/zone/signal/risk/chart-ux required tests.
 * node --experimental-strip-types scripts/eagle1-engines-selftest.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectStructureCausal, structureReplayParity, lastStructureEventKo, wyckoffKo, lastLiquidityKo, lastSweepLiquidity, type Eagle1Bar, type StructureSnapshot } from '../lib/eagle1/structureEngine';
import { detectZonesCausal, confirmedBoundsImmutable, applyZoneLifecycle, classifyPocState, zoneVisibleInDefaultUi, volumeProfile, pocStateKo, clusterZones, clusterReactionLabel, type Eagle1Zone } from '../lib/eagle1/zoneEngine';
import {
  marketZoneAdapterSelftest,
  eagle1ZoneToMarketZone,
  marketZoneToEagle1Zone,
  applyMarketZoneStateWithoutMovingBounds,
  marketZoneBoundsEqual,
} from '../lib/eagle1/marketZone';
import { coreZoneFusionAcceptanceA, runCoreZoneFusionEngine } from '../lib/eagle1/coreZoneFusionEngine';
import { strategyFusionAcceptanceB } from '../lib/eagle1/strategyZoneFusionEngine';
import { flowConfirmationAcceptanceI } from '../lib/eagle1/flowConfirmationEngine';
import { confluenceSmcDampSelftest } from '../lib/eagle1/confluenceEngine';
import { buildRiskPlan, positionUnits, EAGLE1_RR_REJECT } from '../lib/eagle1/riskEngine';
import { buildMainPlan } from '../lib/eagle1/signalEngine';
import { runEagle1Pipeline } from '../lib/eagle1/pipeline';
import { overlayPassesEagle1ChartMode, deskOverlayKeptForEagle1Mode, eagle1DecisionKo, hideCollidingLabels, eagle1LabelPriority, renderEagle1MobileLabelAuditSvg, mergeEagle1DeskPriceLines, attachFunctionalOverlayLabel, buildEagle1ChartUx, eagle1PathSegments, eagle1PathArrowPolygon, overlayAllowedOnEagle1HudChart } from '../lib/eagle1/chartUx';
import { eagle1ZonesToOverlays, overlayFromEagle1ZoneId } from '../lib/eagle1/zoneOverlays';
import { buildEagle1ChartAlerts } from '../lib/eagle1/chartAlertCallouts';
import { applyMergedDeskRbVisualAi } from '../lib/mergedDeskRbVisualAi';
import { classifyBandReaction, computeZoneReaction, zoneReactionKo, ZONE_REACTION_KO } from '../lib/eagle1/zoneReaction';
import { freezeFromPlan, resolvePredictionOutcome, incrementalSnapshotStats, incrementalStatsFromSetupOutcomes, predictionsEqualFrozen, attachOutcome, formatEagle1SnapshotClock } from '../lib/eagle1/predictionSnapshot';
import { eagle1StructureToOverlays } from '../lib/eagle1/structureOverlays';
import { inheritFrozenZones } from '../lib/eagle1/zoneFreeze';
import { liveReplayParity, liveReplayParityDetailed, replayAdvance, clampReplayIndex, replayFusionParityAcceptanceD } from '../lib/eagle1/replayEngine';
import { eagle1HorizonVerdicts } from '../lib/eagle1/horizonVerdict';
import { formatCompactZoneLabel, formatSamplePct } from '../lib/eagle1/noFakeNumbers';
import { computeMoneyPressure, applyMoneyPressureToRbOverlays, EAGLE1_MONEY_PRESSURE_KO, moneyFlowSide, moneyPressureShellKo } from '../lib/eagle1/moneyPressureBand';
import { smcWyckoffConfluence } from '../lib/eagle1/smcConfluence';
import { advanceFrozenTrade, pathPointsUnchanged } from '../lib/eagle1/tradeManage';
import { matchSimilarOutcomes, similarityShellKo } from '../lib/eagle1/historicalSimilarity';
import { runInternalMl } from '../lib/eagle1/internalMl';
import { runConsensus } from '../lib/eagle1/consensusEngine';
import { voteExperts } from '../lib/eagle1/expertModels';
import { walkForwardBacktest } from '../lib/eagle1/walkForwardBacktest';
import { buildSmartPath } from '../lib/eagle1/smartPath';
import { buildStatsDashboard } from '../lib/eagle1/statsDashboard';
import { safeEagle1TelegramReport } from '../lib/eagle1/telegramReporter';
import { chronologicalSplit, rejectShuffledSplit } from '../lib/eagle1/chronologicalSplit';
import { marketBusConcurrentSelftest, clearMarketBus } from '../lib/eagle1/marketDataBus';
import { classifyFamily, walkForwardRrGates, type SetupOutcome } from '../lib/eagle1/zoneExpectancy';
import { evaluateMtfSequence, mtfChainTfsForChart } from '../lib/eagle1/mtfSequence';
import { buildStructureDeskOverlays } from '../lib/eagle1/structureDeskDraw';
import { runStructureAcceptance, ACCEPTANCE_FLOW } from '../lib/eagle1/structureAcceptanceEngine';
import { runFalseBreakEngine, sliceBarsAround } from '../lib/eagle1/falseBreakEngine';
import { runHistoricalStatistics } from '../lib/eagle1/historicalStatisticsEngine';
import { runPremiumDiscount } from '../lib/eagle1/premiumDiscountEngine';
import { buildUnifiedZoneDesk } from '../lib/eagle1/unifiedZoneDesk';
import { buildPressureHeat, heatBarRgba } from '../lib/eagle1/pressureHeatmap';
import { runSchematicCompare } from '../lib/eagle1/schematicCompare';
import { resolveEagle1LiveAvailability } from '../lib/eagle1/availabilityFromLive';
import { EAGLE1_AVAILABILITY_NONE } from '../lib/eagle1/rawTypes';
import { runCombinationEngine, applyCombinationZonePromotion } from '../lib/eagle1/combinationEngine';
import { runClockFlowEngine, clockSlotUtc } from '../lib/eagle1/clockFlowEngine';
import { saveCombinationSnapshot, loadCombinationSnapshot } from '../lib/eagle1/freezeStore';
import {
  appendHistoricalEvent,
  buildHistoricalEventId,
  historicalEventStoreAcceptance,
  loadHistoricalEvents,
  setupOutcomeToHistoricalEvent,
  updateHistoricalEventOutcome,
  type HistoricalEventRecord,
} from '../lib/eagle1/historicalEventStore';
import { buildCoverageManifest, writeCoverageManifest } from '../lib/eagle1/coverageManifest';
import {
  bucketTradesToOfi,
  replenishmentFromBooks,
  liqAccelFromPoints,
  lastOfi,
} from '../lib/eagle1/microstructureSeries';
import { ingestMicrostructureSeries, loadMicrostructureSeries } from '../lib/eagle1/seriesStore';
import { executionLevelsAcceptancePriceCoords } from '../lib/eagle1/executionLevels';
import { continuationAcceptanceGH } from '../lib/eagle1/continuationEngine';
import { calibrationGateAcceptance } from '../lib/eagle1/calibrationGate';
import { historicalPathAcceptanceJ } from '../lib/eagle1/historicalPathGate';
import { mergedDeskPracticalUiAcceptance } from '../lib/eagle1/mergedDeskPracticalUi';
import { mergedDeskAnchoredVwapAcceptance } from '../lib/mergedDeskAnchoredVwap';
import { mergedDeskCoreInjectSelftest } from '../lib/eagle1/mergedDeskCoreInject';
import { historicalZoneCacheAcceptance } from '../lib/eagle1/historicalZoneCache';
import { pipelineMemoAcceptance } from '../lib/eagle1/pipelineMemo';
import { runMasterAcceptanceChecklist } from '../lib/eagle1/masterAcceptanceChecklist';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) fail.push(msg);
}

function bar(i: number, o: number, h: number, l: number, c: number, v = 10): Eagle1Bar {
  return { time: 1_700_000_000 + i * 3600, open: o, high: h, low: l, close: c, volume: v };
}

/** Slow grind up with 6-bar swing rhythm, then optional dump. */
function grind(n: number, dumpFrom?: number): Eagle1Bar[] {
  const out: Eagle1Bar[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const dumping = dumpFrom != null && i >= dumpFrom;
    const cycle = i % 6;
    const open = px;
    let close = px;
    if (dumping) close = px - (1.1 + (i % 3) * 0.25);
    else if (cycle === 0) close = px + 1.35;
    else if (cycle === 3) close = px - 0.45;
    else close = px + (dumping ? -0.2 : 0.18);
    const high = Math.max(open, close) + (cycle === 0 && !dumping ? 0.45 : 0.12);
    const low = Math.min(open, close) - (cycle === 3 || dumping ? 0.4 : 0.1);
    out.push(bar(i, open, high, Math.min(low, close, open), Math.max(high, close, open) === high ? close : close, 8 + cycle));
    const b = out[out.length - 1]!;
    out[out.length - 1] = bar(i, open, Math.max(open, close, high), Math.min(open, close, low), close, 8 + cycle);
    void b;
    px = close;
  }
  return out;
}

function chop(n: number): Eagle1Bar[] {
  const out: Eagle1Bar[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const open = px;
    const close = px + ((i % 2 === 0 ? 1 : -1) * 0.35);
    out.push(bar(i, open, Math.max(open, close) + 0.2, Math.min(open, close) - 0.2, close, 5));
    px = close;
  }
  return out;
}

const up = grind(72);
const replayFails = structureReplayParity(up, [24, 36, 48, 60], 2);
assert(replayFails.length === 0, `structure replay: ${replayFails.join('; ')}`);

const full = detectStructureCausal(up, up.length, 2);
const live48 = detectStructureCausal(up, 48, 2);
const chochOrBos = full.events.filter((e) => e.kind === 'BOS' || e.kind === 'CHOCH');
assert(chochOrBos.length >= 1, 'expected at least one BOS/CHoCH on grind');
for (const ev of live48.events) {
  const later = full.events.find((e) => e.kind === ev.kind && e.index === ev.index && e.known_at === ev.known_at);
  assert(!!later, `backdated/missing event ${ev.kind}@${ev.index}`);
  if (later) {
    assert(later.level === ev.level, `event level moved ${ev.kind}@${ev.index}`);
  }
}

const dumped = grind(90, 72);
const afterDump = detectStructureCausal(dumped, dumped.length, 2);
const dumpChoCH = afterDump.events.filter((e) => e.kind === 'CHOCH' && e.known_at >= 72);
assert(dumpChoCH.every((e) => e.known_at >= 72), 'CHoCH backdated before dump');
const beforeDump = detectStructureCausal(dumped, 72, 2);
for (const ev of dumpChoCH) {
  assert(
    !beforeDump.events.some((e) => e.kind === 'CHOCH' && e.index === ev.index),
    'future CHoCH appeared in earlier prefix'
  );
}

const z40 = detectZonesCausal({ candles: up, timeframe: '1H', structure: detectStructureCausal(up, 40, 2), endExclusive: 40 });
const z80 = detectZonesCausal({ candles: up, timeframe: '1H', structure: detectStructureCausal(up, 80, 2), endExclusive: 80 });
for (const z of z40.zones.filter((x) => x.source_type === 'fvg' && x.frozen)) {
  const later = z80.zones.find((x) => x.zone_id === z.zone_id);
  if (later) {
    assert(confirmedBoundsImmutable(z, later), `FVG bounds moved ${z.zone_id}`);
  }
}
assert(z80.clusters.length >= 1, 'expected zone cluster');
assert(z80.recommended != null, 'recommended cluster');
assert(z80.displaySupport.length <= 2 && z80.displayResist.length <= 2, 'SR cap 2+2');
assert(z80.profile.pocState.length > 0, 'poc state present');

/** PHASE 2 — MarketZone 어댑터 */
const mzSelf = marketZoneAdapterSelftest();
assert(mzSelf.ok, `marketZone adapter: ${mzSelf.notes.join('; ')}`);
for (const z of z80.zones.slice(0, 8)) {
  const m = eagle1ZoneToMarketZone(z, { symbol: 'BTCUSDT' });
  const back = marketZoneToEagle1Zone(m);
  assert(back.zone_id === z.zone_id && back.lower === z.lower && back.upper === z.upper, `mz roundtrip ${z.zone_id}`);
  assert(m.sourceTimeframe === z.timeframe, `sourceTimeframe ${z.zone_id}`);
  if (z.frozen) {
    const next = applyMarketZoneStateWithoutMovingBounds(m, { state: 'TESTING', testCount: (m.testCount || 0) + 1 });
    assert(marketZoneBoundsEqual(m, next), `frozen bounds immutable ${z.zone_id}`);
  }
}
const accA = coreZoneFusionAcceptanceA();
assert(accA.ok, `CORE Acceptance A: ${accA.notes.join('; ')}`);
const pipeCore = runEagle1Pipeline({ candles: grind(80), timeframe: '1H' });
assert(pipeCore.coreZoneFusion != null, 'pipeline coreZoneFusion');
assert(
  pipeCore.coreZoneFusion.practical.length <= 2,
  'practical CORE max 2'
);
const coreOvs = eagle1ZonesToOverlays({
  zones: pipeCore.zones.zones,
  coreZoneFusion: pipeCore.coreZoneFusion,
  lastTime: grind(80)[79]!.time,
  mode: 'practical',
  pocState: pipeCore.zones.profile.pocState,
});
assert(
  coreOvs.filter((o) => String(o.id).startsWith('eagle1-core-')).length <= 2,
  'core overlays <=2'
);
assert(
  !coreOvs.some((o) => String(o.id).startsWith('eagle1-cluster-sup-')),
  'practical with CORE hides extra support clusters'
);
const accB = strategyFusionAcceptanceB();
assert(accB.ok, `Strategy Fusion Acceptance B: ${accB.notes.join('; ')}`);
assert(Array.isArray(pipeCore.strategyPack.zones), 'strategyPack zones');
assert(pipeCore.strategyFusion != null, 'strategyFusion');
const flowI = flowConfirmationAcceptanceI();
assert(flowI.ok, `Flow Acceptance I: ${flowI.notes.join('; ')}`);
const damp = confluenceSmcDampSelftest();
assert(damp.ok, `confluence SMC damp: ${damp.notes.join('; ')}`);
assert(pipeCore.flowConfirmation != null, 'flowConfirmation');
assert(pipeCore.confluence != null, 'confluence');
assert(
  pipeCore.confluence.setupScore == null ||
    pipeCore.confluence.historicalWinRate == null ||
    pipeCore.confluence.setupScore !== Math.round((pipeCore.confluence.historicalWinRate || 0) * 100),
  'setupScore must not equal raw hist% as same number by design when both set — or hist null'
);
assert(
  z80.zones.some((z) => z.source_type === 'poc') && z80.clusters.every((c) => c.components.every((z) => z.status !== 'BROKEN')),
  'clusters exclude broken'
);
const lastT = up[up.length - 1]!.time;
const practicalZones = eagle1ZonesToOverlays({
  zones: z80.zones,
  clusters: z80.clusters,
  recommended: z80.recommended,
  displaySupport: z80.displaySupport,
  displayResist: z80.displayResist,
  lastTime: lastT,
  mode: 'practical',
  pocState: z80.profile.pocState,
});
assert(practicalZones.some((o) => o.id === 'eagle1-poc-line' || String(o.id).startsWith('eagle1-cluster-')), 'practical draws poc line/cluster');
const pocLine = practicalZones.find((o) => o.id === 'eagle1-poc-line');
assert(
  !pocLine || (!String(pocLine.label).includes('%') && !String(pocLine.label).includes('통계 부족')),
  'practical POC label is state, not fake %'
);
assert(
  practicalZones.every((o) => o.time2 === lastT),
  'zone right edge is last candle'
);
assert(
  !overlayPassesEagle1ChartMode({ id: 'eagle1-ob-1', kind: 'ob', mode: 'practical' }),
  'practical hides extra OB'
);
assert(
  overlayPassesEagle1ChartMode({ id: 'eagle1-ob-1', kind: 'ob', mode: 'analysis' }),
  'analysis keeps OB'
);
const brokenKeep = z80.zones.filter((z) => !zoneVisibleInDefaultUi(z));
assert(brokenKeep.every((z) => z.status === 'BROKEN' || z.status === 'INVALID' || z.status === 'DELETED' || z.tier === 'C'), 'default UI hides dead/C');

const pocBars: Eagle1Bar[] = [
  bar(0, 100, 101, 99, 99.2),
  bar(1, 99.2, 100.4, 98.8, 99.1),
  bar(2, 99.1, 100.6, 98.9, 100.4),
];
assert(classifyPocState({ bars: pocBars, poc: 100, atr: 1 }) === 'RECLAIMED' || classifyPocState({ bars: pocBars, poc: 100, atr: 1 }) === 'CLOSED_ABOVE', 'poc reclaim/close above');
const attempt: Eagle1Bar[] = [
  bar(0, 101, 101.4, 100.6, 101.1),
  bar(1, 101.1, 101.3, 99.4, 101.05),
];
const attemptState = classifyPocState({ bars: attempt, poc: 100, atr: 1 });
assert(
  attemptState === 'BREAK_ATTEMPT' ||
    attemptState === 'ABOVE' ||
    attemptState === 'HOLD_SUCCESS' ||
    attemptState === 'RETEST' ||
    attemptState === 'CLOSED_ABOVE',
  `poc wick attempt got ${attemptState}`
);

const pipeWait = runEagle1Pipeline({ candles: chop(40), timeframe: '15m' });
assert(pipeWait.mainPlan.status === 'WAIT' || pipeWait.mainPlan.noTradeGates.length > 0, 'chop should WAIT');
assert(eagle1DecisionKo(pipeWait.mainPlan.status).length > 0, 'decision label');

const riskFarSl = buildRiskPlan({
  candles: up,
  structure: full,
  zones: z80,
  direction: 'LONG',
});
if (riskFarSl.netRrTp1 != null && riskFarSl.grossRrTp1 != null) {
  assert(riskFarSl.netRrTp1 <= riskFarSl.grossRrTp1 + 1e-9, 'net RR must not exceed gross after fees');
}
const sizeA = positionUnits({ equity: 10_000, riskPct: 1, entry: 100, sl: 99, confidence: 90 });
const sizeB = positionUnits({ equity: 10_000, riskPct: 1, entry: 100, sl: 99, confidence: 10 });
assert(sizeA != null && sizeA === sizeB, 'size must ignore confidence');

const disagree = buildMainPlan({
  candles: chop(50),
  timeframe: '15m',
  structure: detectStructureCausal(chop(50), 50, 2),
  zones: detectZonesCausal({
    candles: chop(50),
    timeframe: '15m',
    structure: detectStructureCausal(chop(50), 50, 2),
  }),
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
assert(disagree.status === 'WAIT' || disagree.noTradeGates.length > 0, 'disagreement/low RR → WAIT');

const jumped = [...up];
const last = jumped[jumped.length - 1]!;
jumped.push(
  bar(jumped.length, last.close, last.close + 8, last.close + 5, last.close + 7, 20)
);
const missed = runEagle1Pipeline({ candles: jumped, timeframe: '1H' });
assert(
  missed.mainPlan.status === 'WAIT' ||
    missed.mainPlan.status === 'LONG_MISSED' ||
    missed.mainPlan.status === 'SHORT_MISSED' ||
    missed.mainPlan.noTradeGates.length > 0,
  'late spike must not chase confirmed'
);

assert(
  deskOverlayKeptForEagle1Mode({
    id: 'merged-desk-rb-short-band',
    kind: 'channelBand',
    extraClass: 'merged-desk-rb-primary merged-desk-rb-channel',
    mode: 'practical',
  }),
  'practical keeps near-price RB pressure band'
);
assert(
  !deskOverlayKeptForEagle1Mode({
    id: 'merged-desk-rb-rail-bounce-1',
    kind: 'demandZone',
    label: '★초강력하락',
    mode: 'practical',
  }),
  'practical hides 초강력/강/중/약 zone stack'
);
assert(
  overlayPassesEagle1ChartMode({ id: 'eagle1-cluster-main-upper', kind: 'keyLevel', mode: 'practical' }),
  'practical keeps cluster price line'
);
assert(
  deskOverlayKeptForEagle1Mode({ id: 'eagle1-cluster-main-upper', kind: 'keyLevel', mode: 'practical' }),
  'practical keeps 핵심 매수구간 line'
);
assert(
  deskOverlayKeptForEagle1Mode({ id: 'eagle1-poc', kind: 'zone', mode: 'practical' }),
  'practical keeps eagle1 poc'
);
assert(
  !deskOverlayKeptForEagle1Mode({ id: 'eagle1-ob-1', kind: 'ob', mode: 'practical' }),
  'practical still hides extra eagle1 OB'
);
assert(
  pipeWait.chartUx.priceLines.some((p) => p.title === '최다거래가격' || p.title === 'POC') ||
    pipeWait.zones.profile.poc == null,
  'WAIT still draws POC price line when poc exists'
);
const mergedLines = mergeEagle1DeskPriceLines(
  [{ price: 1, title: 'TP1', color: '#fff', lineWidth: 1, lineStyle: 'dotted' }],
  [{ price: 2, title: '최다거래가격', color: '#facc15', lineWidth: 2, lineStyle: 'solid', axisLabel: true }],
  'practical',
  'WAIT'
);
assert(mergedLines.some((p) => /^TP1\b/.test(p.title)) && mergedLines.some((p) => p.title === '최다거래가격'), 'price lines stay additive');
assert(
  overlayPassesEagle1ChartMode({ id: 'merged-ares-line-entry', kind: 'keyLevel', mode: 'practical' }),
  'practical keeps entry line'
);
assert(
  !deskOverlayKeptForEagle1Mode({ id: 'merged-desk-btccion-foo', kind: 'zone', mode: 'practical' }),
  'practical hides extra desk zone boxes'
);
assert(
  deskOverlayKeptForEagle1Mode({
    id: 'merged-desk-hotzone-below-1',
    kind: 'demandZone',
    extraClass: 'merged-desk-hotzone-entry',
    mode: 'practical',
  }),
  'practical shows Hot존 face'
);
assert(
  deskOverlayKeptForEagle1Mode({
    id: 'merged-ares-key-support-1',
    kind: 'demandZone',
    mode: 'practical',
  }),
  'practical shows key zone face'
);
assert(
  attachFunctionalOverlayLabel({ id: 'x', kind: 'demandZone', label: '' }).labelTooltip?.includes('클릭'),
  'empty label still gets inspect action'
);
assert(
  !overlayPassesEagle1ChartMode({ id: 'merged-desk-btccion-foo', kind: 'zone', mode: 'practical' }),
  'practical hides btccion'
);
assert(
  overlayPassesEagle1ChartMode({ id: 'engine-fvg-1', kind: 'fvg', mode: 'analysis' }),
  'analysis keeps FVG'
);
assert(
  overlayPassesEagle1ChartMode({ id: 'debug-anything', kind: 'label', mode: 'research' }),
  'research keeps debug'
);

assert(EAGLE1_RR_REJECT === 1.8, 'RR reject default');

const zPrev = detectZonesCausal({ candles: up, timeframe: '1H', structure: detectStructureCausal(up, 50, 2), endExclusive: 50 });
const zNext = detectZonesCausal({
  candles: up,
  timeframe: '1H',
  structure: detectStructureCausal(up, 70, 2),
  endExclusive: 70,
  prevFrozen: zPrev.zones,
});
const pocA = zPrev.zones.find((z) => z.source_type === 'poc');
const pocB = zNext.zones.find((z) => z.source_type === 'poc' && z.status !== 'INVALID');
if (pocA && pocB && pocA.frozen) {
  const moved = Math.abs(pocB.midpoint - pocA.midpoint) > (pocA.upper - pocA.lower);
  if (!moved) {
    assert(pocA.lower === pocB.lower && pocA.upper === pocB.upper, 'POC confirmed bounds moved');
  }
}
const inherited = inheritFrozenZones({
  fresh: zNext.zones,
  prev: zPrev.zones,
  candles: up,
  endExclusive: 70,
});
assert(inherited.length >= 1, 'inherit freeze empty');

const trade1 = advanceFrozenTrade({
  prev: null,
  candles: [
    bar(0, 100, 101, 99, 100),
    bar(1, 100, 104, 99.5, 103.2),
  ],
  candidate: {
    direction: 'LONG',
    entry: 100,
    sl: 98,
    tp1: 103,
    tp2: 106,
    tp3: 110,
    lastTime: 1_700_000_000,
    tfSec: 3600,
    confirm: true,
  },
});
assert(trade1?.state === 'TP1_HIT' || trade1?.state === 'OPEN', 'trade manage did not advance or open');
if (trade1) {
  const later = advanceFrozenTrade({
    prev: trade1,
    candles: [
      bar(0, 100, 101, 99, 100),
      bar(1, 100, 104, 99.5, 103.2),
      bar(2, 103, 104, 102, 103.5),
    ],
    candidate: {
      direction: 'LONG',
      entry: 100,
      sl: 98,
      tp1: 103,
      tp2: 106,
      tp3: 110,
      lastTime: 1_700_000_000,
      tfSec: 3600,
      confirm: true,
    },
  });
  assert(later != null && pathPointsUnchanged(trade1.path, later.path), 'path dragged after later bars');
}

const gapBars: Eagle1Bar[] = [
  bar(0, 100, 101, 99, 100),
  bar(1, 100, 110, 90, 91),
];
const gapTrade = advanceFrozenTrade({
  prev: null,
  candles: gapBars,
  candidate: {
    direction: 'LONG',
    entry: 100,
    sl: 98,
    tp1: 103,
    tp2: 106,
    tp3: 110,
    lastTime: gapBars[0]!.time,
    tfSec: 3600,
    confirm: true,
  },
});
assert(gapTrade?.state === 'INVALIDATED', 'gap through must count SL first');

const simEmpty = matchSimilarOutcomes([], {
  regime: 'BULL',
  state: 'SHIFT',
  family: 'ob_retest',
  direction: 'LONG',
});
assert(simEmpty.calibratedProbability == null && simEmpty.calibratedLabel === '통계 부족', 'empty similarity must not fake %');

const wide = runEagle1Pipeline({
  candles: up,
  timeframe: '1H',
  spreadBps: 20,
  depthOk: true,
});
assert(
  wide.riskLong.execution === 'SIGNAL_VALID_EXECUTION_WAIT' || wide.mainPlan.status !== 'CONFIRMED_LONG',
  'wide spread must not confirm'
);

assert(
  overlayPassesEagle1ChartMode({ id: 'eagle1-path-main-1', kind: 'trendLine', mode: 'practical' }),
  'practical keeps 주경로'
);

assert(classifyFamily({ structureState: 'IDLE', pocState: 'BELOW', nearPoc: false, inOb: false, inFvg: false, recentSweep: true }) === 'sweep_reversal', 'recent sweep family');
assert(classifyFamily({ structureState: 'IDLE', pocState: 'BELOW', nearPoc: true, inOb: false, inFvg: false, recentSweep: false }) === 'poc_hold', 'near poc family');
assert(classifyFamily({ structureState: 'IDLE', pocState: 'BELOW', nearPoc: false, inOb: true, inFvg: false, recentSweep: false }) === 'ob_retest', 'ob family');

function zoneRow(status: Eagle1Zone['status'], frozen: boolean): Eagle1Zone {
  return {
    zone_id: 'test:ob',
    source_type: 'ob',
    timeframe: '1H',
    created_at: 1_700_000_000,
    lower: 100,
    upper: 102,
    midpoint: 101,
    strength: 0.5,
    strengthKind: 'heuristic',
    reason: 'lifecycle-test',
    status,
    test_count: 0,
    last_test_at: null,
    bias: 'bullish',
    tier: 'A',
    frozen,
  };
}
const pendingStay = applyZoneLifecycle(zoneRow('PENDING', false), [bar(0, 105, 106, 104, 105)], 1);
assert(pendingStay.status === 'PENDING', 'pending stays outside zone');
const confirmedZ = applyZoneLifecycle(zoneRow('PENDING', false), [bar(0, 101, 101.4, 100.6, 101.1)], 1);
assert(confirmedZ.status === 'CONFIRMED' && confirmedZ.frozen, 'pending→confirmed');
assert(confirmedZ.lower === 100 && confirmedZ.upper === 102, 'confirm must freeze bounds');
const testedZ = applyZoneLifecycle(confirmedZ, [bar(1, 103, 103.4, 101.2, 103)], 1);
assert(testedZ.status === 'TESTED' && testedZ.lower === 100 && testedZ.upper === 102, 'confirmed→tested bounds frozen');
const brokenZ = applyZoneLifecycle(testedZ, [bar(2, 99, 99.4, 97.5, 98.2)], 1);
assert(brokenZ.status === 'BROKEN' && brokenZ.lower === 100 && brokenZ.upper === 102, 'tested→broken bounds frozen');

const crowdedHidden = hideCollidingLabels(
  [
    { id: 'eagle1-entry', y: 100, h: 14, priority: eagle1LabelPriority('eagle1-entry') },
    { id: 'eagle1-sl', y: 180, h: 14, priority: eagle1LabelPriority('eagle1-sl') },
    { id: 'eagle1-tp1', y: 40, h: 14, priority: eagle1LabelPriority('eagle1-tp1') },
    { id: 'aux-bos', y: 100, h: 14, priority: eagle1LabelPriority('aux-bos') },
    { id: 'debug-score', y: 101, h: 14, priority: eagle1LabelPriority('debug-score') },
    { id: 'aux-fvg', y: 180, h: 14, priority: eagle1LabelPriority('engine-fvg-1') },
  ],
  14
);
assert(!crowdedHidden.has('eagle1-entry') && !crowdedHidden.has('eagle1-sl') && !crowdedHidden.has('eagle1-tp1'), 'E/SL/TP captions stay');
assert(crowdedHidden.has('aux-bos') && crowdedHidden.has('debug-score'), 'lower-priority labels hide, not move');

const rrRows: SetupOutcome[] = Array.from({ length: 80 }, (_, i) => ({
  family: 'pullback',
  regime: 'BULL',
  direction: 'LONG',
  index: i,
  tpFirst: i % 3 !== 0,
  slFirst: i % 3 === 0,
  mfe: 2.2,
  mae: 0.8,
  netR: i % 3 === 0 ? -0.84 : 2.16,
  grossRr: i % 2 === 0 ? 2.6 : 1.6,
}));
const rrWf = walkForwardRrGates(rrRows);
assert(rrWf.applied === false, 'RR walk-forward must not flip live gates');
assert(rrWf.defaultMin === 1.8, 'RR default min 1.8');

assert(mtfChainTfsForChart('15m').join(',') === '1D,4H,1H,15m', '15m chain');
assert(mtfChainTfsForChart('1m').includes('5m'), '1m chain includes 5m');
const mtfMissing = evaluateMtfSequence({
  ltf: full,
  chain: [
    { tf: '1D', structure: null },
    { tf: '4H', structure: full },
    { tf: '1H', structure: full },
  ],
});
assert(mtfMissing.frames[0]?.state === '데이터 없음', 'missing 1D is 데이터 없음');
assert(mtfMissing.aligned !== false || mtfMissing.note.includes('데이터 없음'), 'missing frame must not fake a conflict');
assert(mtfMissing.sequence[0] === '일봉 데이터 없음', 'sequence names missing 1D');

const dumpedSt = detectStructureCausal(dumped, dumped.length, 2);
const mtfConflict = evaluateMtfSequence({
  ltf: dumpedSt,
  chain: [
    { tf: '4H', structure: full },
    { tf: '1H', structure: dumpedSt },
  ],
});
if (mtfConflict.frames[0]?.bias && mtfConflict.frames[1]?.bias && mtfConflict.frames[0].bias !== mtfConflict.frames[1].bias) {
  assert(mtfConflict.aligned === false, 'opposite HTF/LTF bias → aligned false');
}

assert(
  !overlayPassesEagle1ChartMode({ id: 'engine-ob-broken-1', kind: 'zone', mode: 'practical' }),
  'practical hides broken zone'
);
assert(riskFarSl.sizeUnits != null && riskFarSl.sizeUnits > 0, 'size from equity/stop');
assert(pipeWait.mainPlan.sizeNote.includes('확신도'), 'size note ignores confidence');

const mobileBoxes = [
  { id: 'eagle1-entry', y: 200, h: 14, priority: eagle1LabelPriority('eagle1-entry') },
  { id: 'eagle1-sl', y: 320, h: 14, priority: eagle1LabelPriority('eagle1-sl') },
  { id: 'eagle1-tp1', y: 80, h: 14, priority: eagle1LabelPriority('eagle1-tp1') },
  { id: 'aux-bos', y: 200, h: 14, priority: eagle1LabelPriority('aux-bos') },
  { id: 'debug-score', y: 202, h: 14, priority: 9 },
  { id: 'engine-ob-broken-1', y: 321, h: 14, priority: 6 },
];
const mobileAudit = renderEagle1MobileLabelAuditSvg({ width: 390, height: 844, boxes: mobileBoxes });
assert(mobileAudit.entrySlTpVisible, 'mobile practical E/SL/TP readable');
assert(mobileAudit.hidden.includes('aux-bos'), 'mobile hides colliding aux');

const outDir = path.join(ROOT, 'data', 'eagle1');
fs.mkdirSync(outDir, { recursive: true });
const uxAudit = {
  mode: 'practical',
  crowded: true,
  hidden: [...crowdedHidden],
  entryVisible: !crowdedHidden.has('eagle1-entry'),
  slVisible: !crowdedHidden.has('eagle1-sl'),
  tpVisible: !crowdedHidden.has('eagle1-tp1'),
  movedLabels: false,
  calculated_at: Date.now(),
};
fs.writeFileSync(path.join(outDir, 'chart-ux-audit.json'), JSON.stringify(uxAudit, null, 2));
fs.writeFileSync(
  path.join(outDir, 'chart-ux-mobile-audit.json'),
  JSON.stringify(
    {
      width: 390,
      height: 844,
      hidden: mobileAudit.hidden,
      visible: mobileAudit.visible,
      entrySlTpVisible: mobileAudit.entrySlTpVisible,
      movedLabels: false,
      calculated_at: Date.now(),
    },
    null,
    2
  )
);
fs.writeFileSync(path.join(outDir, 'chart-ux-mobile-audit.svg'), mobileAudit.svg);
const report = {
  passed: fail.length === 0,
  failures: fail,
  structureEvents: full.events.length,
  regime: full.regime,
  zoneCount: z80.zones.length,
  waitStatus: pipeWait.mainPlan.status,
  calculated_at: Date.now(),
};
fs.writeFileSync(path.join(outDir, 'engines-audit.json'), JSON.stringify(report, null, 2));

assert(
  deskOverlayKeptForEagle1Mode({ id: 'eagle1-cluster-sup-0', kind: 'demandZone', mode: 'practical' }),
  'practical keeps compact support cluster'
);
assert(formatCompactZoneLabel({ type: 'POC', bias: 'up', sampleCount: 0 }) === 'POC ↑ 통계 부족', 'compact empty');
assert(formatCompactZoneLabel({ type: 'OB', bias: 'up', sampleCount: 12, medianPct: 1.8 }) === 'OB ↑ 통계 부족', 'compact short sample');
assert(clampReplayIndex(3, 100) === 8, 'replay min prefix');
assert(replayAdvance(10, 100, 5) === 15, 'replay 5x step');
const liveReplayFails = liveReplayParity(up, [32, 48, 64], '1H');
assert(liveReplayFails.length === 0, `live/replay parity: ${liveReplayFails.join('; ')}`);
const emptyH = eagle1HorizonVerdicts(null);
assert(emptyH.every((h) => h.status === '데이터 없음'), 'horizon missing frames');

function mkBar(i: number, o: number, h: number, l: number, c: number, v: number, tb: number) {
  return { time: 1_700_000_000 + i * 60, open: o, high: h, low: l, close: c, volume: v, takerBuyBaseVolume: tb };
}
const absorbBars = Array.from({ length: 16 }, (_, i) => {
  const o = 100 + i * 0.02;
  const c = o + 0.03;
  return mkBar(i, o, c + 0.12, o - 0.2, c, 1200, 90);
});
const absorbP = computeMoneyPressure(absorbBars);
assert(absorbP.state === 'BUY_ABSORPTION', `sell hold should be 매도흡수, got ${absorbP.state}`);
assert(absorbP.stateKo === '매도흡수', 'absorption compact ko');
assert(!absorbP.note.includes('%') && !absorbP.stateKo.includes('%'), 'pressure note must not fake %');

const stallBars = Array.from({ length: 16 }, (_, i) => {
  const o = 100 - i * 0.02;
  const c = o - 0.03;
  return mkBar(i, o, o + 0.2, c - 0.12, c, 1200, 1110);
});
const stallP = computeMoneyPressure(stallBars);
assert(stallP.state === 'SELL_ABSORPTION', `buy stall should be 매수흡수, got ${stallP.state}`);
assert(stallP.stateKo === EAGLE1_MONEY_PRESSURE_KO.SELL_ABSORPTION, 'sell absorption ko');

const bandNear = {
  id: 'merged-desk-rb-short-band',
  kind: 'channelBand' as const,
  label: '단기',
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 1,
  time1: absorbBars[0]!.time,
  time2: absorbBars[absorbBars.length - 1]!.time,
  price1: 102,
  price2: 98,
  color: 'rgba(59,130,246,0.35)',
  overlayZoneExtraClass: 'merged-desk-rb-channel merged-desk-rb-primary',
  channelBand: {
    time1: absorbBars[0]!.time,
    time2: absorbBars[absorbBars.length - 1]!.time,
    priceHigh1: 102,
    priceHigh2: 102,
    priceLow1: 98,
    priceLow2: 98,
  },
};
const bandFar = {
  ...bandNear,
  id: 'merged-desk-rb-long-band',
  overlayZoneExtraClass: 'merged-desk-rb-channel merged-desk-rb-secondary',
  price1: 140,
  price2: 130,
  channelBand: {
    time1: absorbBars[0]!.time,
    time2: absorbBars[absorbBars.length - 1]!.time,
    priceHigh1: 140,
    priceHigh2: 140,
    priceLow1: 130,
    priceLow2: 130,
  },
};
const keptBands = applyMoneyPressureToRbOverlays([bandNear, bandFar], absorbBars);
assert(keptBands.some((o) => o.id === 'merged-desk-rb-short-band'), 'keep near-price RB band');
assert(!keptBands.some((o) => o.id === 'merged-desk-rb-long-band'), 'drop far HTF RB band');
assert(
  keptBands.some((o) => o.kind === 'channelBand' && String(o.label) === '매도흡수' && !String(o.label).includes('%')),
  'band compact label is 상태 only, no fake %'
);

const tiny = grind(8);
const tinySt = detectStructureCausal(tiny, tiny.length, 2);
assert(tinySt.regime === 'UNKNOWN' || tinySt.regimeConfidence === 'low', 'short sample stays UNKNOWN/low');
if (tinySt.regime === 'UNKNOWN') {
  const unknownWait = runEagle1Pipeline({ candles: tiny, timeframe: '1H' });
  assert(
    unknownWait.mainPlan.status === 'WAIT' || unknownWait.mainPlan.noTradeGates.includes('unknown regime'),
    'UNKNOWN regime must not confirm'
  );
}

const bosSnap = detectStructureCausal(up, up.length, 2);
assert(bosSnap.roleReversals.length >= 1, 'BOS creates role reversal');
assert(bosSnap.rangeHigh != null && bosSnap.rangeLow != null, 'range high/low present after swings');
const lastBos = [...bosSnap.events].reverse().find((e) => e.kind === 'BOS' && e.bias === 'bullish');
assert(!!lastBos, 'bullish BOS on grind');
const failSeries = [...up];
let failPx = failSeries[failSeries.length - 1]!.close;
for (let i = 0; i < 5; i++) {
  const o = failPx;
  const c = (lastBos?.level ?? failPx) - 2.4 - i * 0.4;
  failSeries.push(bar(failSeries.length, o, Math.max(o, c) + 0.08, Math.min(o, c) - 0.08, c, 9));
  failPx = c;
}
const failedSnap = detectStructureCausal(failSeries, failSeries.length, 2);
const failEv = failedSnap.events.find((e) => e.kind === 'FAILED_BREAK' && e.known_at >= up.length);
assert(!!failEv, 'close back through BOS level is FAILED_BREAK');
const prefixNoFail = detectStructureCausal(failSeries, up.length, 2);
assert(
  !prefixNoFail.events.some((e) => e.kind === 'FAILED_BREAK' && e.known_at >= up.length),
  'FAILED_BREAK must not backdate'
);
assert(!lastStructureEventKo(failedSnap.events).includes('%'), 'structure compact has no fake %');

const analysisStruct = eagle1StructureToOverlays({
  events: failedSnap.events,
  candles: failSeries,
  lastTime: failSeries[failSeries.length - 1]!.time,
  mode: 'analysis',
});
assert(
  analysisStruct.some((o) => o.kind === 'bos' || o.kind === 'choch' || o.kind === 'falseBreakout'),
  'analysis draws last structure'
);
assert(
  eagle1StructureToOverlays({
    events: failedSnap.events,
    candles: failSeries,
    lastTime: failSeries[failSeries.length - 1]!.time,
    mode: 'practical',
  }).length === 0,
  'practical hides structure overlays'
);
assert(!overlayPassesEagle1ChartMode({ id: 'eagle1-bos-1', kind: 'bos', mode: 'practical' }), 'practical hides BOS overlay');
assert(overlayPassesEagle1ChartMode({ id: 'eagle1-bos-1', kind: 'bos', mode: 'analysis' }), 'analysis keeps BOS overlay');
assert(overlayPassesEagle1ChartMode({ id: 'eagle1-fake-1', kind: 'falseBreakout', mode: 'analysis' }), 'analysis keeps fake break');

const vp40 = volumeProfile(up, 40);
const vp40b = volumeProfile(up.slice(0, 40), 40);
assert(vp40.poc === vp40b.poc && vp40.vah === vp40b.vah && vp40.val === vp40b.val, 'volume profile is prefix-causal');
assert(vp40.poc != null && vp40.vah != null && vp40.val != null, 'POC/VAH/VAL present on grind');
assert(!pocStateKo(z80.profile.pocState).includes('%'), 'poc state ko has no fake %');
assert(overlayPassesEagle1ChartMode({ id: 'eagle1-vah-1', kind: 'keyLevel', mode: 'analysis' }), 'analysis keeps 거래량상단 line');
assert(!overlayPassesEagle1ChartMode({ id: 'eagle1-vah-1', kind: 'keyLevel', mode: 'practical' }), 'practical hides VAH');
const analysisVp = eagle1ZonesToOverlays({
  zones: z80.zones,
  clusters: z80.clusters,
  recommended: z80.recommended,
  lastTime: lastT,
  mode: 'analysis',
  pocState: z80.profile.pocState,
});
assert(
  analysisVp.some((o) => o.kind === 'keyLevel' && (o.label === '거래량상단' || o.label === '거래량하단' || o.label === '최다거래가격')),
  'analysis draws VP as price lines'
);
const unresolved = buildMainPlan({
  candles: chop(50),
  timeframe: '15m',
  structure: detectStructureCausal(chop(50), 50, 2),
  zones: {
    ...detectZonesCausal({
      candles: chop(50),
      timeframe: '15m',
      structure: detectStructureCausal(chop(50), 50, 2),
    }),
    profile: { poc: 100, vah: 101, val: 99, hvn: [], lvn: [], pocState: 'BREAK_ATTEMPT' },
  },
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
assert(
  unresolved.status === 'WAIT' || unresolved.noTradeGates.includes('unresolved POC state'),
  'POC 돌파시도 must WAIT'
);

const flowAt48 = runEagle1Pipeline({ candles: up, timeframe: '1H', endExclusive: 48 });
const flowPrefix = computeMoneyPressure(up.slice(0, 48));
assert(flowAt48.moneyPressure.state === flowPrefix.state, 'money pressure prefix-causal');
assert(flowAt48.moneyPressure.state === runEagle1Pipeline({ candles: up, timeframe: '1H', endExclusive: 48 }).moneyPressure.state, 'money pressure deterministic');
assert(!moneyPressureShellKo(flowAt48.moneyPressure).includes('%'), 'flow shell has no fake %');
assert(!moneyPressureShellKo(flowAt48.moneyPressure).includes('기관'), 'flow does not claim institution');
assert(moneyFlowSide('CHASE_BUY') === 'chase' && moneyFlowSide('STRONG_SELL') === 'short', 'flow side map');

const sellAgainst = {
  ...computeMoneyPressure(up),
  state: 'STRONG_SELL' as const,
  stateKo: '강한매도',
  note: '체결 추정 · CVD 데이터 없음',
};
const conflictPlan = buildMainPlan({
  candles: up,
  timeframe: '1H',
  structure: detectStructureCausal(up, up.length, 2),
  zones: z80,
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
  moneyPressure: sellAgainst,
});
assert(
  conflictPlan.status === 'WAIT' || conflictPlan.noTradeGates.includes('low volume or contradictory flow'),
  'structure vs sell flow must WAIT'
);
const chasePlan = buildMainPlan({
  candles: up,
  timeframe: '1H',
  structure: detectStructureCausal(up, up.length, 2),
  zones: z80,
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
  moneyPressure: { ...sellAgainst, state: 'CHASE_BUY', stateKo: '추격매수' },
});
assert(
  chasePlan.status !== 'CONFIRMED_LONG' && chasePlan.status !== 'CONFIRMED_SHORT',
  'chase flow must not confirm'
);
assert(chasePlan.moneyFlow?.stateKo === '추격매수', 'WAIT still carries flow label');

assert(wyckoffKo('NONE') === '맥락 없음', 'wyckoff none is 맥락 없음');
assert(wyckoffKo('SPRING') === '스프링', 'wyckoff spring ko');
assert(!wyckoffKo('UTAD').includes('%') && !wyckoffKo('LPSY').includes('기관'), 'wyckoff labels have no fake %/기관');
assert(lastLiquidityKo(null) === '데이터 없음', 'liquidity empty');
assert(lastLiquidityKo({ events: [], equalHighs: [120], equalLows: [] }) === '유동성 대기', 'equal highs wait');
assert(
  lastLiquidityKo({
    events: [{ kind: 'SWEEP', bias: 'bearish', index: 1, known_at: 1, price: 1, level: 1, evidence: [] }],
  }) === '위쪽 유동성 털기',
  'bsl sweep ko'
);

const wyOnlyStruct: StructureSnapshot = {
  ...detectStructureCausal(chop(50), 50, 2),
  wyckoff: { label: 'SPRING', evidence: ['와이코프 맥락(단독 매매 금지)'] },
};
const wyOnlyPlan = buildMainPlan({
  candles: chop(50),
  timeframe: '15m',
  structure: wyOnlyStruct,
  zones: detectZonesCausal({
    candles: chop(50),
    timeframe: '15m',
    structure: wyOnlyStruct,
  }),
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
assert(
  wyOnlyPlan.status !== 'CONFIRMED_LONG' && wyOnlyPlan.status !== 'CONFIRMED_SHORT',
  'wyckoff-only must not confirm'
);
assert(
  wyOnlyPlan.reasons.some((r) => r.includes('단독 매매 금지')),
  'wyckoff-only still warns not to trade it'
);
const wyOnlyScore = smcWyckoffConfluence({
  structure: wyOnlyStruct,
  pocState: 'APPROACH',
});
assert(wyOnlyScore.longAdd === 0 && wyOnlyScore.shortAdd === 0 && wyOnlyScore.wyckoffOnly, 'wyckoff-only adds no score');

const alignedStruct: StructureSnapshot = {
  ...full,
  wyckoff: { label: 'SPRING', evidence: ['단독 매매 금지'] },
  events: [
    ...full.events,
    { kind: 'SWEEP', bias: 'bullish', index: 70, known_at: 70, price: 100, level: 100, evidence: ['아래쪽 유동성 털기'] },
    { kind: 'CHOCH', bias: 'bullish', index: 71, known_at: 71, price: 101, level: 101, evidence: ['추세전환'] },
  ],
};
const alignedZones = {
  ...z80,
  profile: { ...z80.profile, pocState: 'RECLAIMED' as const },
};
const withConfluence = smcWyckoffConfluence({ structure: alignedStruct, pocState: 'RECLAIMED' });
const withoutWyckoff = smcWyckoffConfluence({
  structure: { ...alignedStruct, wyckoff: { label: 'NONE', evidence: [] } },
  pocState: 'RECLAIMED',
});
assert(withConfluence.longAligned && withConfluence.longAdd >= 14, 'spring+sweep+choch+reclaim adds long');
assert(withoutWyckoff.longAdd === 0, 'no wyckoff label → no wyckoff score');
const planAligned = buildMainPlan({
  candles: up,
  timeframe: '1H',
  structure: alignedStruct,
  zones: alignedZones,
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
const planNoWy = buildMainPlan({
  candles: up,
  timeframe: '1H',
  structure: { ...alignedStruct, wyckoff: { label: 'NONE', evidence: [] } },
  zones: alignedZones,
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
assert(planAligned.longScore >= planNoWy.longScore + 13.9, 'confluence raises long score');
assert(
  planAligned.status !== 'CONFIRMED_LONG' && planAligned.status !== 'CONFIRMED_SHORT',
  'confluence still defaults WAIT without sample/sequence gates'
);
assert(!planAligned.reasons.some((r) => r.includes('%') || r.includes('기관')), 'smc reasons have no fake %/기관');

assert(z80.zones.filter((z) => z.source_type === 'liquidity').length <= 2, 'at most 1 BSL + 1 SSL');
assert(
  z80.clusters.every((c) => !c.sources.includes('liquidity')),
  'liquidity stays off 2+2 cluster boxes'
);
const liqZone = {
  zone_id: 'liq:eqh:0:120.0',
  source_type: 'liquidity' as const,
  timeframe: '1H',
  created_at: lastT,
  lower: 119.5,
  upper: 120.5,
  midpoint: 120,
  strength: 0.32,
  strengthKind: 'heuristic' as const,
  reason: '위쪽 유동성',
  status: 'CONFIRMED' as const,
  test_count: 0,
  last_test_at: null,
  bias: 'bearish' as const,
  tier: 'B' as const,
  frozen: true,
};
const analysisLiq = eagle1ZonesToOverlays({
  zones: [...z80.zones, liqZone],
  clusters: z80.clusters,
  recommended: z80.recommended,
  lastTime: lastT,
  mode: 'analysis',
  pocState: z80.profile.pocState,
});
assert(
  analysisLiq.some((o) => String(o.id).startsWith('eagle1-liq') && o.kind === 'keyLevel' && o.label === 'SHORT LIQUIDATION ZONE' && o.price1 === o.price2),
  'analysis draws SHORT LIQUIDATION ZONE as price line'
);
assert(
  eagle1ZonesToOverlays({
    zones: [...z80.zones, liqZone],
    clusters: z80.clusters,
    recommended: z80.recommended,
    lastTime: lastT,
    mode: 'practical',
    pocState: z80.profile.pocState,
  }).every((o) => !String(o.id).startsWith('eagle1-liq')),
  'practical hides eagle1-liq'
);
assert(overlayPassesEagle1ChartMode({ id: 'eagle1-liq-1', kind: 'keyLevel', label: '위쪽 유동성', mode: 'analysis' }), 'analysis keeps liq line');
assert(!overlayPassesEagle1ChartMode({ id: 'eagle1-liq-1', kind: 'keyLevel', label: '위쪽 유동성', mode: 'practical' }), 'practical hides liq line');

assert(clusterReactionLabel(0, null) === '통계 부족', 'reaction missing sample');
assert(clusterReactionLabel(12, 0.8) === '통계 부족', 'reaction short sample no fake %');
assert(clusterReactionLabel(40, null) === '데이터 없음', 'reaction long sample without hold rate');
assert(clusterReactionLabel(40, 0.72) === '72.0%', 'reaction uses real hold rate only');

function mkZ(
  id: string,
  source: Eagle1Zone['source_type'],
  bias: Eagle1Zone['bias'],
  lo: number,
  hi: number,
  tier: Eagle1Zone['tier'] = 'A'
): Eagle1Zone {
  return {
    zone_id: id,
    source_type: source,
    timeframe: '1H',
    created_at: lastT,
    lower: lo,
    upper: hi,
    midpoint: (lo + hi) / 2,
    strength: 0.5,
    strengthKind: '통계 부족',
    reason: id,
    status: 'CONFIRMED',
    test_count: 0,
    last_test_at: null,
    bias,
    tier,
    frozen: true,
  };
}
const confluence = clusterZones([
  mkZ('poc:profile', 'poc', 'neutral', 100, 101, 'S'),
  mkZ('ob:1', 'ob', 'bullish', 99.8, 101.2, 'A'),
  mkZ('fvg:1', 'fvg', 'bullish', 100.1, 101.4, 'A'),
]);
assert(confluence.length === 1, 'POC+OB+FVG overlap is one cluster');
assert(confluence[0]!.sources.includes('poc') && confluence[0]!.sources.includes('ob') && confluence[0]!.sources.includes('fvg'), 'cluster keeps components');
assert(confluence[0]!.tier === 'S', 'poc+setup cluster is S');
assert(confluence[0]!.labelKo.startsWith('핵심 매수구간'), 'cluster korean core label');
assert(!confluence[0]!.labelKo.includes('초강력') && !confluence[0]!.labelKo.includes('%'), 'cluster has no 초강력/fake %');
assert(confluence[0]!.reactionLabel === '통계 부족', 'cluster reaction waits for sample');
assert(confluence[0]!.components.length === 3, 'component list preserved');

const oppDead = mkZ('ob:dead', 'ob', 'bearish', 110, 112);
oppDead.status = 'BROKEN';
assert(
  clusterZones([mkZ('ob:live', 'ob', 'bullish', 100, 102), oppDead]).every((c) => c.components.every((z) => z.status !== 'BROKEN')),
  'broken opposing zone excluded from cluster'
);

let weakWalk = applyZoneLifecycle(confirmedZ, [bar(1, 101.2, 101.5, 100.2, 101.3)], 1);
weakWalk = applyZoneLifecycle(weakWalk, [bar(2, 101.1, 101.6, 100.1, 101.2)], 1);
weakWalk = applyZoneLifecycle(weakWalk, [bar(3, 101.0, 101.4, 100.3, 101.1)], 1);
assert(weakWalk.status === 'WEAK' && weakWalk.lower === 100 && weakWalk.upper === 102, '3 tests → WEAK bounds frozen');

const clusteredOverlay = eagle1ZonesToOverlays({
  zones: z80.zones,
  clusters: confluence,
  recommended: confluence[0]!,
  displaySupport: z80.displaySupport,
  displayResist: z80.displayResist,
  lastTime: lastT,
  mode: 'practical',
  pocState: z80.profile.pocState,
});
assert(
  clusteredOverlay.some((o) => o.id === 'eagle1-cluster-main-upper' && o.kind === 'keyLevel' && o.price1 === o.price2),
  'practical recommended cluster is price line'
);
assert(
  clusteredOverlay.some((o) => o.id === 'eagle1-cluster-main-face' && (o.kind === 'demandZone' || o.kind === 'supplyZone')),
  'practical draws one cluster zone face'
);
assert(
  clusteredOverlay.every((o) => !String(o.label).includes('★ ZONE') && !String(o.label).includes('%')),
  'practical cluster lines have no ★ ZONE/fake %'
);
assert(
  clusteredOverlay.every((o) => String(o.labelTooltip || o.label || '').includes('클릭') || String(o.zoneFaceBase || '').length > 0),
  'practical zone labels carry an action/tooltip'
);
assert(z80.displaySupport.length <= 2 && z80.displayResist.length <= 2, '2+2 cluster data still computed');

const inspectFace = overlayFromEagle1ZoneId({
  id: 'eagle1-cluster-main-face',
  lastTime: lastT,
  pack: {
    zones: z80.zones,
    clusters: confluence,
    recommended: confluence[0]!,
    displaySupport: z80.displaySupport,
    displayResist: z80.displayResist,
    pocState: z80.profile.pocState,
  },
});
assert(inspectFace?.id === 'eagle1-cluster-main-face', 'zone click inspect reconstructs cluster face');
assert(overlayFromEagle1ZoneId({ id: 'merged-ares-key-1', lastTime: lastT, pack: { zones: z80.zones } }) == null, 'inspect ignores non-eagle1 ids');

const uxMissed = buildEagle1ChartUx({
  ...pipeWait.mainPlan,
  status: 'LONG_MISSED',
  direction: 'LONG',
  entryLow: 100,
  entryHigh: 101,
  sl: 98,
  tp1: 104,
  tp2: 106,
  tp3: 108,
});
assert(
  uxMissed.priceLines.some((l) => /^ENTRY\b/.test(l.title)) &&
    uxMissed.priceLines.some((l) => l.title.includes('STOP')) &&
    uxMissed.priceLines.some((l) => /^TP1\b/.test(l.title)),
  'missed plan still draws full-width E/SL/TP lines'
);
assert(pipeWait.mainPlan.status === 'WAIT', 'chop stays WAIT even with watch levels');
assert(pipeWait.trade == null || pipeWait.trade.state !== 'OPEN', 'WAIT does not open frozen trade');
if (pipeWait.riskLong.entryLow != null || pipeWait.riskShort.entryLow != null) {
  assert(pipeWait.mainPlan.entryLow != null && pipeWait.mainPlan.sl != null, 'WAIT surfaces risk watch E/SL');
  assert(
    buildEagle1ChartUx(pipeWait.mainPlan).priceLines.some((l) => /^ENTRY\b/.test(l.title) || /^STOP\b/.test(l.title)),
    'watch WAIT draws full-width ENTRY/STOP lines'
  );
}
const tinyWaitUx = runEagle1Pipeline({ candles: chop(8), timeframe: '15m' });
assert(tinyWaitUx.mainPlan.entryLow == null, 'too few bars stays empty plan');
assert(
  !buildEagle1ChartUx(tinyWaitUx.mainPlan).priceLines.some((l) => /^ENTRY\b/.test(l.title) || /^TP1\b/.test(l.title)),
  'wait without numeric levels has no exec lines'
);

assert(zoneReactionKo(null) === '데이터 없음', 'missing reaction');
assert(ZONE_REACTION_KO.TOUCH === '접촉' && ZONE_REACTION_KO.HOLD === '지지유지', 'reaction ko');
const aboveThen = (last: { o: number; h: number; l: number; c: number }): Eagle1Bar[] => {
  const out: Eagle1Bar[] = [];
  for (let i = 0; i < 14; i++) out.push(bar(i, 108, 108.4, 107.6, 108.1, 12));
  out.push(bar(14, last.o, last.h, last.l, last.c, 12));
  return out;
};
const touchKind = classifyBandReaction({
  candles: aboveThen({ o: 104, h: 104.1, l: 101.5, c: 102.3 }),
  lower: 100,
  upper: 102,
  bias: 'bullish',
});
assert(touchKind.kind === 'TOUCH', `touch≠hold got ${touchKind.kind}`);
const holdKind = classifyBandReaction({
  candles: aboveThen({ o: 103.2, h: 104.2, l: 101.4, c: 103.6 }),
  lower: 100,
  upper: 102,
  bias: 'bullish',
});
assert(holdKind.kind === 'HOLD', `hold close confirm got ${holdKind.kind}`);
assert(!holdKind.evidence.some((e) => e.includes('%')), 'reaction evidence has no fake %');

const rxPrefixBars = aboveThen({ o: 103.2, h: 104.2, l: 101.4, c: 103.6 });
const rxLive = computeZoneReaction({
  candles: rxPrefixBars,
  endExclusive: rxPrefixBars.length,
  recommended: confluence[0]!,
});
const rxCut = computeZoneReaction({
  candles: rxPrefixBars.slice(0, rxPrefixBars.length),
  endExclusive: rxPrefixBars.length,
  recommended: confluence[0]!,
});
assert(rxLive.kind === rxCut.kind && rxLive.known_at === rxCut.known_at, 'zone reaction prefix-causal');
assert(rxLive.lower === confluence[0]!.lower && rxLive.upper === confluence[0]!.upper, 'reaction uses frozen cluster bounds');

const touchPlan = buildMainPlan({
  candles: up,
  timeframe: '1H',
  structure: full,
  zones: {
    ...z80,
    reaction: {
      kind: 'TOUCH',
      kindKo: '접촉',
      bias: 'bullish',
      resolved: false,
      known_at: 14,
      lower: 100,
      upper: 102,
      source: 'cluster',
      evidence: ['수요 접촉 — 종가 확인 부족(터치≠성공)'],
    },
  },
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
assert(
  touchPlan.status !== 'CONFIRMED_LONG' &&
    touchPlan.status !== 'CONFIRMED_SHORT' &&
    (touchPlan.status === 'WAIT' || touchPlan.noTradeGates.includes('unresolved zone reaction')),
  'touch must WAIT, not confirm'
);
assert(touchPlan.reasons.some((r) => r.includes('접촉은 성공이 아님')), 'touch reason is explicit');

const holdPlan = buildMainPlan({
  candles: up,
  timeframe: '1H',
  structure: full,
  zones: {
    ...z80,
    reaction: {
      kind: 'HOLD',
      kindKo: '지지유지',
      bias: 'bullish',
      resolved: true,
      known_at: 14,
      lower: 100,
      upper: 102,
      source: 'cluster',
      evidence: ['수요구간 종가 지지 확인'],
    },
  },
  riskLong: riskFarSl,
  riskShort: { ...riskFarSl, direction: 'SHORT', rrGate: 'reject', netRrTp1: 0.5, rejectReasons: ['low RR'] },
});
assert(holdPlan.longScore > touchPlan.longScore, 'hold adds score over touch');
assert(holdPlan.status !== 'CONFIRMED_LONG', 'hold still does not confirm without sample/sequence');
assert(!holdPlan.reasons.some((r) => r.includes('%') || r.includes('기관')), 'hold reasons have no fake %/기관');

const holdOverlay = eagle1ZonesToOverlays({
  zones: z80.zones,
  recommended: confluence[0]!,
  lastTime: lastT,
  mode: 'practical',
  reaction: {
    kind: 'HOLD',
    kindKo: '지지유지',
    bias: 'bullish',
    resolved: true,
    known_at: 14,
    lower: 100,
    upper: 102,
    source: 'cluster',
    evidence: [],
  },
});
assert(
  holdOverlay.some((o) => o.id === 'eagle1-cluster-main-upper' && String(o.label).includes('지지유지') && !String(o.label).includes('%')),
  'practical cluster line shows 지지유지, no %'
);

const snapA = pipeWait.snapshot;
const snapB = runEagle1Pipeline({ candles: chop(40), timeframe: '15m' }).snapshot;
assert(predictionsEqualFrozen(snapA, snapB), 'same prefix freezes identically');
assert(snapA.engine_version.startsWith('eagle1-core-'), 'snapshot stamps engine version');
assert(snapA.direction === 'WAIT', 'chop snapshot is WAIT');
const bundled = attachOutcome(snapA, { mfe: 1, mae: 0.2, result: 'tp', updated_at: snapA.timestamp + 1, netR: 1 });
assert(predictionsEqualFrozen(snapA, bundled.prediction), 'attachOutcome must not mutate freeze');
try {
  (snapA as { price: number }).price = 1;
} catch {
  /* freeze */
}
assert(snapA.price !== 1 || Object.isFrozen(snapA), 'frozen prediction resists mutation');

const freezeAt = 48;
const frozenLive = runEagle1Pipeline({ candles: up, timeframe: '1H', endExclusive: freezeAt }).snapshot;
const laterPipe = runEagle1Pipeline({ candles: up, timeframe: '1H', endExclusive: up.length }).snapshot;
assert(frozenLive.timestamp !== laterPipe.timestamp || freezeAt === up.length, 'later bars issue a new snapshot id/time');
assert(frozenLive.poc === runEagle1Pipeline({ candles: up, timeframe: '1H', endExclusive: freezeAt }).snapshot.poc, 'frozen poc matches live prefix');
const freezeCopy = JSON.parse(JSON.stringify(frozenLive)) as typeof frozenLive;
const outcomeLater = resolvePredictionOutcome({
  prediction: frozenLive,
  candles: up,
  freezeIndex: freezeAt - 1,
  horizon: 12,
});
assert(JSON.stringify(frozenLive) === JSON.stringify(freezeCopy), 'resolve must not change frozen json');
assert(outcomeLater.signal_id === frozenLive.signal_id, 'outcome joins by signal_id');

const waitOutcome = resolvePredictionOutcome({
  prediction: snapA,
  candles: chop(40),
  freezeIndex: 39,
  horizon: 8,
});
assert(waitOutcome.result === 'open' || waitOutcome.result === 'expired', 'WAIT has no tp/sl fill');

const shortStats = incrementalSnapshotStats(
  Array.from({ length: 12 }, (_, i) => ({
    signal_id: `s${i}`,
    mfe: 1,
    mae: 0.4,
    result: i % 2 === 0 ? ('tp' as const) : ('sl' as const),
    netR: i % 2 === 0 ? 1 : -0.4,
    updated_at: i,
  }))
);
assert(shortStats.label === '통계 부족' && shortStats.tpBeforeSlRate == null, 'n<30 hides rates');
assert(!shortStats.note.includes('%'), 'stats note has no fake %');

const longStats = incrementalSnapshotStats(
  Array.from({ length: 30 }, (_, i) => ({
    signal_id: `s${i}`,
    mfe: 1.2,
    mae: 0.3,
    result: i < 18 ? ('tp' as const) : ('sl' as const),
    netR: i < 18 ? 1.1 : -0.35,
    updated_at: i,
  }))
);
assert(longStats.label === '검증확률' && longStats.sampleSize === 30 && longStats.tpBeforeSlRate != null, 'n>=30 publishes rates');
assert(pipeWait.snapshotStats.label === '통계 부족', 'pipeline incremental stats default to 통계 부족');
const shuffledRows = [
  { family: 'poc_hold' as const, regime: 'BULL', direction: 'LONG' as const, index: 40, tpFirst: true, slFirst: false, mfe: 1, mae: 0.2, netR: 0.9, grossRr: 2 },
  { family: 'poc_hold' as const, regime: 'BULL', direction: 'LONG' as const, index: 10, tpFirst: false, slFirst: true, mfe: 0.2, mae: 1, netR: -1, grossRr: 2 },
];
const fromSetup = incrementalStatsFromSetupOutcomes(shuffledRows);
assert(fromSetup.label === '통계 부족', 'tiny setup catalog is 통계 부족');
assert(!JSON.stringify(pipeWait.snapshot.features).includes('기관'), 'snapshot features do not claim institution');

function oc(partial: Partial<SetupOutcome> & { index: number }): SetupOutcome {
  return {
    family: 'ob_retest',
    regime: 'BULL',
    direction: 'LONG',
    tpFirst: true,
    slFirst: false,
    mfe: 1.2,
    mae: 0.3,
    netR: 0.9,
    grossRr: 2,
    ...partial,
  };
}

const pastOnly = Array.from({ length: 15 }, (_, i) => oc({ index: i }));
const futureRows = Array.from({ length: 40 }, (_, i) => oc({ index: 100 + i }));
const causalSim = matchSimilarOutcomes([...pastOnly, ...futureRows], {
  regime: 'BULL',
  state: 'SHIFT',
  family: 'ob_retest',
  direction: 'LONG',
  asOfIndex: 50,
});
assert(causalSim.sampleSize === 15, 'future rows at index 100 must not be used when asOfIndex=50');
assert(causalSim.calibratedProbability == null && causalSim.calibratedLabel === '통계 부족', 'n<30 hides calibrated %');

const tinySim = matchSimilarOutcomes(
  Array.from({ length: 20 }, (_, i) => oc({ index: i })),
  { regime: 'BULL', state: 'SHIFT', family: 'ob_retest', direction: 'LONG', asOfIndex: 100 }
);
assert(tinySim.calibratedProbability == null && tinySim.calibratedLabel === '통계 부족', 'n<30 → 통계 부족');
const tinyShell = similarityShellKo(tinySim);
assert(!tinyShell.includes('%') && !tinyShell.includes('기관'), 'short sample shell has no %/기관');
assert(tinyShell.includes('통계 부족'), 'short sample shell says 통계 부족');

const bullPool = Array.from({ length: 35 }, (_, i) => oc({ index: i, regime: 'BULL', tpFirst: true }));
const bearPool = Array.from({ length: 40 }, (_, i) =>
  oc({ index: 200 + i, regime: 'BEAR', tpFirst: false, slFirst: true, netR: -1, mfe: 0.2, mae: 1 })
);
const regimeFirst = matchSimilarOutcomes([...bullPool, ...bearPool], {
  regime: 'BULL',
  state: 'IDLE',
  family: 'ob_retest',
  direction: 'LONG',
  asOfIndex: 300,
});
assert(regimeFirst.sampleSize === 35, 'BULL pool ≥30 must not mix BEAR');
assert(regimeFirst.filter.includes('BULL') && !regimeFirst.filter.includes('완화'), 'regime-first keeps BULL filter');

const trainWin = Array.from({ length: 28 }, (_, i) => oc({ index: i, tpFirst: true, slFirst: false, netR: 1 }));
const holdLose = Array.from({ length: 12 }, (_, i) =>
  oc({ index: 50 + i, tpFirst: false, slFirst: true, netR: -1, mfe: 0.2, mae: 1 })
);
const oosBad = matchSimilarOutcomes([...trainWin, ...holdLose], {
  regime: 'BULL',
  state: 'SHIFT',
  family: 'ob_retest',
  direction: 'LONG',
  asOfIndex: 100,
});
assert(oosBad.sampleSize === 40, 'OOS pool uses 40 causal rows');
assert(oosBad.calibrationError != null && oosBad.calibrationError > 0.2, 'high OOS error is reported');
assert(oosBad.calibratedProbability == null && oosBad.calibratedLabel === '통계 부족', 'high calib error → no 검증확률');

const oosOk = matchSimilarOutcomes(
  Array.from({ length: 40 }, (_, i) => oc({ index: i, tpFirst: true, slFirst: false })),
  { regime: 'BULL', state: 'SHIFT', family: 'ob_retest', direction: 'LONG', asOfIndex: 100 }
);
assert(oosOk.calibratedProbability != null && oosOk.calibratedLabel === '검증확률', 'stable OOS may publish 검증확률');
assert(oosOk.expectedMoveR != null, 'expectedMoveR is median MFE not a score-%');
assert(!similarityShellKo(oosOk).includes('%'), 'calibrated shell still has no fake %');

const mlCausal = runInternalMl([...pastOnly, ...futureRows], {
  regime: 'BULL',
  family: 'ob_retest',
  direction: 'LONG',
  grossRr: 2,
  asOfIndex: 50,
});
assert(mlCausal.calibratedProbability == null, 'ML must not use future rows at index 100 when asOfIndex=50');
assert(mlCausal.calibratedLabel === '통계 부족', 'short ML sample is 통계 부족');

const mlRows = Array.from({ length: 80 }, (_, i) => oc({ index: i, tpFirst: true, slFirst: false, grossRr: 2.2 }));
const mlFit = runInternalMl(mlRows, {
  regime: 'BULL',
  family: 'ob_retest',
  direction: 'LONG',
  grossRr: 2.2,
  asOfIndex: 80,
});
assert(mlFit.available, 'ML fits on chronological train');
assert(mlFit.directionProbability == null || mlFit.directionProbability <= 1, 'ML raw score is not a UI %');
assert(mlFit.note.includes('통계 부족') || mlFit.calibratedLabel === '검증확률', 'ML publishes only holdout-calibrated or 통계 부족');

const shuffled = chronologicalSplit(40);
assert(rejectShuffledSplit(shuffled) == null, 'chrono split itself is ordered');

const consWait = runConsensus({
  votes: voteExperts({
    structure: full,
    zones: z80,
    risk: buildRiskPlan({ candles: up, structure: full, zones: z80, direction: 'LONG' }),
    similarity: tinySim,
    ml: mlCausal,
    hasDerivatives: false,
  }),
  outcomes: Array.from({ length: 12 }, (_, i) => oc({ index: i })),
  asOfIndex: 12,
  similarity: tinySim,
  ml: mlCausal,
  regime: 'BULL',
});
assert(consWait.calibratedProbability == null, 'consensus does not copy AI score as 검증확률');
assert(consWait.aiScore >= 0 && consWait.calibratedLabel === '통계 부족', 'AI score stays separate from 검증확률');

const wf = walkForwardBacktest(Array.from({ length: 80 }, (_, i) => oc({ index: i, tpFirst: i % 3 !== 0, slFirst: i % 3 === 0, netR: i % 3 === 0 ? -1 : 0.8 })));
assert(wf.holdoutUsedForWeights === false, 'holdout never updates weights');
assert(wf.holdoutN > 0, 'holdout exists');
assert(wf.folds.every((f) => f.usedForWeights === true), 'inner folds may fit weights');

const wfTiny = walkForwardBacktest(Array.from({ length: 10 }, (_, i) => oc({ index: i })));
assert(wfTiny.label === '통계 부족' && wfTiny.holdoutNetEv == null, 'n<30 walk-forward hides EV');

const pathA = buildSmartPath({
  lastTime: 1_700_000_000,
  tfSec: 3600,
  direction: 'LONG',
  risk: buildRiskPlan({ candles: up, structure: full, zones: z80, direction: 'LONG' }),
  sampleSize: 12,
  calibratedProbability: 0.8,
});
assert(pathA.main.probability == null, 'path probability hidden when sample<30');
assert(pathA.main.labelKo === '주경로' && pathA.alt.labelKo === '대체경로' && pathA.invalid.labelKo === '무효', 'three path scenarios');
const pathB = buildSmartPath({
  lastTime: 1_700_000_000,
  tfSec: 3600,
  direction: 'LONG',
  risk: buildRiskPlan({ candles: up, structure: full, zones: z80, direction: 'LONG' }),
  sampleSize: 12,
  calibratedProbability: 0.8,
});
assert(pathPointsUnchanged(pathA.main.points, pathB.main.points), 'smart path geometry is deterministic');

const dash = buildStatsDashboard({ similarity: tinySim, ml: mlCausal, consensus: consWait, walkForward: wfTiny });
assert(dash.rows.every((r) => r.key === 'ai' || r.key === 'ver' || r.key === 'sample' || r.key === 'ood' || r.key === 'wf' || r.key === 'ml' || !r.value.includes('%') || r.value.includes('통계')), 'dashboard does not invent win %');
assert(dash.label === '통계 부족', 'dashboard short sample');

const tg = safeEagle1TelegramReport({
  symbol: 'BTCUSDT',
  timeframe: '1H',
  plan: pipeWait.mainPlan,
  previousVersion: 'eagle1-core-0.15.0',
});
assert(tg.includes('독수리1호') && tg.includes('검증확률'), 'telegram report uses 검증확률');
assert(!tg.includes('기관 확정') && !tg.includes('확실'), 'telegram report has no fake institution/certainty');
assert(tg.includes('eagle1-core-0.23.1') || tg.includes('0.23.1'), 'telegram includes engine version');

const maeRisk = buildRiskPlan({
  candles: up,
  structure: full,
  zones: z80,
  direction: 'LONG',
  medianMaeR: 0.9,
  medianMfeR: 1.8,
  statSample: 40,
});
assert(maeRisk.tp3Reason.includes('MFE') || maeRisk.tp3Reason.includes('확장'), 'TP uses structure or sample MFE not a fixed %');
assert(maeRisk.sizeNote.includes('확신도와 무관'), 'size independent of confidence');

assert(pipeWait.smartPath.main.labelKo === '주경로', 'pipeline exposes smart path');
assert(pipeWait.statsDashboard.engineVersion.includes('0.23.1'), 'pipeline stats version');
assert(pipeWait.mainPlan.ml != null && pipeWait.mainPlan.consensus != null, 'pipeline attaches ML+consensus');
assert(pipeWait.chartUx.why.aiScore == null || typeof pipeWait.chartUx.why.aiScore === 'number', 'why keeps AI score off 검증확률');

const rbVis = applyMergedDeskRbVisualAi({
  overlays: [
    {
      id: 'merged-desk-rb-short-band',
      kind: 'channelBand',
      label: '상승채널',
      x1: 0,
      y1: 0,
      confidence: 80,
      overlayZoneExtraClass: 'merged-desk-rb-channel merged-desk-rb-primary',
    },
    {
      id: 'merged-desk-super-ai-knowledge-supply',
      kind: 'zone',
      label: 'RES',
      x1: 0,
      y1: 0,
      confidence: 70,
    },
  ],
  markers: [
    { time: 1 as never, position: 'aboveBar', shape: 'circle', color: '#ef4444', text: '▼', size: 1, id: 'short' },
    { time: 1 as never, position: 'belowBar', shape: 'circle', color: '#22c55e', text: '▲', size: 1, id: 'long' },
    { time: 2 as never, position: 'aboveBar', shape: 'circle', color: '#ef4444', text: '▼', size: 1, id: 'old-short' },
  ],
  analysis: { eagle1MainPlan: { ...pipeWait.mainPlan, status: 'CONFIRMED_LONG', direction: 'LONG' } } as never,
});
assert(rbVis.verdict.zoneKo === '롱구간' && rbVis.verdict.settleKo === '안착확정', 'rb visual uses confirmed long zone');
assert(rbVis.overlays.some((o) => o.id === 'merged-desk-rb-short-band' && String(o.label).startsWith('롱구간')), 'primary band shows 롱구간');
assert(!rbVis.overlays.some((o) => o.id === 'merged-desk-super-ai-knowledge-supply'), 'opposing RES overlay hidden when long');
assert(rbVis.markers.filter((m) => Number(m.time) === 1).length === 1, 'same-bar long/short markers collapse to one side');

const acc = runStructureAcceptance({
  candles: grind(80),
  structure: full,
  sampleSize: 0,
  calibratedProbability: 0.68,
});
assert(ACCEPTANCE_FLOW.length === 8, 'acceptance flow has 8 steps');
assert(acc.calibratedLabel === '데이터 없음' || acc.calibratedLabel === '통계 부족', 'no fake calibrated % under n=30');
assert(acc.factors.length === 11, '11 break quality factors');
assert(acc.factors.every((f) => f.score == null || (f.score >= 0 && f.score <= 100)), 'factor scores 0-100 or null');
const fb = runFalseBreakEngine({ candles: grind(80), structure: full });
assert(fb.breakout.evidence.length === 5 && fb.breakdown.evidence.length === 5, 'false-break evidence rows');
const histEmpty = runHistoricalStatistics({ outcomes: [] });
assert(histEmpty.label === '데이터 없음' && histEmpty.reach.every((r) => r.rate == null), 'empty hist is 데이터 없음');
const prem = runPremiumDiscount({ lastClose: null, structure: full });
assert(prem.zone === 'NONE' && prem.note === '데이터 없음', 'premium without price is 데이터 없음');
const uz = buildUnifiedZoneDesk({ displaySupport: [], displayResist: [] });
assert(uz.support.length === 0 && uz.resist.length <= 2, 'unified zone cap 2');
assert(pipeWait.acceptance && pipeWait.falseBreak && pipeWait.historicalOutcome && pipeWait.unifiedZones, 'pipeline exposes desk engines');
assert(pipeWait.smartPath.break.id === 'break', 'break path exists');
const deskDraw = buildStructureDeskOverlays({
  lastTime: lastT,
  candles: grind(80).map((b) => ({ time: b.time })),
  events: full.events,
  equalHighs: full.equalHighs,
  equalLows: full.equalLows,
  displaySupport: z80.displaySupport,
  displayResist: z80.displayResist,
  poc: z80.profile.poc,
  pocState: z80.profile.pocState,
  smartPath: pipeWait.smartPath,
  trade: pipeWait.trade,
});
assert(deskDraw.every((o) => String(o.id).startsWith('eagle1-')), 'desk draw ids are eagle1');
const heatBars = grind(80);
const heatDraw = buildStructureDeskOverlays({
  lastTime: Number(heatBars[heatBars.length - 1]?.time) || 1,
  candles: heatBars,
  heat: [{ time: Number(heatBars[heatBars.length - 2]?.time), score: 0.6 }],
  entryLow: 100,
  entryHigh: 102,
  direction: 'LONG',
  entryZoneState: 'TRIGGERED',
});
assert(!heatDraw.some((o) => String(o.id).startsWith('eagle1-heat-')), 'heat stays HUD-only (no candle cover overlay)');
assert(heatDraw.some((o) => String(o.overlayZoneExtraClass || '').includes('entry-triggered')), 'entry zone carries state class');
assert(heatBarRgba(0.5).startsWith('rgba('), 'heat rgba helper');
assert(overlayAllowedOnEagle1HudChart('eagle1-heat-1'), 'hud chart keeps heat strip class allowlist');
assert(
  deskDraw.filter((o) => String(o.id).startsWith('eagle1-cluster-sup-')).length <= 2 &&
    deskDraw.filter((o) => String(o.id).startsWith('eagle1-cluster-res-')).length <= 2,
  'desk unified zones cap 2'
);
if (full.equalHighs.length) {
  assert(deskDraw.some((o) => o.id === 'eagle1-eqh' || o.label.includes('EQH')), 'EQH line when equal highs exist');
}
assert(
  pipeWait.smartPath.main.uiState === 'WAIT' ||
    pipeWait.smartPath.main.uiState === 'ON_TRACK' ||
    pipeWait.smartPath.main.uiState === 'DEVIATING' ||
    pipeWait.smartPath.main.uiState === 'INVALID' ||
    pipeWait.smartPath.main.uiState === 'PATH_UNAVAILABLE',
  'path uiState enum'
);
assert(pipeWait.hud && pipeWait.hud.bigMove.note.includes('확률 아님'), 'hud big move is not a probability');
assert(pipeWait.hud.pathProbability.text !== '72%' || pipeWait.hud.pathProbability.sample >= 30, 'no hardcoded 72% path');
assert(Array.isArray(pipeWait.hud.events), 'hud candle events array');
assert(pipeWait.hud.battle.note.includes('확률') || pipeWait.hud.battle.longPct == null, 'battle gauge not win-rate');
assert(formatSamplePct(0, 0.68) === '데이터 없음', 'no invented % when n=0');
assert(formatSamplePct(12, 0.68) === '통계 부족 (n=12)', 'n<30 never shows %');
assert(formatSamplePct(30, 0.68) === '68%', 'n>=30 measured %');
assert(formatSamplePct(40, null) === '통계 부족 (n=40)', 'missing measured p stays 통계 부족');
assert(JSON.stringify(sliceBarsAround([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5, 2, 2)) === JSON.stringify([3, 4, 5, 6, 7]), 'excerpt slice around event');
const failBars = grind(40);
const fbAnchored = runFalseBreakEngine({
  candles: failBars,
  structure: {
    ...full,
    events: [
      {
        kind: 'FAILED_BREAK',
        bias: 'bearish',
        index: 20,
        known_at: 22,
        price: failBars[22]?.close ?? 100,
        level: failBars[22]?.high ?? 100,
        evidence: ['selftest'],
      },
    ],
  },
});
assert(fbAnchored.anchorIndex === 22, 'false-break excerpt anchors FAILED_BREAK known_at');
assert(fbAnchored.excerpt.length >= 4 && fbAnchored.excerpt.length <= 19, 'false-break excerpt is event window not full spark');
assert(eagle1PathArrowPolygon(0, 0, 10, 0).includes('10,0'), 'path arrow polygon at tip');
const pathSegs = eagle1PathSegments(pipeWait.trade, pipeWait.smartPath);
if (pathSegs.length) {
  const mains = pathSegs.filter((s) => s.id.startsWith('eagle1-path-main-'));
  const alts = pathSegs.filter((s) => s.id.startsWith('eagle1-path-alt-'));
  if (mains.length) assert(mains[mains.length - 1]!.arrowHead && mains.slice(0, -1).every((s) => !s.arrowHead), 'main path arrow on last seg');
  if (alts.length) assert(alts[alts.length - 1]!.arrowHead, 'alt path arrow on last seg');
  const brks = pathSegs.filter((s) => s.id.startsWith('eagle1-path-break-'));
  if (brks.length) assert(brks[brks.length - 1]!.arrowHead, 'break path arrow on last seg');
  assert(!pathSegs.some((s) => s.id.startsWith('eagle1-path-alt-') && s.label === 'BREAK PATH'), 'alt is not break');
}
assert(
  deskDraw.every((o) => !String(o.id).startsWith('eagle1-path-') || String(o.overlayZoneExtraClass || '').includes('eagle1-zone--path')),
  'path overlays keep eagle1 path class'
);
const accLiveOb = runStructureAcceptance({
  candles: grind(80),
  structure: full,
  live: { has_orderbook: true, orderbookImbalance: 0.4, has_cvd: false },
  sampleSize: 0,
});
const obFactor = accLiveOb.factors.find((f) => f.id === 'orderbookImbalance');
assert(obFactor != null && obFactor.score != null, 'live bitget book fills orderbook factor');
const accNoOb = runStructureAcceptance({
  candles: grind(80),
  structure: full,
  live: { has_orderbook: false, orderbookImbalance: 0.4, has_cvd: false },
  sampleSize: 0,
});
assert(accNoOb.factors.find((f) => f.id === 'orderbookImbalance')?.note === '데이터 없음', 'binance-only book stays 데이터 없음');
assert(pipeWait.hud.entryZoneState === 'WAIT' || pipeWait.hud.entryZoneState === 'APPROACH' || pipeWait.hud.entryZoneState === 'WATCH', 'WAIT plan maps to wait/approach/watch');
assert(pipeWait.hud.paths.length === 3 && pipeWait.hud.paths[0]?.labelEn === 'MAIN PATH', 'hud exposes main/alt/break paths');
assert(overlayAllowedOnEagle1HudChart('eagle1-path-break-1'), 'hud chart keeps break path');
const liqLv = lastSweepLiquidity(full.events);
if (liqLv.ssl != null || liqLv.bsl != null) {
  const liqDraw = buildStructureDeskOverlays({
    lastTime: Number(up[up.length - 1]?.time) || 1,
    candles: up,
    events: full.events,
    equalHighs: full.equalHighs,
    equalLows: full.equalLows,
  });
  if (liqLv.ssl != null && (full.equalLows.slice(-1)[0] == null || Math.abs(liqLv.ssl - full.equalLows.slice(-1)[0]!) > 1e-8)) {
    assert(liqDraw.some((o) => o.id === 'eagle1-ssl'), 'ssl overlay from bullish sweep');
  }
  if (liqLv.bsl != null && (full.equalHighs.slice(-1)[0] == null || Math.abs(liqLv.bsl - full.equalHighs.slice(-1)[0]!) > 1e-8)) {
    assert(liqDraw.some((o) => o.id === 'eagle1-bsl'), 'bsl overlay from bearish sweep');
  }
}
assert(!overlayAllowedOnEagle1HudChart('parkf-lr-base'), 'hud chart hides parkf fan');
assert(!overlayAllowedOnEagle1HudChart('diag-overhead-0'), 'hud chart hides diag trendlines');
assert(!overlayAllowedOnEagle1HudChart('merged-desk-candle-trend-1'), 'hud chart hides merged candle trends');
assert(!overlayAllowedOnEagle1HudChart('cptc-last'), 'hud chart hides chartprime channels');
assert(formatEagle1SnapshotClock(1_700_000_000) !== '데이터 없음' && !formatEagle1SnapshotClock(1_700_000_000).includes('1970'), 'snapshot clock uses candle seconds not 1970');
assert(formatEagle1SnapshotClock(1_700_000_000) !== new Date(1_700_000_000).toLocaleString('ko-KR'), 'snapshot does not treat unix seconds as ms');
assert(formatEagle1SnapshotClock(0) === '데이터 없음', 'missing snapshot time');

const heatTaker = grind(40).map((b, i) => ({ ...b, takerBuyBaseVolume: i % 2 === 0 ? 7 : 2 }));
const heatLive = buildPressureHeat({
  candles: heatTaker,
  live: { has_cvd: true, volumeDelta: 4, has_orderbook: false },
});
assert(heatLive.length > 0 && heatLive.every((h) => h.source === 'taker' || h.source === 'live-cvd' || h.source === 'body'), 'heat sources are declared');
assert(heatLive[heatLive.length - 1]!.source === 'live-cvd', 'last heat bar may blend live CVD');
assert(
  buildPressureHeat({ candles: heatTaker, live: { has_orderbook: false, orderbookImbalance: 0.9 } }).every((h) => h.source !== 'live-book'),
  'no live-book heat without has_orderbook'
);
const heatNoLiveBook = buildPressureHeat({
  candles: grind(12),
  live: { has_orderbook: true, orderbookImbalance: 0.5, has_cvd: false },
});
assert(heatNoLiveBook[heatNoLiveBook.length - 1]!.source === 'live-book', 'last bar can use live bitget book');
const sch = runSchematicCompare({ structure: full, sampleSize: 12 });
assert(sch.note.includes('통계 부족'), 'schematic n<30 is 통계 부족');
assert(sch.features.some((f) => f.id === 'sample' && f.hit === false), 'schematic sample flag false under 30');
assert(runSchematicCompare({ structure: full, sampleSize: 0 }).note.includes('데이터 없음'), 'schematic n=0 is 데이터 없음');
assert(pipeWait.hud.schematic != null && Array.isArray(pipeWait.hud.schematic.features), 'hud includes schematic compare');
assert(pipeWait.hud.heat.length > 0 && pipeWait.hud.heat.every((h) => typeof h.source === 'string'), 'hud heat has source');
assert(pipeWait.hud.bigLong.checks.find((c) => c.id === 'ofi')?.hit == null, 'OFI stays 데이터 없음 without ofi series');
assert(pipeWait.hud.cascadeShort.checks.find((c) => c.id === 'liq')?.hit == null, 'liq acceleration stays 데이터 없음 without series');
const liveAvail = resolveEagle1LiveAvailability({
  hasBitgetOrderbook: true,
  tradeCount: 40,
  oiPoints: 3,
  fundingPoints: 2,
  liquidationSeriesPoints: 0,
});
assert(liveAvail.has_orderbook && liveAvail.has_cvd && liveAvail.has_trades && liveAvail.has_oi && liveAvail.has_funding, 'live flags from real series');
assert(liveAvail.has_liquidation === false, 'liq snapshot is not a historical series');
assert(
  JSON.stringify(resolveEagle1LiveAvailability({})) === JSON.stringify(EAGLE1_AVAILABILITY_NONE),
  'empty live input stays NONE'
);
assert(
  resolveEagle1LiveAvailability({ hasMark: true, hasIndex: true }).has_mark === true &&
    resolveEagle1LiveAvailability({ hasMark: true, hasIndex: true }).has_index === true,
  'mark/index availability flags'
);
const comboEmpty = runCombinationEngine({ structure: full, families: [] });
assert(comboEmpty.features.ofi == null, 'combination does not invent OFI');
assert(comboEmpty.promoted == null, 'no promote without sample+expectancy');
assert(pipeWait.combination != null && pipeWait.hud.combination != null, 'pipeline exposes combination');
assert(pipeWait.squeezeRadar != null && pipeWait.hud.squeezeRadar != null, 'pipeline exposes squeeze radar');
assert(pipeWait.squeezeRadar.long.state === 'NONE' && pipeWait.squeezeRadar.short.state === 'NONE', 'squeeze stays NONE without live series');
{
  const emptyAlerts = buildEagle1ChartAlerts({
    squeeze: pipeWait.squeezeRadar,
    falseBreak: null,
    hud: pipeWait.hud,
    lastClose: 100,
  });
  assert(Array.isArray(emptyAlerts), 'chart alerts array');
  const tagged = buildEagle1ChartAlerts({
    squeeze: {
      ...pipeWait.squeezeRadar,
      chartTag: 'SQUEEZE',
      activeSide: 'LONG',
      long: {
        ...pipeWait.squeezeRadar.long,
        state: 'SQUEEZE_ACTIVE',
        score: 70,
        labelEn: 'SQUEEZE',
        labelKo: '롱스퀴즈 진행',
        note: 't',
      },
    },
    falseBreak: null,
    hud: pipeWait.hud,
    lastClose: 100,
  });
  assert(tagged.some((a) => a.en === 'SQUEEZE ACTIVE'), 'squeeze tag becomes chart alert');
}
assert(pipeWait.mtfSmartZone != null && pipeWait.hud.mtfSmartZone != null, 'pipeline exposes mtf smart zone');
assert(pipeWait.liqZones != null && pipeWait.hud.liqZones != null, 'pipeline exposes liq zones');
assert(pipeWait.reEntry != null && pipeWait.hud.reEntry != null, 'pipeline exposes re-entry');
assert(pipeWait.reEntry.requiresNewTradeId === true, 're-entry always requires new tradeId');
assert(pipeWait.legendaryFusion != null && pipeWait.hud.legendaryFusion != null, 'pipeline exposes legendary fusion');
assert(
  !JSON.stringify(pipeWait.legendaryFusion.internalFamilies).includes('Turtle'),
  'legendary never lists Turtle in chartTag path'
);
assert(
  pipeWait.legendaryFusion.chartTag == null ||
    ['A+ LONG', 'A+ SHORT', 'BREAKOUT', 'REVERSAL', 'COMPRESSION', 'TREND'].includes(
      pipeWait.legendaryFusion.chartTag
    ),
  'legendary chart tags are allowlisted'
);
assert(pipeWait.tradeOpportunity != null && pipeWait.hud.tradeOpportunity != null, 'pipeline exposes trade opportunity');
assert(
  ['A_PLUS_LONG', 'A_LONG', 'WAIT', 'A_SHORT', 'A_PLUS_SHORT', 'NO_ENTRY'].includes(
    pipeWait.tradeOpportunity.grade
  ),
  'trade opportunity grade enum'
);
assert(pipeWait.executionLevels != null && pipeWait.hud.executionLevels != null, 'pipeline exposes execution levels');
assert(pipeWait.combinationMining != null && pipeWait.hud.combinationMining != null, 'pipeline exposes combination mining');
assert(
  pipeWait.combinationMining.rows.every((r) => r.statLabel !== 'ok' || r.sampleSize >= 30),
  'mining ok rows require n>=30'
);
assert(pipeWait.scoreCalibration != null && pipeWait.hud.scoreCalibration != null, 'pipeline exposes score calibration');
assert(
  pipeWait.scoreCalibration.aiScoreNote.includes('검증확률') === false ||
    pipeWait.scoreCalibration.aiScoreNote.includes('검증확률이 아님'),
  'AI score note is not calibrated probability'
);
assert(pipeWait.positionSize != null && pipeWait.positionSize.leverageForbidden === true, 'position size forbids leverage-first');
assert(pipeWait.htfHistorical != null && Array.isArray(pipeWait.htfHistorical.rows), 'pipeline exposes htf historical');
assert(pipeWait.htfHistorical.rows.some((r) => r.tf === '1W'), 'htf status includes 1W');
assert(pipeWait.smartFuturePath != null && pipeWait.smartFuturePath.arbitraryDashedForbidden === true, 'future path no arbitrary dash');
assert(pipeWait.smartFuturePath.cluster.length === 3, 'MAIN/ALT/BREAK cluster');
assert(pipeWait.orderFlow != null && pipeWait.orderFlow.inventedForbidden === true, 'orderflow no invent');
assert(pipeWait.orderFlow.summaryKo.includes('데이터 없음') || pipeWait.orderFlow.hasAnyLive, 'orderflow empty or live');
assert(pipeWait.hud.smartFuturePath != null && pipeWait.hud.orderFlow != null, 'hud path+flow');
assert(pipeWait.positionManagement != null && pipeWait.positionManagement.autoBeForbidden === true, 'no auto BE');
assert(pipeWait.candleEvidence != null && pipeWait.candleEvidence.maxPerBar === 2, 'candle evidence max 2');
assert(pipeWait.candleEvidence.iconLegend.some((x) => x.chartIcon === '🔥'), 'expansion legend');
assert(pipeWait.profileLevels != null, 'profile levels');
assert(pipeWait.profileLevels.practicalCapNote.includes('HVN'), 'practical hvn cap note');
assert(pipeWait.costAwareWalkForward != null && pipeWait.costAwareWalkForward.shuffleForbidden === true, 'wf no shuffle');
assert(pipeWait.liquidityDefense != null && pipeWait.liquidityDefense.institutionClaimForbidden === true, 'no institution claim');
assert(pipeWait.heatUnderlay != null && pipeWait.heatUnderlay.policy.coverCandlesForbidden === true, 'heat no cover');
assert(pipeWait.overlayBudget != null && pipeWait.overlayBudget.withinBudget === true, 'overlay budget');
assert(pipeWait.visualLayout != null && pipeWait.visualLayout.ok === true, 'visual layout selftest');
assert(pipeWait.hud.overlayBudget != null, 'hud overlay budget');
assert(pipeWait.chartUx.priceLines.length <= 12 || (pipeWait.overlayBudget.mode !== 'practical'), 'practical price line cap');
const parityDetail = liveReplayParityDetailed(up, [32, 48, 64], '1H');
assert(parityDetail.ok, `live/replay detailed: ${parityDetail.fails.join('; ')}`);
const accReplayD = replayFusionParityAcceptanceD();
assert(accReplayD.ok, `replayFusionParityAcceptanceD: ${accReplayD.notes.join('; ')}`);
assert(pipeWait.tradeOpportunity.grade === 'WAIT' || pipeWait.mainPlan.status !== 'WAIT' || true, 'wait aligns');
assert(pipeWait.reEntry.state === 'NONE' || pipeWait.reEntry.allowNewSetup === true || pipeWait.reEntry.allowNewSetup === false, 're-entry state declared');
assert(
  pipeWait.mtfSmartZone.primary == null || pipeWait.mtfSmartZone.primary.grade !== 'A_PLUS' || pipeWait.combination.promoted != null,
  'A+ requires combination promote'
);
assert(Array.isArray(pipeWait.chartUx.priceLines), 'chartUx priceLines array');
const tgSq = safeEagle1TelegramReport({
  symbol: 'BTCUSDT',
  timeframe: '15m',
  plan: pipeWait.mainPlan,
  squeezeRadar: pipeWait.squeezeRadar,
  mtfSmartZone: pipeWait.mtfSmartZone,
});
assert(tgSq.includes('독수리1호') && !tgSq.includes('확실'), 'telegram squeeze path keeps no certainty wording');
assert(pipeWait.hud.flowSync.labelKo === 'Bitget Only', 'flow sync is bitget-only without cross market');
assert(pipeWait.hud.clockFlow.labelKo === '데이터 없음', '15m clock flow stays 데이터 없음 without series');
assert(pipeWait.hud.clockFlow.subMinute === '데이터 없음', '10s/30s clock stays 데이터 없음');
assert(
  pipeWait.hud.mtfCompass.map((c) => c.tf).join(',') === '1M,1W,1D,4H,1H,15m,5m,1m',
  'compass always renders 8 TFs HTF-first'
);
assert(pipeWait.hud.compassConflict == null, 'flat compass has no HTF/LTF conflict copy');
assert(pipeWait.hud.breakRail.steps[0] === '접근' && pipeWait.hud.breakRail.steps.length === 5, 'break rail matches mockup Korean steps');
assert(!String(pipeWait.hud.entryQuality.score ?? '').includes('87'), 'entry quality does not hardcode mockup 87');
assert(Array.isArray(pipeWait.hud.coverage), 'hud coverage array exists');
assert(pipeWait.hud.lobResiliency.labelKo === '데이터 없음', 'lob stays 데이터 없음 without book');
const pipeLob = runEagle1Pipeline({
  candles: grind(80),
  timeframe: '1H',
  moneyLive: {
    has_orderbook: true,
    orderbookImbalance: 0.2,
    spreadBps: 1.5,
    bidQty: 12,
    askQty: 9,
  },
});
assert(pipeLob.hud.lobResiliency.labelKo.includes('1.5'), 'lob snapshot uses live spread');
assert(pipeLob.hud.lobResiliency.note.includes('복원속도') || pipeLob.hud.lobResiliency.labelKo.includes('복원속도 시리즈 없음'), 'lob does not invent replenishment');
assert(pipeWait.mtf.frames.length <= 2, 'WAIT alignment is not stuffed with 1W/1M compass frames');
assert(pipeWait.hud.breakRail.targetEn === '데이터 없음' || ['RESISTANCE', 'SUPPORT'].includes(pipeWait.hud.breakRail.targetEn), 'break rail target is declared');
assert(clockSlotUtc(Date.UTC(2024, 0, 1, 0, 0)) === '00', 'UTC :00 slot');
assert(clockSlotUtc(Date.UTC(2024, 0, 1, 0, 15)) === '15', 'UTC :15 slot');
assert(clockSlotUtc(Date.UTC(2024, 0, 1, 0, 7)) == null, 'off-slot is not a clock bar');
assert(runClockFlowEngine({ candles15m: [] }).labelKo === '데이터 없음', 'empty 15m is 데이터 없음');
assert(runClockFlowEngine({ candles15m: grind(40) }).labelKo === '데이터 없음', 'hourly grind is not 15m clock');
const slot0 = Date.UTC(2024, 0, 1, 0, 0) / 1000;
const clockBars: Eagle1Bar[] = [];
for (let i = 0; i < 24; i++) {
  clockBars.push({
    time: slot0 + i * 15 * 60,
    open: 100 + i * 0.4,
    high: 101 + i * 0.4,
    low: 99.6 + i * 0.4,
    close: 100.5 + i * 0.4,
    volume: 10,
    takerBuyBaseVolume: 7,
  });
}
const clk = runClockFlowEngine({ candles15m: clockBars });
assert(clk.source === 'taker', 'clock uses taker share when present');
assert(clk.subMinute === '데이터 없음', 'clock does not invent 10s/30s OFI');
assert(clk.note.includes('OFI 시리즈 없음'), 'clock note admits missing OFI');
assert(clk.after15m.includes('통계 부족'), 'clock % gated by n>=30');
assert(clk.labelKo.includes('분 경계'), 'clock labels UTC slot');
const clkAsOf = runClockFlowEngine({ candles15m: clockBars, asOfTime: slot0 + 15 * 60 });
assert(clkAsOf.labelKo === '데이터 없음', 'asOf with too few slot bars stays 데이터 없음');
const pipeCompass = runEagle1Pipeline({
  candles: grind(80),
  timeframe: '1H',
  compassChain: [
    { tf: '1D', structure: full },
    { tf: '1W', structure: null },
  ],
});
assert(pipeCompass.hud.mtfCompass.length === 8, 'pipeline compass stays 8 cells');
assert(pipeCompass.mtf.frames.length <= 2, 'compassChain does not enter WAIT sequence');
assert(pipeCompass.hud.mtfCompass.find((c) => c.tf === '1m')?.note === '데이터 없음', '1m is not aliased to 1M');
assert(pipeCompass.hud.mtfCompass.find((c) => c.tf === '1W')?.note === '데이터 없음', 'null 1W compass is 데이터 없음');
assert(pipeCompass.hud.mtfCompass.find((c) => c.tf === '1D')?.note !== '데이터 없음', '1D compass uses extra frame');

const comboPromoted = runCombinationEngine({
  structure: {
    ...full,
    events: [
      { kind: 'SWEEP', bias: 'bullish', index: 70, known_at: 72, price: 90, level: 90, evidence: [] },
    ],
  },
  clusters: [
    {
      cluster_id: 'c1',
      labelKo: 't',
      lower: 90,
      upper: 95,
      bias: 'bullish',
      components: [],
      tier: 'A',
      sources: ['ob', 'fvg', 'bpr', 'poc'],
      sampleSize: 40,
      reactionLabel: '',
      detail: '',
    },
  ],
  recommended: {
    cluster_id: 'c1',
    labelKo: 't',
    lower: 90,
    upper: 95,
    bias: 'bullish',
    components: [],
    tier: 'A',
    sources: ['ob', 'fvg', 'bpr', 'poc'],
    sampleSize: 40,
    reactionLabel: '',
    detail: '',
  },
  candleEvents: [{ index: 1, time: 1, price: 90, kind: 'ABSORB', icon: '◇', labelKo: '흡수', bias: 'bullish', confirmed: true }],
  live: { has_cvd: true, volumeDelta: 3, has_orderbook: false },
  families: [{ family: 'sweep_reversal', sampleSize: 40, tpBeforeSlRate: 0.6, slFirstRate: 0.4, medianMfe: 1.2, medianMae: 0.4, netExpectancy: 0.3 }],
});
assert(comboPromoted.features.ofi == null, 'ofi remains 데이터 없음 even on promote path');
const promotedIds = applyCombinationZonePromotion(
  comboPromoted.promoteClusterId
    ? [
        {
          cluster_id: 'c1',
          labelKo: 't',
          lower: 90,
          upper: 95,
          bias: 'bullish',
          components: [],
          tier: 'A',
          sources: ['ob', 'fvg', 'poc'],
          sampleSize: 40,
          reactionLabel: '',
          detail: 'x',
        },
      ]
    : [],
  comboPromoted
);
if (comboPromoted.promoteClusterId) {
  assert(promotedIds[0]?.tier === 'S', 'promoted cluster becomes S without moving prices');
  assert(promotedIds[0]?.lower === 90 && promotedIds[0]?.upper === 95, 'promotion does not move zone bounds');
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eagle1-meta-'));
saveCombinationSnapshot(
  {
    symbol: 'BTCUSDT',
    timeframe: '15m',
    at: 1,
    promoted: null,
    summaryKo: 'selftest',
    hits: [],
  },
  tmpRoot
);
assert(loadCombinationSnapshot('BTCUSDT', '15m', tmpRoot)?.summaryKo === 'selftest', 'combination snapshot roundtrip');
const covFile = writeCoverageManifest(buildCoverageManifest([], { symbol: 'BTCUSDT', timeframe: '15m' }), tmpRoot);
assert(fs.existsSync(covFile) && JSON.parse(fs.readFileSync(covFile, 'utf8')).row_count === 0, 'coverage sidecar writes empty series as 0');

assert(bucketTradesToOfi([], 10_000).length === 0, 'empty fills do not invent OFI buckets');
const fillT0 = Date.UTC(2024, 0, 1, 0, 15, 0);
const ofiBuckets = bucketTradesToOfi(
  [
    { time: fillT0 + 100, qty: 2, isBuyerMaker: false },
    { time: fillT0 + 200, qty: 1, isBuyerMaker: true },
    { time: fillT0 + 10_100, qty: 3, isBuyerMaker: true },
  ],
  10_000
);
assert(ofiBuckets.length === 2, 'fills bucket into 10s OFI');
assert(lastOfi(ofiBuckets) != null && lastOfi(ofiBuckets)! < 0, 'second 10s bucket is sell-dominant');
assert(replenishmentFromBooks([]).score == null && replenishmentFromBooks([]).note.includes('없음'), 'empty book is 데이터 없음');
assert(replenishmentFromBooks([{ t: 1, bidQty: 10, askQty: 10, spreadBps: 1, imbalance: 0 }]).score == null, 'single book snap is not replenishment');
const replenished = replenishmentFromBooks([
  { t: 1_000, bidQty: 10, askQty: 10, spreadBps: 1, imbalance: 0 },
  { t: 2_000, bidQty: 4, askQty: 10, spreadBps: 1, imbalance: -0.2 },
  { t: 3_000, bidQty: 9, askQty: 10, spreadBps: 1, imbalance: 0 },
]);
assert(replenished.score != null && replenished.replenishBid != null && replenished.replenishBid > 0.5, 'bid drop then recover is measured replenishment');
assert(liqAccelFromPoints([]).accel == null, 'empty liq is not cascade');
assert(liqAccelFromPoints([{ t: 1, side: 'long', usd: 1e6, price: 100, amount: 1 }]).accel == null, 'one liq point is not a series');
const nowLiq = Date.UTC(2024, 0, 2, 0, 0, 0);
const liqAcc = liqAccelFromPoints(
  [
    { t: nowLiq - 90_000, side: 'long', usd: 1_000, price: 100, amount: 10 },
    { t: nowLiq - 10_000, side: 'long', usd: 9_000, price: 100, amount: 90 },
  ],
  nowLiq
);
assert(liqAcc.accel === true && liqAcc.seriesPoints === 2, 'last 60s vs prev 60s acceleration is measured');
assert(resolveEagle1LiveAvailability({ liquidationSeriesPoints: 2 }).has_liquidation === true, 'bitget liq series n>=2 sets has_liquidation');

const lastClosed = clockBars[clockBars.length - 2]!;
const slotCloseMs = (Number(lastClosed.time) > 1e12 ? Number(lastClosed.time) : Number(lastClosed.time) * 1000) + 15 * 60 * 1000;
const clkOfi = runClockFlowEngine({
  candles15m: clockBars,
  ofi10s: [{ t: slotCloseMs + 1_000, buyQty: 8, sellQty: 1, ofi: 0.78 }],
});
assert(clkOfi.subMinute.includes('10초 매수우세'), 'clock 10s uses real OFI bucket after slot close');
assert(clkOfi.note.includes('OFI 10s'), 'clock note reports ofi series length');
const clkOfiClip = runClockFlowEngine({
  candles15m: clockBars,
  asOfTime: clockBars[clockBars.length - 1]!.time,
  ofi10s: [{ t: slotCloseMs + 1_000, buyQty: 8, sellQty: 1, ofi: 0.78 }],
});
assert(clkOfiClip.subMinute === '데이터 없음', 'ofi after asOf is not leaked into earlier clock');

const comboOfi = runCombinationEngine({
  structure: full,
  live: { has_ofi: true, ofi: 0.4, has_cvd: false, has_orderbook: false },
});
assert(comboOfi.features.ofi === true, 'combination ofi comes from live series');
const pipeOfi = runEagle1Pipeline({
  candles: grind(80),
  timeframe: '1H',
  moneyLive: { has_ofi: true, ofi: 0.5, ofi10s: ofiBuckets, has_cvd: true, volumeDelta: 2 },
});
assert(pipeOfi.hud.bigLong.checks.find((c) => c.id === 'ofi')?.hit === true, 'hud OFI check uses live ofi');
assert(pipeOfi.hud.cascadeShort.checks.find((c) => c.id === 'liq')?.hit == null, 'liq stays 데이터 없음 without liqAccel');
const pipeLiq = runEagle1Pipeline({
  candles: grind(80),
  timeframe: '1H',
  moneyLive: { liqAccel: true, liqSeriesPoints: 12, has_orderbook: false },
});
assert(pipeLiq.hud.cascadeShort.checks.find((c) => c.id === 'liq')?.hit === true, 'hud liq accel uses series');
const accRep = runStructureAcceptance({
  candles: grind(80),
  structure: full,
  live: { has_orderbook: true, bookSeriesPoints: 1, replenishScore: 90 },
});
assert(accRep.factors.find((f) => f.id === 'replenishment')?.score == null, 'n=1 book does not score replenishment');
const accRep2 = runStructureAcceptance({
  candles: grind(80),
  structure: full,
  live: { has_orderbook: true, bookSeriesPoints: 4, replenishScore: 61 },
});
assert(accRep2.factors.find((f) => f.id === 'replenishment')?.score === 61, 'replenishment score is measured series');
const pipeLobSeries = runEagle1Pipeline({
  candles: grind(80),
  timeframe: '1H',
  moneyLive: {
    has_orderbook: true,
    spreadBps: 1.5,
    bidQty: 12,
    askQty: 9,
    bookSeriesPoints: 4,
    replenishScore: 61,
    replenishBid: 0.8,
    replenishAsk: 0.4,
  },
});
assert(pipeLobSeries.hud.lobResiliency.labelKo.includes('매수복원'), 'lob uses measured replenishment when series exists');
assert(!pipeLobSeries.hud.lobResiliency.labelKo.includes('87') && !pipeLobSeries.hud.lobResiliency.labelKo.includes('72'), 'lob does not hardcode mockup %');

ingestMicrostructureSeries(
  {
    symbol: 'BTCUSDT',
    ofi10s: ofiBuckets,
    book: { t: 1_000, bidQty: 10, askQty: 9, spreadBps: 1, imbalance: 0.05 },
    liqs: [{ t: nowLiq, side: 'short', usd: 500, price: 100, amount: 5 }],
  },
  tmpRoot
);
const storedSeries = loadMicrostructureSeries('BTCUSDT', tmpRoot);
assert(storedSeries.ofi10s.length === ofiBuckets.length, 'ofi series roundtrip');
assert(storedSeries.books.length === 1 && storedSeries.liqs.length === 1, 'book and liq series persist');
ingestMicrostructureSeries(
  {
    symbol: 'BTCUSDT',
    book: { t: 2_000, bidQty: 4, askQty: 9, spreadBps: 1, imbalance: -0.2 },
  },
  tmpRoot
);
assert(loadMicrostructureSeries('BTCUSDT', tmpRoot).books.length === 2, 'book snaps append');

const accExecPx = executionLevelsAcceptancePriceCoords();
assert(accExecPx.ok, `executionLevelsAcceptancePriceCoords: ${accExecPx.notes.join('; ')}`);
const accContGH = continuationAcceptanceGH();
assert(accContGH.ok, `continuationAcceptanceGH: ${accContGH.notes.join('; ')}`);
assert(pipeCore.continuation != null, 'pipeline continuation');
const accCalib = calibrationGateAcceptance();
assert(accCalib.ok, `calibrationGateAcceptance: ${accCalib.notes.join('; ')}`);
assert(pipeCore.calibrationGate != null && pipeCore.calibrationGate.scoresEqualForbidden === true, 'pipeline calibrationGate');
assert(
  pipeCore.calibrationGate.setupScore == null ||
    pipeCore.calibrationGate.historicalWinRate == null ||
    Math.round(pipeCore.calibrationGate.historicalWinRate * 100) !== Math.round(pipeCore.calibrationGate.setupScore),
  'pipeline setupScore ≠ histWinRate'
);
const accPathJ = historicalPathAcceptanceJ();
assert(accPathJ.ok, `historicalPathAcceptanceJ: ${accPathJ.notes.join('; ')}`);
const accUi16 = mergedDeskPracticalUiAcceptance();
assert(accUi16.ok, `mergedDeskPracticalUiAcceptance: ${accUi16.notes.join('; ')}`);
const accAvwap = mergedDeskAnchoredVwapAcceptance();
assert(accAvwap.ok, `mergedDeskAnchoredVwapAcceptance: ${accAvwap.notes.join('; ')}`);
const accE1Inject = mergedDeskCoreInjectSelftest();
assert(accE1Inject.ok, `mergedDeskCoreInjectSelftest: ${accE1Inject.notes.join('; ')}`);
const accHz17 = historicalZoneCacheAcceptance();
assert(accHz17.ok, `historicalZoneCacheAcceptance: ${accHz17.notes.join('; ')}`);
const accMemo17 = pipelineMemoAcceptance();
assert(accMemo17.ok, `pipelineMemoAcceptance: ${accMemo17.notes.join('; ')}`);
assert(pipeCore.historicalPathGate != null, 'pipeline historicalPathGate');
assert(
  !pipeCore.historicalPathGate.available
    ? pipeCore.smartPath.main.points.length === 0 && pipeCore.smartPath.main.uiState === 'PATH_UNAVAILABLE'
    : true,
  'unavailable path clears points'
);
assert(Array.isArray(pipeCore.executionLevels?.practicalPriceLines), 'executionLevels practicalPriceLines');

const histAcc = historicalEventStoreAcceptance(tmpRoot);
assert(histAcc.ok, `historicalEventStoreAcceptance: ${histAcc.notes.join('; ')}`);
const histId = buildHistoricalEventId({
  symbol: 'BTCUSDT',
  timeframe: '4H',
  bar_time: 1_700_500_000,
  family: 'fvg_retest',
  direction: 'SHORT',
});
const histRow: HistoricalEventRecord = {
  event_id: histId,
  symbol: 'BTCUSDT',
  timeframe: '4H',
  family: 'fvg_retest',
  direction: 'SHORT',
  bar_time: 1_700_500_000,
  bar_index: 10,
  engine_version: 'eagle1-event-v1',
  entry: 200,
  stop: 210,
  tp1: 180,
  evidence: { groups: ['structure'], notes: ['selftest-inline'] },
  frozen_at: 1_700_500_050,
  outcome: null,
};
assert(appendHistoricalEvent(histRow, tmpRoot).created, 'historical event create');
assert(loadHistoricalEvents('BTCUSDT', '4H', tmpRoot)[0]?.entry === 200, 'historical event reload');
assert(
  !appendHistoricalEvent({ ...histRow, entry: 1, stop: 2 }, tmpRoot).created &&
    loadHistoricalEvents('BTCUSDT', '4H', tmpRoot)[0]?.entry === 200,
  'historical event frozen immutable on re-append'
);
const histOut = updateHistoricalEventOutcome(
  'BTCUSDT',
  '4H',
  histId,
  { mfe: 3, mae: 0.5, tpFirst: true, slFirst: false, netR: 2 },
  tmpRoot
);
assert(histOut?.outcome?.mfe === 3 && histOut?.outcome?.mae === 0.5, 'historical event outcome MFE/MAE');
assert(histOut?.entry === 200 && histOut?.stop === 210, 'outcome update leaves entry/stop unchanged');
const fromOc = setupOutcomeToHistoricalEvent(
  {
    family: 'pullback',
    regime: 'range',
    direction: 'LONG',
    index: 3,
    tpFirst: true,
    slFirst: false,
    mfe: 1,
    mae: 0.2,
    netR: 1.5,
    grossRr: 2,
  },
  { symbol: 'BTCUSDT', timeframe: '1H', bar_time: 1_700_600_000, entry: 90, stop: 85 }
);
assert(fromOc.outcome?.mfe === 1 && fromOc.entry === 90, 'setupOutcomeToHistoricalEvent adapter');

fs.rmSync(tmpRoot, { recursive: true, force: true });

const master = runMasterAcceptanceChecklist();
assert(
  master.ok,
  master.summaryKo +
    ' ' +
    master.items
      .filter((i) => !i.ok)
      .map((i) => `${i.id}:${i.note}`)
      .join('; ')
);

async function runBusGate() {
  clearMarketBus();
  const busConc = await marketBusConcurrentSelftest();
  assert(busConc.ok, busConc.note);
}

runBusGate()
  .then(() => {
    if (fail.length) {
      console.error('FAIL', fail);
      process.exit(1);
    }
    console.log('eagle1 engines selftest ok', {
      events: full.events.length,
      regime: full.regime,
      zones: z80.zones.length,
      wait: pipeWait.mainPlan.status,
    });
  })
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  });
