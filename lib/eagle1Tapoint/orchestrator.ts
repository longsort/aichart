/**
 * 타점엔진 오케스트레이터 — eagle1 pipeline + 게이트 + 점수분리.
 * Dual/A·B·C/S급은 setupSources로만 기록 · 즉시 주문 금지.
 */
import { runEagle1Pipeline, type Eagle1PipelineInput } from '@/lib/eagle1/pipeline';
import type { Eagle1Bar } from '@/lib/eagle1/structureEngine';
import {
  buildTapScorePack,
} from './scores';
import { evaluateRequiredGate } from './requiredGate';
import type {
  TapBattleZone,
  TapMacroFrame,
  TapointDecisionReport,
} from './types';
import { TAPOINT_SOURCE } from './types';
import { buildTapointBriefingKo, oneLineReasonKo } from './briefing';
import {
  historicalScoreFromSnap,
  runTapCausalSimilarity,
} from './causalSimilarity';
import { runExtremeEventEngine } from './extremeEventEngine';
import { advanceTapEntryState } from './entryStateMachine';
import { buildTapointChartSignals } from './chartSignals';
import {
  repairTapExecLevels,
  sanitizeTapExecLevels,
  tapExecLevelsGeometryOk,
} from './sanitizeExecLevels';
import {
  advVolumeFlowAdjust,
  buildTapSharedMergedSignals,
  dailyFaceGateTag,
} from './sharedMergedDeskSignals';
import {
  evaluateVolRoeBurstOnDetectTfs,
  volRoeBurstAlignBoost,
} from './volRoeBurstSignal';
import { buildSweepLiveSignal, buildTfSweepPhaseBoard } from './sweepLiveSignalTap';
import { evaluateHtfSweepFilter } from './htfSweepFilter';
import { buildInstitutionalBandTapPlan, INST_BAND_SCALP_A_LEV } from './institutionalBandTapPlan';
import { rsi14 } from './tapointFactorLean';
import {
  buildTapMacroFrames,
  buildOneMacroFrame,
  TAP_MACRO_TF_ORDER,
  type TapMacroCandlePack,
} from './macroFrames';
import { normalizeTapointTf } from './symbolEntryTf';
import { buildTapPriorLevels } from './pdhPdlLevels';
import { buildTapLiquidityMap } from './liquidityMap';
import { buildBattleZone } from './battleZoneEngine';
import { buildTapRegimePack, mapEagleRegimeKo } from './regimeMap';
import { tapMacroCloseBoard } from './sessionCloseKst';
import { buildTapFlowSnap } from './flowConfirmTap';
import { resolveTapExecPlan } from './execKindEngine';
import { buildTapStructuralSl } from './structuralSlTap';
import { buildTapTpPack } from './tpCandidateEngine';
import { evaluateTapNetEvGate } from './netEvFeeGate';
import { buildTapSfpQuality } from './sfpQualityTap';
import { evaluateQuickScalpAutoEngine } from './quickScalpAutoEngine';
import { evaluateSniperScalpAutoEngine } from './sniperScalpAutoEngine';
import { buildTapBreakoutSnap } from './breakoutStrategyTap';
import { buildTapNormalSetupSnap } from './normalSetupEngine';
import { overlayEntryStateIfOpen } from './entryLifecycleTap';
import {
  evaluateTapCorrCluster,
  registerTapConfirmedCluster,
} from './correlationClusterTap';
import { wireTapRejectFromReport } from './rejectLedgerWire';
import { bumpTapPaperStats, evaluateTapPaperLiveGate, updateTapOosSnap } from './paperLiveGateTap';
import { pickTapStrategyFamily, runTapBacktestSuite } from './backtestSuiteTap';
import { evaluateTapOverfitGuard } from './overfitGuardTap';
import { buildTapRsiDivSnap } from './rsiDivergenceTap';
import type { MtfFrameInput } from '@/lib/eagle1/mtfSequence';

function toBars(
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>
): Eagle1Bar[] {
  return candles.map((c) => ({
    time: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume) || 0,
  }));
}

function roughAtr(bars: Eagle1Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const n = Math.min(period, bars.length - 1);
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const c = bars[i]!;
    const p = bars[i - 1]!;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close)
    );
    sum += tr;
  }
  return sum / Math.max(1, n);
}

function locationScore(price: number, zone: TapBattleZone | null, premiumHint?: string): number {
  if (!zone) return 28;
  const inside = price >= zone.lo && price <= zone.hi;
  const near =
    Math.abs(price - zone.mid) / Math.max(zone.mid, 1) < 0.008;
  let s = inside ? 78 : near ? 62 : 32;
  if (zone.sources?.includes('WEAK_SINGLE')) s = Math.min(s, 42);
  if ((zone.sources?.length || 0) >= 3 && inside) s = Math.max(s, 82);
  if (premiumHint === 'PREMIUM' && inside) s -= 12;
  if (premiumHint === 'DISCOUNT' && inside) s += 8;
  return Math.max(0, Math.min(100, s));
}

export type RunTapointParams = {
  symbol: string;
  timeframe: string;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  qualityOk?: boolean;
  /** 품질·리페인트 게이트 메모 (decide에서 주입) */
  qualityNoteKo?: string | null;
  setupSources?: string[];
  /** Dual/S급 등에서 온 SETUP 힌트 — 즉시 주문 아님 */
  setupHint?: {
    direction?: 'LONG' | 'SHORT' | null;
    grade?: string | null;
    noteKo?: string | null;
  } | null;
  tipMissingAiOnly?: boolean;
  /** 통합모드 일봉면 공동 — 1D 캔들 */
  dailyCandles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
  weeklyCandles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
  monthlyCandles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
  /** §5 MACRO — 1M/1W/1D/4H/1H */
  macroCandles?: TapMacroCandlePack | null;
  /** 볼륨폭발 감지용 — 5m · 15m (실측 우선 TF) */
  candles5m?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
  candles15m?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
};

