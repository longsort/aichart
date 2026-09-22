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

function pickBattleZone(
  zones: { lo: number; hi: number; kind?: string; tier?: string; label?: string }[],
  price: number
): TapBattleZone | null {
  if (!zones?.length || !(price > 0)) return null;
  let best: TapBattleZone | null = null;
  let bestScore = -1;
  for (const z of zones) {
    const lo = Math.min(Number(z.lo), Number(z.hi));
    const hi = Math.max(Number(z.lo), Number(z.hi));
    if (!(lo > 0) || !(hi > 0)) continue;
    const mid = (lo + hi) / 2;
    const dist = Math.abs(price - mid) / price;
    const tierBoost = z.tier === 'S' ? 30 : z.tier === 'A' ? 20 : 10;
    const score = tierBoost - dist * 1000;
    if (score > bestScore) {
      bestScore = score;
      best = {
        lo,
        hi,
        mid,
        labelKo: z.label || z.kind || '전투구간',
        sources: [String(z.kind || 'zone'), String(z.tier || '')].filter(Boolean),
        strength: Math.max(0, Math.min(100, Math.round(50 + tierBoost - dist * 200))),
      };
    }
  }
  return best;
}

function locationScore(price: number, zone: TapBattleZone | null, premiumHint?: string): number {
  if (!zone) return 28;
  const inside = price >= zone.lo && price <= zone.hi;
  const near =
    Math.abs(price - zone.mid) / Math.max(zone.mid, 1) < 0.008;
  let s = inside ? 78 : near ? 62 : 32;
  if (premiumHint === 'PREMIUM' && inside) s -= 12;
  if (premiumHint === 'DISCOUNT' && inside) s += 8;
  return Math.max(0, Math.min(100, s));
}

function mapRegimeKo(r: string | undefined): string {
  const m: Record<string, string> = {
    STRONG_BULL: '강한상승추세',
    BULL: '상승추세',
    RANGE: '횡보',
    BEAR: '하락추세',
    STRONG_BEAR: '강한하락추세',
    ACCUMULATION: '압축·매집',
    DISTRIBUTION: '분산',
    VOLATILITY_EXPANSION: '고변동',
    UNKNOWN: '불명',
  };
  return m[String(r || 'UNKNOWN')] || String(r || '불명');
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
  setupSources?: string[];
  /** Dual/S급 등에서 온 SETUP 힌트 — 즉시 주문 아님 */
  setupHint?: {
    direction?: 'LONG' | 'SHORT' | null;
    grade?: string | null;
    noteKo?: string | null;
  } | null;
  tipMissingAiOnly?: boolean;
};