export function runTapointOrchestrator(params: RunTapointParams): TapointDecisionReport {
  const symbol = String(params.symbol || '').toUpperCase();
  const timeframe = String(params.timeframe || '15m');
  const barsAll = toBars(params.candles || []);
  /** 파이프 부하 제한 · 유사도는 더 긴 히스토리 */
  const bars = barsAll.length > 360 ? barsAll.slice(-360) : barsAll;
  const histBars = barsAll.length > 800 ? barsAll.slice(-800) : barsAll;
  const price = Number(bars[bars.length - 1]?.close) || 0;
  const qualityOk = params.qualityOk !== false && bars.length >= 64;

  const macroPack: TapMacroCandlePack = {
    '1M': params.macroCandles?.['1M'] || params.monthlyCandles || null,
    '1W': params.macroCandles?.['1W'] || params.weeklyCandles || null,
    '1D': params.macroCandles?.['1D'] || params.dailyCandles || null,
    '4H': params.macroCandles?.['4H'] || null,
    '1H': params.macroCandles?.['1H'] || null,
  };

  const macroBuilt = buildTapMacroFrames({
    pack: macroPack,
    entryCandles: params.candles || [],
    entryTf: timeframe,
    flowHintKo: null,
  });

  /** 15m 구조 — 진입 TF보다 상위일 때만 스윕필터에 사용 */
  if (params.candles15m?.length && normalizeTapointTf(timeframe) !== '15m') {
    const m15 = buildOneMacroFrame({
      tf: '15m',
      candles: params.candles15m as Parameters<typeof buildOneMacroFrame>[0]['candles'],
    });
    if (m15.structure) {
      macroBuilt.structures['15m'] = m15.structure;
    }
  }

  const mtfChain: MtfFrameInput[] = [];
  for (const tf of ['1D', '4H', '1H', '15m', '5m'] as const) {
    const st = macroBuilt.structures[tf];
    if (st) mtfChain.push({ tf, structure: st });
  }

  const htfStructure =
    macroBuilt.structures['1D'] ||
    macroBuilt.structures['4H'] ||
    macroBuilt.structures['1W'] ||
    null;

  let pipe = null as ReturnType<typeof runEagle1Pipeline> | null;
  try {
    if (qualityOk) {
      const input: Eagle1PipelineInput = {
        candles: bars,
        timeframe,
        symbol,
        chartMode: 'practical',
        qualityBlocked: !qualityOk,
        htfBias: macroBuilt.htfBias,
        htfStructure,
        mtfChain: mtfChain.length ? mtfChain : null,
      };
      pipe = runEagle1Pipeline(input);
    }
  } catch {
    pipe = null;
  }

  const plan = pipe?.mainPlan ?? null;
  const structure = pipe?.structure ?? null;

  const zoneList: Array<{
    lo: number;
    hi: number;
    kind?: string;
    tier?: string;
    label?: string;
    strength?: number;
  }> = [];
  const zs = pipe?.zones;
  if (zs?.zones?.length) {
    for (const z of zs.zones) {
      const lo = Number(z.lower);
      const hi = Number(z.upper);
      if (lo > 0 && hi > 0) {
        zoneList.push({
          lo,
          hi,
          kind: String(z.source_type || 'zone'),
          tier: String(z.tier || ''),
          label: String(z.source_type || 'zone'),
          strength: Number(z.strength) || 0,
        });
      }
    }
  }
  if (zs?.recommended) {
    const c = zs.recommended;
    const lo = Number(c.lower);
    const hi = Number(c.upper);
    if (lo > 0 && hi > 0) {
      zoneList.push({
        lo,
        hi,
        kind: 'cluster',
        tier: String(c.tier || 'S'),
        label: c.labelKo || '합류전투',
        strength: 80,
      });
    }
  }

  const priorLevels = buildTapPriorLevels({
    daily: params.dailyCandles || macroPack['1D'],
    weekly: params.weeklyCandles || macroPack['1W'],
    monthly: params.monthlyCandles || macroPack['1M'],
  });

  const liqMap = buildTapLiquidityMap({
    price,
    structure,
    bars,
    priorLevels,
  });

  const battleZone = buildBattleZone({
    price,
    zones: zoneList,
    liqNodes: liqMap.nodes,
    priorLevels,
  });

  const pd = pipe?.premiumDiscount;
  const locHint =
    pd?.zone === 'PREMIUM'
      ? 'PREMIUM'
      : pd?.zone === 'DISCOUNT'
        ? 'DISCOUNT'
        : pd?.zone === 'EQUILIBRIUM'
          ? 'EQUILIBRIUM'
          : 'UNKNOWN';

  const regimePack = buildTapRegimePack({
    eagleRegime: structure?.regime || plan?.regime,
    candles: params.candles || bars,
  });

  const dirHint: 'LONG' | 'SHORT' =
    params.setupHint?.direction === 'SHORT' || params.setupHint?.direction === 'LONG'
      ? params.setupHint.direction
      : plan?.direction === 'SHORT' || plan?.direction === 'LONG'
        ? plan.direction
        : (plan?.longScore || 0) >= (plan?.shortScore || 0)
          ? 'LONG'
          : 'SHORT';

  const extreme = runExtremeEventEngine({
    bars,
    structure,
    iClosed: Math.max(0, bars.length - 2),
  });

  let sfpQuality = buildTapSfpQuality({
    falseBreak: pipe?.falseBreak ?? null,
    structure,
    direction: extreme.directionHint || dirHint,
  });

  const breakoutSnap = buildTapBreakoutSnap({
    candles: params.candles || bars,
    structure,
    regime: structure?.regime || plan?.regime,
    extremeKind: extreme.kind,
  });


  const tfNow = normalizeTapointTf(timeframe) || timeframe;
  const extraSeries: Array<{ tf: string; bars: NonNullable<RunTapointParams['candles5m']> }> = [];
  if (params.candles5m?.length && tfNow !== '5m') {
    extraSeries.push({ tf: '5m', bars: params.candles5m });
  }
  if (params.candles15m?.length && tfNow !== '15m') {
    extraSeries.push({ tf: '15m', bars: params.candles15m });
  }
  const hist = runTapCausalSimilarity({
    bars: histBars,
    direction: extreme.directionHint || dirHint,
    asOfIndex: Math.max(0, histBars.length - 2),
    extraSeries,
  });
  const histScore = historicalScoreFromSnap(hist);

  const locScore = locationScore(price, battleZone, locHint);
  const shared = buildTapSharedMergedSignals({
    candles: bars,
    timeframe,
    dailyCandles: params.dailyCandles || macroPack['1D'] || null,
  });
  const volBurst = evaluateVolRoeBurstOnDetectTfs({
    candles5m: params.candles5m,
    candles15m: params.candles15m,
    leverage: 20,
    targetRoePct: 7,
  });
  let flowScore = plan?.moneyFlow
    ? plan.moneyFlow.stateKo.includes('매수') || plan.moneyFlow.stateKo.includes('롱')
      ? 68
      : plan.moneyFlow.stateKo.includes('매도') || plan.moneyFlow.stateKo.includes('숏')
        ? 68
        : 48
    : 45;
  flowScore = advVolumeFlowAdjust(
    flowScore,
    shared.advVolume,
    extreme.directionHint || dirHint
  );

  /** §19 — 파이프 flowConfirmation 우선 */
  const flowSnapEarly = buildTapFlowSnap({
    flowConfirmation: pipe?.flowConfirmation ?? null,
    moneyFlowStateKo: plan?.moneyFlow?.stateKo || null,
    direction: extreme.directionHint || dirHint,
  });
  flowScore = Math.round(flowScore * 0.35 + flowSnapEarly.flowScore * 0.65);

  const setupBoost =
    (params.setupHint?.grade === 'S' || params.setupHint?.grade === 's' ? 12 : 0) +
    (volBurst.fired ? 4 : 0) +
    ((battleZone?.sources?.length || 0) >= 3 ? 6 : 0) +
    (sfpQuality.active ? Math.min(10, Math.round(sfpQuality.score / 12)) : 0) +
    (breakoutSnap.active ? Math.min(8, Math.round(breakoutSnap.score / 15)) : 0);

  /** 방향 힌트 — 볼륨폭발이 켜지면 우선 후보로 합류(단독 확정 아님) */
  const dirHintBurst: 'LONG' | 'SHORT' =
    volBurst.fired && volBurst.direction
      ? volBurst.direction
      : dirHint;

  const liqScoreBase =
    liqMap.nodes.length >= 4 ? 62 : liqMap.nodes.length >= 2 ? 52 : 34;
  const battleLiqBoost = battleZone
    ? 8 + Math.min(20, (battleZone.sources?.length || 0) * 4)
    : 0;

  const scores = buildTapScorePack({
    plan,
    structure,
    locationScore: locScore,
    flowScore,
    liquidityScore: Math.min(100, liqScoreBase + battleLiqBoost),
    eventScore: Math.max(
      extreme.score,
      sfpQuality.boostsEventPath ? 70 : 0,
      breakoutSnap.allowsBreakoutPath ? 68 : 0,
      structure?.state === 'SWEEP' || structure?.state === 'SHIFT' ? 72 : 28
    ),
    historicalScore: histScore,
    failureRisk: (() => {
      let fr = plan?.noTradeGates?.length
        ? 55 + plan.noTradeGates.length * 5
        : hist.mae != null && hist.mfe != null && hist.mae > hist.mfe * 1.2
          ? 62
          : 35;
      if (regimePack.chaos) fr = Math.max(fr, 78);
      if (regimePack.highVol) fr = Math.max(fr, 58);
      return fr;
    })(),
    evScore:
      hist.netEv != null
        ? Math.max(0, Math.min(100, Math.round(50 + hist.netEv * 2500)))
        : histScore,
    setupBoost,
  });

  const hasSweep =
    structure?.state === 'SWEEP' ||
    structure?.state === 'SHIFT' ||
    structure?.state === 'RETEST' ||
    structure?.state === 'CONFIRMED' ||
    extreme.allowsEventPath ||
    breakoutSnap.allowsBreakoutPath ||
    sfpQuality.active ||
    liqMap.nodes.some((n) => n.kind === 'SSL' || n.kind === 'BSL' || n.kind === 'EQL' || n.kind === 'EQH');
  const hasReclaim =
    structure?.state === 'RETEST' ||
    structure?.state === 'CONFIRMED' ||
    structure?.state === 'SHIFT' ||
    extreme.kind.includes('REVERSAL') ||
    extreme.kind.includes('FAILED') ||
    (breakoutSnap.active && breakoutSnap.phaseKo.includes('리테스트')) ||
    sfpQuality.score >= 62;

  let dirPref: 'LONG' | 'SHORT' | null =
    extreme.directionHint ||
    params.setupHint?.direction ||
    (breakoutSnap.allowsBreakoutPath ? breakoutSnap.direction : null) ||
    (sfpQuality.active
      ? sfpQuality.kind === 'LONG_SFP'
        ? 'LONG'
        : sfpQuality.kind === 'SHORT_SFP'
          ? 'SHORT'
          : null
      : null) ||
    plan?.direction ||
    (scores.direction >= 55 ? dirHintBurst : null);

  if (!dirPref && volBurst.fired && volBurst.direction) {
    dirPref = volBurst.direction;
  }

  /** CHAOS 레짐 — 확정 방향 억제 (이벤트·돌파 경로만 예외) */
  if (regimePack.chaos && !extreme.allowsEventPath && !breakoutSnap.allowsBreakoutPath) {
    dirPref = null;
  }

  sfpQuality = buildTapSfpQuality({
    falseBreak: pipe?.falseBreak ?? null,
    structure,
    direction: dirPref,
  });

  const quickScalp = evaluateQuickScalpAutoEngine({
    symbol,
    timeframe,
    candles: bars,
    structure,
    liqMap,
    sfp: sfpQuality,
    qualityOk,
    htfBias: macroBuilt.htfBias,
  });
  const sniperScalp = evaluateSniperScalpAutoEngine({
    symbol,
    timeframe,
    candles: bars,
    structure,
    structures: macroBuilt.structures,
    liqBelow: liqMap?.below?.[0]?.price ?? null,
    liqAbove: liqMap?.above?.[0]?.price ?? null,
    qualityOk,
    htfBias: macroBuilt.htfBias,
  });

  const rsiDiv = buildTapRsiDivSnap({
    candles: params.candles || bars,
    timeframe,
    direction: dirPref,
    location: locHint,
  });
  if (rsiDiv.scoreBoost !== 0) {
    scores.setup = Math.max(0, Math.min(100, scores.setup + Math.round(rsiDiv.scoreBoost * 0.5)));
    scores.flow = Math.max(0, Math.min(100, scores.flow + Math.round(rsiDiv.scoreBoost * 0.35)));
  }
  if (rsiDiv.chaseWarn) {
    scores.failureRisk = Math.max(scores.failureRisk, 58);
    scores.entry = Math.min(scores.entry, 52);
  }

  const corrCluster = evaluateTapCorrCluster({
    symbol,
    direction: dirPref,
  });

  const burstAlign = volRoeBurstAlignBoost(volBurst, dirPref);
  if (burstAlign.flowBoost !== 0) {
    scores.flow = Math.max(0, Math.min(100, scores.flow + burstAlign.flowBoost));
  }
  if (burstAlign.setupBoost > 0) {
    scores.setup = Math.max(0, Math.min(100, scores.setup + burstAlign.setupBoost));
  }
  if (burstAlign.microSoft) {
    scores.entry = Math.max(scores.entry, 52);
  }

  /** 스윕합류 — 별도 신호 · 자동진입 필수(단독 확정 아님) */
  let sweepLive = buildSweepLiveSignal({
    structure,
    price,
    asOfIndex: Math.max(0, bars.length - 2),
    direction: dirPref,
  });
  if (sweepLive.fired && sweepLive.alignsWithDir) {
    scores.event = Math.max(0, Math.min(100, scores.event + 10));
    scores.setup = Math.max(0, Math.min(100, scores.setup + 5));
    scores.entry = Math.max(scores.entry, 54);
  }

  /** 상위 TF 스윕 필터 — 게이트 하드차단은 자동진입층에서(공유캐시 유지) · 점수는 반영 */
  let htfSweep = evaluateHtfSweepFilter({
    direction: dirPref,
    entryTf: timeframe,
    structures: macroBuilt.structures,
    enforce: false,
  });
  if (htfSweep.scoreBoost !== 0) {
    scores.event = Math.max(
      0,
      Math.min(100, scores.event + Math.round(htfSweep.scoreBoost * 0.6))
    );
    scores.entry = Math.max(
      0,
      Math.min(100, scores.entry + Math.round(htfSweep.scoreBoost * 0.4))
    );
  }
  if (htfSweep.conflictTfs.length > 0) {
    scores.failureRisk = Math.max(scores.failureRisk, 58);
  }

  const hasMicro =
    plan?.status === 'CONFIRMED_LONG' ||
    plan?.status === 'CONFIRMED_SHORT' ||
    plan?.status === 'LONG_WATCH' ||
    plan?.status === 'SHORT_WATCH' ||
    structure?.state === 'CONFIRMED' ||
    structure?.state === 'RETEST' ||
    extreme.allowsEventPath ||
    burstAlign.microSoft;

  const dailyGate = dailyFaceGateTag(shared.dailyFace, dirPref);

  const atrProbe = roughAtr(bars);
  const atrFix = atrProbe > 0 ? atrProbe : price > 0 ? price * 0.003 : 0;

  /** §16·17 실행계획 — 게이트·레벨 전에 초안 */
  const atZoneProbe =
    Boolean(battleZone) &&
    price >= (battleZone!.lo * 0.996) &&
    price <= (battleZone!.hi * 1.004);
  const expectedMovePct =
    hist.mfe != null && hist.mfe > 0
      ? hist.mfe
      : atrFix > 0 && price > 0
        ? (atrFix * 1.2) / price
        : null;
  const execPlanDraft = resolveTapExecPlan({
    price,
    direction: dirPref,
    battleZone,
    eventPath: extreme.allowsEventPath,
    eventScore: scores.event,
    atZone: atZoneProbe || Boolean(battleZone && locScore >= 55),
    hasReclaim,
    hasMicro,
    expectedMovePct,
    roundTripCostPct: 0.0012,
  });

  const entryProbe =
    execPlanDraft.entryHint ??
    (plan?.entryLow != null && plan?.entryHigh != null
      ? (Number(plan.entryLow) + Number(plan.entryHigh)) / 2
      : battleZone?.mid ?? (price > 0 ? price : null));

  const structural = buildTapStructuralSl({
    direction: dirPref,
    entry: entryProbe,
    price,
    atr: atrFix,
    timeframe,
    structure,
    battleZone,
    planSl: plan?.sl ?? null,
    leverage: 20,
  });

  const tpPack = buildTapTpPack({
    direction: dirPref,
    entry: entryProbe,
    atr: atrFix,
    planTp1: plan?.tp1 ?? null,
    planTp2: plan?.tp2 ?? null,
    planTp3: plan?.tp3 ?? null,
    riskPlan: null,
    liqNodes: liqMap.nodes,
    battleZone,
  });

  const levelsProbe = repairTapExecLevels(
    dirPref,
    {
      entry: entryProbe,
      sl: structural.sl,
      tp1: tpPack.tp1,
      tp2: tpPack.tp2,
      tp3: tpPack.tp3,
    },
    atrFix
  );

  const netEvGate = evaluateTapNetEvGate({
    direction: dirPref,
    entry: levelsProbe.entry,
    sl: levelsProbe.sl,
    tp1: levelsProbe.tp1,
    leverage: 20,
    execKind: execPlanDraft.execKind,
    marketOrder: execPlanDraft.orderType === 'MARKET',
  });

  /** NET EV 점수로 scores.ev 보정 */
  if (netEvGate.netRrTp1 != null) {
    scores.ev = Math.max(
      0,
      Math.min(100, Math.round(40 + netEvGate.netRrTp1 * 18))
    );
  }
  if (!netEvGate.ok) {
    scores.failureRisk = Math.max(scores.failureRisk, 62);
  }

  const flowSnap = buildTapFlowSnap({
    flowConfirmation: pipe?.flowConfirmation ?? null,
    moneyFlowStateKo: plan?.moneyFlow?.stateKo || null,
    direction: dirPref,
  });
  scores.flow = Math.max(0, Math.min(100, flowSnap.flowScore));

  const execLevelsOk = !dirPref
    ? undefined
    : tapExecLevelsGeometryOk(dirPref, levelsProbe);

  const gate = evaluateRequiredGate({
    qualityOk,
    hasContext: Boolean(structure) && scores.direction >= 50,
    battleZone,
    price,
    hasLiquidityOrBreakout: hasSweep || scores.event >= 70,
    hasReclaimOrAcceptance: hasReclaim,
    hasMicroConfirm: hasMicro,
    tipMissingAiOnly: params.tipMissingAiOnly === true,
    scores,
    eventPath: extreme.allowsEventPath || sfpQuality.boostsEventPath,
    dailyFaceOk: dailyGate.ok,
    dailyFaceSoft: dailyGate.soft,
    dailyFaceTag: dailyGate.tag,
    advVolumeAction: shared.advVolume?.action || null,
    direction: dirPref,
    execLevelsOk: dirPref ? execLevelsOk : undefined,
    netEvOk: dirPref ? netEvGate.ok : undefined,
    netEvFailTag: netEvGate.failTag,
    flowConflict: flowSnap.alignsWithDir === false,
    corrBlocked: corrCluster.allowNew === false,
    htfSweepConflict: false,
    htfSweepAlignTag:
      htfSweep.alignTfs.length > 0
        ? `HTF_SWEEP_ALIGN:${htfSweep.alignTfs.slice(0, 3).join(',')}`
        : null,
    htfSweepWarnTag:
      htfSweep.conflictTfs.length > 0
        ? `HTF_SWEEP_WARN:${htfSweep.conflictTfs.slice(0, 3).join(',')}`
        : null,
  });

  const advanced = advanceTapEntryState({
    direction: dirPref,
    gate,
    scores,
    eventPath: extreme.allowsEventPath || sfpQuality.boostsEventPath,
    qualityOk,
    preferredExecKind: execPlanDraft.execKind,
  });
  let { decision, entryState, execKind, rejectReasonKo } = advanced;

  /** 확정 시 실행계획 재확정 */
  const execPlan = resolveTapExecPlan({
    price,
    direction:
      decision === 'CONFIRMED_LONG' || decision === 'ARMED_LONG'
        ? 'LONG'
        : decision === 'CONFIRMED_SHORT' || decision === 'ARMED_SHORT'
          ? 'SHORT'
          : dirPref,
    battleZone,
    eventPath: extreme.allowsEventPath,
    eventScore: scores.event,
    atZone: gate.passTags.includes('AT_ZONE'),
    hasReclaim,
    hasMicro,
    expectedMovePct: netEvGate.expectedMovePct ?? expectedMovePct,
    roundTripCostPct: netEvGate.roundTripCostPct,
  });
  if (decision === 'CONFIRMED_LONG' || decision === 'CONFIRMED_SHORT') {
    execKind = execPlan.execKind !== 'WAIT' ? execPlan.execKind : execKind;
  }

  /**
   * §19 — 오더플로 UNAVAILABLE 이면 MARKET SCALP 확정 금지.
   * Zone Sniper(리밋)만 허용하거나 WAIT.
   */
  if (
    (decision === 'CONFIRMED_LONG' || decision === 'CONFIRMED_SHORT') &&
    execKind === 'MARKET_SCALP' &&
    (flowSnap.bias === 'UNAVAILABLE' || flowSnap.usableForConfirm === false)
  ) {
    if (gate.passTags.includes('AT_ZONE')) {
      execKind = 'ZONE_SNIPER';
      rejectReasonKo = `FLOW UNAVAILABLE · 스캘프금지 · Zone Sniper로 전환`;
    } else {
      decision = dirPref === 'SHORT' ? 'ARMED_SHORT' : 'ARMED_LONG';
      entryState = 'ARMED';
      execKind = 'WAIT';
      rejectReasonKo = `FLOW UNAVAILABLE · 시장가스캘프 확정 금지`;
    }
  }

  const normalSetup = buildTapNormalSetupSnap({
    direction: dirPref,
    hasContext: Boolean(structure) && scores.direction >= 50,
    atZone: gate.passTags.includes('AT_ZONE'),
    hasSweep,
    hasReclaim,
    hasMicro,
    hasDisplacement: scores.event >= 68 || extreme.allowsEventPath,
    setupScore: scores.setup,
    locationScore: scores.location,
  });

  entryState = overlayEntryStateIfOpen(symbol, entryState);

  const orderType =
    decision === 'CONFIRMED_LONG' || decision === 'CONFIRMED_SHORT'
      ? execKind === 'MARKET_SCALP'
        ? ('MARKET' as const)
        : execPlan.orderType === 'WAIT'
          ? ('LIMIT_CONFIRMED' as const)
          : execPlan.orderType
      : execPlan.orderType;
  const execNoteKo =
    (rejectReasonKo && rejectReasonKo.includes('FLOW')
      ? rejectReasonKo
      : execPlan.noteKo) + (normalSetup.ok ? '' : ` · ${normalSetup.noteKo}`);

  const macro: TapMacroFrame[] =
    macroBuilt.frames.length > 0
      ? macroBuilt.frames
      : [
          {
            tf: timeframe,
            direction:
              structure?.events?.length &&
              [...structure.events].reverse().find((e) => e.kind !== 'SWING')?.bias ===
                'bullish'
                ? 'LONG'
                : structure?.events?.length &&
                    [...structure.events].reverse().find((e) => e.kind !== 'SWING')
                      ?.bias === 'bearish'
                  ? 'SHORT'
                  : 'NEUTRAL',
            location: (locHint as TapMacroFrame['location']) || 'UNKNOWN',
            structure: String(structure?.state || 'IDLE'),
            momentum: mapEagleRegimeKo(structure?.regime),
            flow: flowSnap.summaryKo || plan?.moneyFlow?.stateKo || '—',
            risk: regimePack.noteKo,
            noteKo: `${regimePack.unifiedKo} · ${extreme.kind}`,
          },
        ];

  const htfClose = tapMacroCloseBoard().map((c) => ({
    tf: c.tf,
    developing: c.developing,
    statusKo: c.statusKo,
    remainSec: c.remainSec,
  }));

  const dirForLevels: 'LONG' | 'SHORT' | null =
    decision === 'CONFIRMED_LONG' || decision === 'ARMED_LONG'
      ? 'LONG'
      : decision === 'CONFIRMED_SHORT' || decision === 'ARMED_SHORT'
        ? 'SHORT'
        : dirPref;

  const entryChosen =
    (decision === 'CONFIRMED_LONG' || decision === 'CONFIRMED_SHORT'
      ? execPlan.entryHint
      : null) ??
    levelsProbe.entry ??
    entryProbe;

  const structuralFinal = buildTapStructuralSl({
    direction: dirForLevels,
    entry: entryChosen,
    price,
    atr: atrFix,
    timeframe,
    structure,
    battleZone,
    planSl: plan?.sl ?? structural.sl,
    leverage: 20,
  });

  const tpFinal = buildTapTpPack({
    direction: dirForLevels,
    entry: entryChosen,
    atr: atrFix,
    planTp1: tpPack.tp1,
    planTp2: tpPack.tp2,
    planTp3: tpPack.tp3,
    riskPlan: null,
    liqNodes: liqMap.nodes,
    battleZone,
  });

  const fixed = repairTapExecLevels(
    dirForLevels,
    {
      entry: entryChosen,
      sl: structuralFinal.sl,
      tp1: tpFinal.tp1,
      tp2: tpFinal.tp2,
      tp3: tpFinal.tp3,
    },
    atrFix
  );
  const entry = fixed.entry;
  const sl = fixed.sl;
  const tp1 = fixed.tp1;
  const tp2 = fixed.tp2;
  const tp3 = fixed.tp3;

  const setupSources = [
    ...(params.setupSources || []),
    params.setupHint?.grade ? `grade:${params.setupHint.grade}` : '',
    params.setupHint?.noteKo || '',
    extreme.kind !== 'NONE' ? `event:${extreme.kind}` : '',
    volBurst.fired ? volBurst.noteKo : '',
    burstAlign.tag || '',
    sweepLive.fired ? `sweepLive:${sweepLive.noteKo}` : '',
    battleZone ? `battle:${battleZone.sources.slice(0, 3).join('+')}` : '',
    regimePack.chaos ? 'regime:CHAOS' : '',
    `exec:${execKind}/${orderType}`,
    netEvGate.ok ? 'netEv:ok' : `netEv:${netEvGate.failTag || 'fail'}`,
    flowSnap.bias !== 'UNAVAILABLE' ? `flow:${flowSnap.bias}` : 'flow:UNAVAILABLE',
    normalSetup.ok ? `normalSetup:${normalSetup.score}` : `normalSetup:pend`,
    sfpQuality.active ? sfpQuality.noteKo : '',
    breakoutSnap.active ? breakoutSnap.noteKo : '',
    rsiDiv.noteKo,
    corrCluster.noteKo,
    structuralFinal.noteKo,
    tpFinal.noteKo,
    'p2-macro-liq-battle',
    'p3-exec-netev-flow',
    'p4-sfp-breakout-corr',
    'p5-dual-bridge-lifecycle',
  ].filter(Boolean);

  const reasonOneLineKo = oneLineReasonKo({
    decision,
    dirPref,
    battleZone,
    structureState: structure?.state,
    scores,
    gate,
    sfpNote: sfpQuality.active ? sfpQuality.noteKo : null,
    breakoutNote: breakoutSnap.active ? breakoutSnap.noteKo : null,
    flowNote: flowSnap.summaryKo,
  });

  const strategyFamily = pickTapStrategyFamily({
    sfpActive: sfpQuality.active,
    breakoutActive: breakoutSnap.allowsBreakoutPath,
    eventPath: extreme.allowsEventPath,
    execKind,
  });

  const btSuite = runTapBacktestSuite({
    symbol,
    timeframe,
    candles: params.candles || bars,
  });
  const bestFam = btSuite.families.find((f) => f.id === btSuite.bestFamilyId);
  if (btSuite.bestFamilyId) {
    setupSources.push(`btBest:${btSuite.bestFamilyId}`);
  }
  updateTapOosSnap({
    holdoutPf: bestFam?.holdoutPf ?? null,
    holdoutNetEv: bestFam?.holdoutNetEv ?? null,
    n: bestFam?.sampleSize ?? 0,
  });

  const overfit = evaluateTapOverfitGuard({
    sampleN: bestFam?.sampleSize ?? hist.n,
    inSampleOnly: bestFam != null && bestFam.holdoutNetEv == null,
  });
  if (!overfit.ok) {
    scores.historical = Math.min(scores.historical, 42);
  }

  const paperLive = evaluateTapPaperLiveGate({
    enabled: true,
    liveArmed: false,
    tradingMode: 'PAPER',
    promoteRequest: false,
  });

  const finalDirForSweep =
    decision === 'CONFIRMED_LONG' || decision === 'ARMED_LONG'
      ? ('LONG' as const)
      : decision === 'CONFIRMED_SHORT' || decision === 'ARMED_SHORT'
        ? ('SHORT' as const)
        : dirPref;
  if (finalDirForSweep !== dirPref) {
    sweepLive = buildSweepLiveSignal({
      structure,
      price,
      asOfIndex: Math.max(0, bars.length - 2),
      direction: finalDirForSweep,
    });
    htfSweep = evaluateHtfSweepFilter({
      direction: finalDirForSweep,
      entryTf: timeframe,
      structures: macroBuilt.structures,
      enforce: false,
    });
  }

  const report: TapointDecisionReport = {
    symbol,
    timeframe,
    decidedAt: Date.now(),
    decision,
    entryState,
    execKind,
    orderType,
    execNoteKo,
    direction:
      decision === 'CONFIRMED_LONG' || decision === 'ARMED_LONG'
        ? 'LONG'
        : decision === 'CONFIRMED_SHORT' || decision === 'ARMED_SHORT'
          ? 'SHORT'
          : dirPref,
    scores,
    gate,
    macro,
    regimeKo: regimePack.unifiedKo,
    liquidityMap: {
      summaryKo: liqMap.summaryKo,
      above: liqMap.above.slice(0, 4).map((n) => ({
        kind: n.kind,
        price: n.price,
        labelKo: n.labelKo,
      })),
      below: liqMap.below.slice(0, 4).map((n) => ({
        kind: n.kind,
        price: n.price,
        labelKo: n.labelKo,
      })),
    },
    htfClose,
    battleZone,
    historical: hist,
    extreme: {
      kind: extreme.kind,
      score: extreme.score,
      noteKo: extreme.noteKo,
      allowsEventPath: extreme.allowsEventPath,
      evidence: extreme.evidence,
    },
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    reasonOneLineKo,
    briefingKo: '',
    setupSources,
    signalId:
      decision === 'CONFIRMED_LONG' || decision === 'CONFIRMED_SHORT'
        ? `${TAPOINT_SOURCE}-${symbol}-${timeframe}-${decision}-${bars[bars.length - 2]?.time || 0}`
        : null,
    rejectReasonKo,
    qualityOk,
    qualityNoteKo: params.qualityNoteKo || (qualityOk ? null : 'DATA_QUALITY_BAD'),
    netEv: {
      ok: netEvGate.ok,
      netRrTp1: netEvGate.netRrTp1,
      netRoePct: netEvGate.netRoePct,
      expectedMovePct: netEvGate.expectedMovePct,
      roundTripCostPct: netEvGate.roundTripCostPct,
      noteKo: netEvGate.noteKo,
    },
    flowSnap: {
      bias: flowSnap.bias,
      score: flowSnap.score,
      usableForConfirm: flowSnap.usableForConfirm,
      alignsWithDir: flowSnap.alignsWithDir,
      summaryKo: flowSnap.summaryKo,
    },
    structuralSlNoteKo: structuralFinal.noteKo,
    rsiDiv: {
      rsi: rsiDiv.rsi,
      divergence: rsiDiv.divergence,
      chaseWarn: rsiDiv.chaseWarn,
      slopeKo: rsiDiv.slopeKo,
      noteKo: rsiDiv.noteKo,
    },
    backtestSummaryKo: btSuite.summaryKo,
    metricsNoteKo: bestFam?.metrics.noteKo || null,
    sfpQuality: {
      kind: sfpQuality.kind,
      score: sfpQuality.score,
      active: sfpQuality.active,
      noteKo: sfpQuality.noteKo,
    },
    breakout: {
      active: breakoutSnap.active,
      direction: breakoutSnap.direction,
      score: breakoutSnap.score,
      phaseKo: breakoutSnap.phaseKo,
      noteKo: breakoutSnap.noteKo,
    },
    corrCluster: {
      sameDirCount: corrCluster.sameDirCount,
      symbols: corrCluster.symbols,
      riskHigh: corrCluster.riskHigh,
      allowNew: corrCluster.allowNew,
      noteKo: corrCluster.noteKo,
    },
    paperLive: {
      stage: paperLive.stage,
      tradingMode: paperLive.tradingMode,
      liveAllowed: paperLive.liveAllowed,
      paperOnly: paperLive.paperOnly,
      noteKo: paperLive.noteKo,
    },
    normalSetup: {
      ok: normalSetup.ok,
      score: normalSetup.score,
      noteKo: normalSetup.noteKo,
      tags: normalSetup.tags,
    },
    strategyFamily,
    rejectLedgerId: null,
    sharedMerged: shared,
    volRoeBurst: {
      fired: volBurst.fired,
      direction: volBurst.direction,
      rvol: volBurst.rvol,
      candle: volBurst.candle,
      rsi: volBurst.rsi,
      barTime: volBurst.barTime,
      detectTf: volBurst.detectTf,
      noteKo: volBurst.noteKo,
      targetRoePct: volBurst.targetRoePct,
      leverage: volBurst.leverage,
      priceMovePct: volBurst.priceMovePct,
    },
    sweepLive: {
      fired: sweepLive.fired,
      direction: sweepLive.direction,
      alignsWithDir: sweepLive.alignsWithDir,
      bias: sweepLive.bias,
      level: sweepLive.level,
      ageBars: sweepLive.ageBars,
      reclaimed: sweepLive.reclaimed,
      consecutive2: sweepLive.consecutive2,
      phase: sweepLive.phase,
      sweepCount: sweepLive.sweepCount,
      score: sweepLive.score,
      noteKo: sweepLive.noteKo,
      briefKo: sweepLive.briefKo,
    },
    quickScalp: {
      engine: quickScalp.engine,
      ok: quickScalp.ok,
      autoReady: quickScalp.autoReady,
      direction: quickScalp.direction,
      entry: quickScalp.entry,
      sl: quickScalp.sl,
      tp: quickScalp.tp,
      tpPct: quickScalp.tpPct,
      slPct: quickScalp.slPct,
      quickProfitScore: quickScalp.quickProfitScore,
      immediateAdverseRisk: quickScalp.immediateAdverseRisk,
      profitFirstProbability: quickScalp.profitFirstProbability,
      sampleN: quickScalp.sampleN,
      sampleLabel: quickScalp.sampleLabel,
      grade: quickScalp.grade,
      expectedTpMinLo: quickScalp.expectedTpMinLo,
      expectedTpMinHi: quickScalp.expectedTpMinHi,
      waitReason: quickScalp.waitReason,
      stateKo: quickScalp.stateKo,
      reasonKo: quickScalp.reasonKo,
      whyKo: quickScalp.whyKo,
      machineState: quickScalp.machineState,
      eventId: quickScalp.eventId,
      qualities: quickScalp.qualities,
      structureShift: quickScalp.structureShift,
      atrPercentile: quickScalp.atrPercentile,
      retestTouches: quickScalp.retestTouches,
    },
    sniperScalp: {
      engine: sniperScalp.engine,
      ok: sniperScalp.ok,
      autoReady: sniperScalp.autoReady,
      fire: sniperScalp.fire,
      direction: sniperScalp.direction,
      setupId: sniperScalp.setupId,
      setupKo: sniperScalp.setupKo,
      macro: sniperScalp.macro,
      thesis: sniperScalp.thesis,
      battleZone: sniperScalp.battleZone,
      entry: sniperScalp.entry,
      executionSl: sniperScalp.executionSl,
      thesisInvalidation: sniperScalp.thesisInvalidation,
      tp: sniperScalp.tp,
      tpPct: sniperScalp.tpPct,
      slPct: sniperScalp.slPct,
      netRr: sniperScalp.netRr,
      sniperScore: sniperScalp.sniperScore,
      oppositeFailure: sniperScalp.oppositeFailure,
      leverage: sniperScalp.leverage,
      grade: sniperScalp.grade,
      machineState: sniperScalp.machineState,
      waitReason: sniperScalp.waitReason,
      eventId: sniperScalp.eventId,
      setupIdKey: sniperScalp.setupIdKey,
      sampleN: sniperScalp.sampleN,
      sampleLabel: sniperScalp.sampleLabel,
      tpFirstProbability: sniperScalp.tpFirstProbability,
      fastGreen3m: sniperScalp.fastGreen3m,
      reasonKo: sniperScalp.reasonKo,
      whyKo: sniperScalp.whyKo,
    },
    sweepTfBoard: buildTfSweepPhaseBoard({
      structures: {
        ...macroBuilt.structures,
        [normalizeTapointTf(timeframe) || timeframe]: structure,
      },
      tfs: [
        normalizeTapointTf(timeframe) || timeframe,
        '15m',
        ...TAP_MACRO_TF_ORDER,
      ].filter((t, i, a) => t && a.indexOf(t) === i),
      preferDir: finalDirForSweep,
    }),
    htfSweep: {
      conflict: htfSweep.conflictTfs.length > 0,
      aligned: htfSweep.aligned,
      conflictTfs: htfSweep.conflictTfs,
      alignTfs: htfSweep.alignTfs,
      softConflictTfs: htfSweep.softConflictTfs,
      noteKo: htfSweep.noteKo,
      briefKo: htfSweep.briefKo,
      scoreBoost: htfSweep.scoreBoost,
    },
  };
  try {
    const ib = buildInstitutionalBandTapPlan(
      (params.candles || []).map((c) => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume) || 0,
      })),
      timeframe,
      { leverage: INST_BAND_SCALP_A_LEV }
    );
    const closes = (params.candles || [])
      .map((c) => Number(c.close))
      .filter((x) => x > 0);
    report.chartRsi = rsi14(closes);
    report.instBandPlan = {
      status: ib.status,
      direction: ib.direction,
      actionable: ib.actionable,
      entry: ib.entry,
      sl: ib.sl,
      tp1: ib.tp1,
      rr: ib.rr,
      grade: ib.grade,
      candleKo: ib.candleKo,
      reasonKo: ib.reasonKo,
      bandDir: ib.bandDir,
      band1Dir: ib.band1Dir,
      band2Dir: ib.band2Dir,
      upper: ib.upper,
      mid: ib.mid,
      lower: ib.lower,
      atr: ib.atr,
      huntExtreme: ib.huntExtreme,
    };
  } catch {
    report.instBandPlan = null;
  }
  report.chartSignals = buildTapointChartSignals({
    pipe,
    bars,
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    battleZone,
    extreme: report.extreme,
    direction: report.direction,
    advVolume: shared.advVolume,
    dailyFace: shared.dailyFace,
    volRoeBurst: report.volRoeBurst,
  });
  report.briefingKo = buildTapointBriefingKo(report);

  if (report.decision === 'CONFIRMED_LONG' || report.decision === 'CONFIRMED_SHORT') {
    if (report.direction && report.signalId) {
      registerTapConfirmedCluster({
        symbol,
        direction: report.direction,
        signalId: report.signalId,
      });
    }
    bumpTapPaperStats('confirmed');
  } else {
    const rejId = wireTapRejectFromReport(report, price);
    report.rejectLedgerId = rejId;
    bumpTapPaperStats('reject');
  }

  return report;
}