export function runTapointOrchestrator(params: RunTapointParams): TapointDecisionReport {
  const symbol = String(params.symbol || '').toUpperCase();
  const timeframe = String(params.timeframe || '15m');
  const barsAll = toBars(params.candles || []);
  /** 파이프·유사도 부하 제한 */
  const bars = barsAll.length > 280 ? barsAll.slice(-280) : barsAll;
  const price = Number(bars[bars.length - 1]?.close) || 0;
  const qualityOk = params.qualityOk !== false && bars.length >= 64;

  let pipe = null as ReturnType<typeof runEagle1Pipeline> | null;
  try {
    if (qualityOk) {
      const input: Eagle1PipelineInput = {
        candles: bars,
        timeframe,
        symbol,
        chartMode: 'practical',
        qualityBlocked: !qualityOk,
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
      });
    }
  }

  const battleZone = pickBattleZone(zoneList, price);
  const pd = pipe?.premiumDiscount;
  const locHint =
    pd?.zone === 'PREMIUM'
      ? 'PREMIUM'
      : pd?.zone === 'DISCOUNT'
        ? 'DISCOUNT'
        : pd?.zone === 'EQUILIBRIUM'
          ? 'EQUILIBRIUM'
          : 'UNKNOWN';

  const lastEv = structure?.events?.length
    ? [...structure.events].reverse().find((e) => e.kind !== 'SWING') ||
      structure.events[structure.events.length - 1]
    : null;
  const structBias: TapMacroFrame['direction'] =
    lastEv?.bias === 'bullish' ? 'LONG' : lastEv?.bias === 'bearish' ? 'SHORT' : 'NEUTRAL';

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

  const hist = runTapCausalSimilarity({
    bars,
    direction: extreme.directionHint || dirHint,
    asOfIndex: Math.max(0, bars.length - 2),
  });
  const histScore = historicalScoreFromSnap(hist);

  const locScore = locationScore(price, battleZone, locHint);
  const flowScore = plan?.moneyFlow
    ? plan.moneyFlow.stateKo.includes('매수') || plan.moneyFlow.stateKo.includes('롱')
      ? 68
      : plan.moneyFlow.stateKo.includes('매도') || plan.moneyFlow.stateKo.includes('숏')
        ? 68
        : 48
    : 45;

  const setupBoost =
    params.setupHint?.grade === 'S' || params.setupHint?.grade === 's' ? 12 : 0;

  const scores = buildTapScorePack({
    plan,
    structure,
    locationScore: locScore,
    flowScore,
    liquidityScore: battleZone ? 60 + Math.min(20, battleZone.strength / 5) : 30,
    eventScore: Math.max(
      extreme.score,
      structure?.state === 'SWEEP' || structure?.state === 'SHIFT' ? 72 : 28
    ),
    historicalScore: histScore,
    failureRisk: plan?.noTradeGates?.length
      ? 55 + plan.noTradeGates.length * 5
      : hist.mae != null && hist.mfe != null && hist.mae > hist.mfe * 1.2
        ? 62
        : 35,
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
    extreme.allowsEventPath;
  const hasReclaim =
    structure?.state === 'RETEST' ||
    structure?.state === 'CONFIRMED' ||
    structure?.state === 'SHIFT' ||
    extreme.kind.includes('REVERSAL') ||
    extreme.kind.includes('FAILED');
  const hasMicro =
    plan?.status === 'CONFIRMED_LONG' ||
    plan?.status === 'CONFIRMED_SHORT' ||
    plan?.status === 'LONG_WATCH' ||
    plan?.status === 'SHORT_WATCH' ||
    structure?.state === 'CONFIRMED' ||
    structure?.state === 'RETEST' ||
    extreme.allowsEventPath;

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
    eventPath: extreme.allowsEventPath,
  });

  const dirPref: 'LONG' | 'SHORT' | null =
    extreme.directionHint ||
    params.setupHint?.direction ||
    plan?.direction ||
    (scores.direction >= 55 ? dirHint : null);

  const advanced = advanceTapEntryState({
    direction: dirPref,
    gate,
    scores,
    eventPath: extreme.allowsEventPath,
    qualityOk,
  });
  const { decision, entryState, execKind, rejectReasonKo } = advanced;

  const macro: TapMacroFrame[] = [
    {
      tf: '구조',
      direction: structBias,
      location: (locHint as TapMacroFrame['location']) || 'UNKNOWN',
      structure: String(structure?.state || 'IDLE'),
      momentum: mapRegimeKo(structure?.regime),
      flow: plan?.moneyFlow?.stateKo || '—',
      risk: plan?.noTradeGates?.[0] || extreme.noteKo || '—',
      noteKo: `${mapRegimeKo(structure?.regime)} · ${extreme.kind}`,
    },
  ];

  const entry =
    plan?.entryLow != null && plan?.entryHigh != null
      ? (Number(plan.entryLow) + Number(plan.entryHigh)) / 2
      : battleZone?.mid ?? (price > 0 ? price : null);
  const sl = plan?.sl ?? null;
  const tp1 = plan?.tp1 ?? null;
  const tp2 = plan?.tp2 ?? null;
  const tp3 = plan?.tp3 ?? null;

  const setupSources = [
    ...(params.setupSources || []),
    params.setupHint?.grade ? `grade:${params.setupHint.grade}` : '',
    params.setupHint?.noteKo || '',
    extreme.kind !== 'NONE' ? `event:${extreme.kind}` : '',
  ].filter(Boolean);

  const reasonOneLineKo = oneLineReasonKo({
    decision,
    dirPref,
    battleZone,
    structureState: structure?.state,
    scores,
    gate,
  });

  const report: TapointDecisionReport = {
    symbol,
    timeframe,
    decidedAt: Date.now(),
    decision,
    entryState,
    execKind,
    direction:
      decision === 'CONFIRMED_LONG' || decision === 'ARMED_LONG'
        ? 'LONG'
        : decision === 'CONFIRMED_SHORT' || decision === 'ARMED_SHORT'
          ? 'SHORT'
          : dirPref,
    scores,
    gate,
    macro,
    regimeKo: mapRegimeKo(structure?.regime || plan?.regime),
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
  };
  report.briefingKo = buildTapointBriefingKo(report);
  return report;
}
