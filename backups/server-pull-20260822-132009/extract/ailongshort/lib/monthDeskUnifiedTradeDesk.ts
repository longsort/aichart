/**
 * 마감·안착 **최강 연합 데스크** — API `aiFusion`·`aiZone`·`aiUnified`·확정·마감·SMC·HotZone·구조.
 * 교육·참고용(확정 수익·투자 권유 아님).
 */
import type { Candle, OverlayItem } from '@/types';
import type { AiFusionSignal } from '@/lib/aiFusionSignal';
import type { AiZoneSignal } from '@/lib/aiZoneSignal';
import type { AiUnifiedLongShort } from '@/lib/aiUnifiedLongShort';
import type { ClosingEnvelopeFuturesScenario, InstitutionalSuperTrendCore } from '@/lib/institutionalSuperBand';
import { normalizeChartTimeframe } from '@/lib/constants';
import { buildVolumeHotZoneClustersFromArr } from '@/lib/hotZoneRadar';
import {
  type MonthDeskConfirmedInput,
  type MonthDeskZoneSignal,
  monthDeskZonePalette,
  resolveHotZoneClusterSignal,
  type MonthDeskPriceActionInput,
} from '@/lib/monthDeskZoneSignalPalette';
import { capZoneVerticalSpan, htfMaxPocketSpan, isMonthDeskHtfTimeframe } from '@/lib/monthDeskZonePrecision';
import { computeTradePlan } from '@/lib/tradePlanner';
import { structureMarksFu } from '@/lib/smcDeskOverlay';
import { computeMonthDeskMtfFusionBoost } from '@/lib/monthDeskMtfFusionBoost';
import {
  tightenMonthDeskStopLossLong,
  tightenMonthDeskStopLossShort,
  widenMonthDeskReboundTargetsLong,
  widenMonthDeskReboundTargetsShort,
} from '@/lib/monthDeskStructuralStopPlan';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';

export type MonthDeskTradeDeskTier = 'CONFIRMED' | 'CANDIDATE' | 'BIAS' | 'WAIT' | 'INVALIDATED' | 'MTF_VETO';

export type MonthDeskAnalysisFusionInput = {
  verdict?: 'LONG' | 'SHORT' | 'WATCH' | string | null;
  currentPrice?: number;
  supportLevel?: { price: number } | null;
  resistanceLevel?: { price: number } | null;
  invalidationLevel?: { price: number } | null;
  targets?: Array<number | string>;
  atr?: number;
  longScore?: number;
  shortScore?: number;
  probability?: { longProbability?: number; shortProbability?: number } | null;
  zoneBiasCard?: {
    low: number;
    high: number;
    side: 'LONG' | 'SHORT' | null;
    confidence: number;
    invalidateAbove: number | null;
    invalidateBelow: number | null;
  } | null;
  aiFusionSignal?: AiFusionSignal | null;
  aiZoneSignal?: AiZoneSignal | null;
  aiUnifiedLongShort?: AiUnifiedLongShort | null;
  smcDeskConfluenceLs?: {
    side: 'LONG' | 'SHORT';
    longScore?: number;
    shortScore?: number;
    differsFromVerdict?: boolean;
  } | null;
  structureBouncePath?: { bias: 'up' | 'down' | 'range' } | null;
  settlementZone?: {
    state?: string;
    direction?: 'LONG' | 'SHORT' | 'NONE' | string;
    score?: number;
  } | null;
  frontRunSignal?: {
    state?: string;
    direction?: 'LONG' | 'SHORT' | 'NONE' | string;
    entry?: number;
    stop?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
  } | null;
  smartMoneyMvpSignal?: {
    state?: string;
    workflowState?: string;
  } | null;
  depthDeltaContext?: {
    regime?: 'buy' | 'sell' | 'neutral';
    trapLong?: boolean;
    trapShort?: boolean;
  } | null;
  /** 우측 MTF 마감·안착표 — 연합 점수 보강 */
  mtfCloseSettleBoard?: TfCloseSettleBoard | null;
  chartTimeframe?: string;
};

export type MonthDeskUnifiedFusion = {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  tier: MonthDeskTradeDeskTier;
  displaySignal: MonthDeskZoneSignal;
  scoreLong: number;
  scoreShort: number;
  confidencePct: number;
  reasonsKo: string[];
  lineupKo: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  zoneTop: number;
  zoneBot: number;
  zoneCoreTop: number;
  zoneCoreBot: number;
  headlineKo: string;
  rrApprox: number;
  rr1: number;
  riskPct: number;
  invalidated: boolean;
};

const FUSION_CODE_KO: Record<string, string> = {
  confirmed_long: '5요소 확정 롱',
  confirmed_short: '5요소 확정 숏',
  engine_long: '엔진 롱',
  engine_short: '엔진 숏',
  smc_ls_long: 'SMC 합류 롱',
  smc_ls_short: 'SMC 합류 숏',
  smc_ls_long_soft: 'SMC 롱(약)',
  smc_ls_short_soft: 'SMC 숏(약)',
  prob_long: '확률 롱',
  prob_short: '확률 숏',
  zone_long_confirm: '존 확정 롱',
  zone_short_confirm: '존 확정 숏',
  mtf_align_long: 'MTF 정렬 롱',
  mtf_align_short: 'MTF 정렬 숏',
  whale_long: '고래존 롱',
  whale_short: '고래존 숏',
  settle_long: '안착존 롱',
  settle_short: '안착존 숏',
  vision_long: '패턴 롱',
  vision_short: '패턴 숏',
};

function fmtPx(n: number): string {
  const a = Math.abs(n);
  const frac = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 15) return 0;
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / 14;
}

function parseTargets(raw?: Array<number | string>): number[] {
  if (!raw?.length) return [];
  const out: number[] = [];
  for (const t of raw) {
    const v = typeof t === 'number' ? t : parseFloat(String(t).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

function pickTpLadder(dir: 'LONG' | 'SHORT', entry: number, candidates: number[]): [number, number, number] {
  const uniq = [...new Set(candidates.filter((p) => Number.isFinite(p) && p > 0))];
  if (dir === 'LONG') {
    const ups = uniq.filter((p) => p > entry * 1.0002).sort((a, b) => a - b);
    return [ups[0] ?? entry * 1.012, ups[1] ?? entry * 1.024, ups[2] ?? entry * 1.038];
  }
  const downs = uniq.filter((p) => p < entry * 0.9998).sort((a, b) => b - a);
  return [downs[0] ?? entry * 0.988, downs[1] ?? entry * 0.976, downs[2] ?? entry * 0.962];
}

function fusionCodesToKo(codes: string[]): string[] {
  return codes.slice(0, 6).map((c) => FUSION_CODE_KO[c] ?? c);
}

/** 최강 라인업 점수 — aiFusion hits + aiZone + 마감·차트 전용 */
function computeEliteLineupScores(params: {
  analyze: MonthDeskAnalysisFusionInput | null | undefined;
  scenario: ClosingEnvelopeFuturesScenario | null;
  confirmedSignal?: MonthDeskConfirmedInput | null;
  zoneResolveSignal: MonthDeskZoneSignal;
  candles: Candle[];
  pocketTop: number;
  pocketBot: number;
  stCore?: InstitutionalSuperTrendCore | null;
  chartTimeframe?: string;
}): { scoreLong: number; scoreShort: number; reasonsKo: string[]; lineupKo: string } {
  const { analyze, scenario, confirmedSignal, zoneResolveSignal, candles, pocketTop, pocketBot, stCore, chartTimeframe } =
    params;
  let scoreLong = 0;
  let scoreShort = 0;
  const reasonsKo: string[] = [];
  const lineupParts: string[] = [];

  const af = analyze?.aiFusionSignal;
  if (af) {
    scoreLong += af.longHits * 2.6;
    scoreShort += af.shortHits * 2.6;
    lineupParts.push('aiFusion');
    reasonsKo.push(...fusionCodesToKo(af.reasonCodes));
    if (af.tier === 'confirmed') {
      if (af.verdict === 'LONG') scoreLong += 2;
      if (af.verdict === 'SHORT') scoreShort += 2;
      reasonsKo.push('AI합성·확정등급');
    } else if (af.tier === 'likely') {
      reasonsKo.push('AI합성·유력');
    }
  }

  const az = analyze?.aiZoneSignal;
  if (az) {
    lineupParts.push('aiZone');
    scoreLong += az.longScore * 0.035;
    scoreShort += az.shortScore * 0.035;
    if (az.verdict === 'LONG') reasonsKo.push(`AI존 롱 ${az.longScore}`);
    if (az.verdict === 'SHORT') reasonsKo.push(`AI존 숏 ${az.shortScore}`);
    if (az.stage === 'confirmed') {
      if (az.verdict === 'LONG') scoreLong += 2.5;
      if (az.verdict === 'SHORT') scoreShort += 2.5;
      reasonsKo.push('AI존·확정단계');
    } else if (az.stage === 'prepared') reasonsKo.push('AI존·준비');
  }

  const uni = analyze?.aiUnifiedLongShort;
  if (uni?.primary === 'LONG') {
    scoreLong += 2;
    lineupParts.push('aiUnified');
    reasonsKo.push('통합롱숏·롱');
  } else if (uni?.primary === 'SHORT') {
    scoreShort += 2;
    lineupParts.push('aiUnified');
    reasonsKo.push('통합롱숏·숏');
  }

  const fr = analyze?.frontRunSignal;
  if (fr && (fr.state === 'READY' || fr.state === 'TRIGGERED')) {
    lineupParts.push('frontRun');
    if (fr.direction === 'LONG') {
      scoreLong += 4;
      reasonsKo.push('선행·롱 준비/발화');
    }
    if (fr.direction === 'SHORT') {
      scoreShort += 4;
      reasonsKo.push('선행·숏 준비/발화');
    }
  }

  const smc = analyze?.smcDeskConfluenceLs;
  if (smc?.side === 'LONG') {
    scoreLong += smc.differsFromVerdict ? 1.2 : 2.2;
    lineupParts.push('smcLs');
    reasonsKo.push(smc.differsFromVerdict ? 'SMC합류 롱(약)' : 'SMC합류 롱');
  } else if (smc?.side === 'SHORT') {
    scoreShort += smc.differsFromVerdict ? 1.2 : 2.2;
    lineupParts.push('smcLs');
    reasonsKo.push(smc.differsFromVerdict ? 'SMC합류 숏(약)' : 'SMC합류 숏');
  }

  const sb = analyze?.structureBouncePath;
  if (sb?.bias === 'up') {
    scoreLong += 2.2;
    reasonsKo.push('세트반등·상방');
  } else if (sb?.bias === 'down') {
    scoreShort += 2.2;
    reasonsKo.push('세트반등·하방');
  }

  const sz = analyze?.settlementZone;
  if (sz?.state === 'confirmed' && sz.direction === 'LONG') {
    scoreLong += 2.5;
    reasonsKo.push('안착존 확정 롱');
  } else if (sz?.state === 'confirmed' && sz.direction === 'SHORT') {
    scoreShort += 2.5;
    reasonsKo.push('안착존 확정 숏');
  }

  const mvp = analyze?.smartMoneyMvpSignal;
  if (mvp?.state === 'LONG_READY' || mvp?.workflowState === 'TRIGGERED') {
    scoreLong += 1.5;
    reasonsKo.push('스마트머니 롱준비');
  }

  const prob = analyze?.probability;
  if (prob && typeof prob.longProbability === 'number' && typeof prob.shortProbability === 'number') {
    const d = prob.longProbability - prob.shortProbability;
    if (d >= 12) {
      scoreLong += 1.5;
      reasonsKo.push('확률 롱우세');
    } else if (d <= -12) {
      scoreShort += 1.5;
      reasonsKo.push('확률 숏우세');
    }
  }

  const sig = zoneResolveSignal;
  if (sig === 'CONFIRMED_LONG') {
    scoreLong += 4;
    reasonsKo.push('마감·확정 롱');
  } else if (sig === 'CONFIRMED_SHORT') {
    scoreShort += 4;
    reasonsKo.push('마감·확정 숏');
  } else if (sig === 'LONG_CANDIDATE') {
    scoreLong += 2.5;
  } else if (sig === 'SHORT_CANDIDATE') {
    scoreShort += 2.5;
  } else if (sig === 'LONG') {
    scoreLong += 1.8;
    reasonsKo.push('마감존 롱');
  } else if (sig === 'SHORT') {
    scoreShort += 1.8;
    reasonsKo.push('마감존 숏');
  }

  if (scenario?.lastVerdict === '안착' && scenario.bias === 'LONG') {
    scoreLong += 1.5;
    reasonsKo.push('마감 안착·롱');
  }
  if (scenario?.lastVerdict === '안착' && scenario.bias === 'SHORT') {
    scoreShort += 1.5;
    reasonsKo.push('마감 안착·숏');
  }

  const gates = Number(confirmedSignal?.gatesPassCount ?? 0);
  if (confirmedSignal?.mtfBlocked || confirmedSignal?.readinessTier === 'mtf_veto') {
    scoreLong *= 0.85;
    scoreShort *= 0.85;
    reasonsKo.push('MTF 보류');
  } else if (confirmedSignal?.direction === 'LONG' && gates >= 4) {
    scoreLong += 2;
    reasonsKo.push(`게이트 ${gates}/5 롱`);
  } else if (confirmedSignal?.direction === 'SHORT' && gates >= 4) {
    scoreShort += 2;
    reasonsKo.push(`게이트 ${gates}/5 숏`);
  }

  const close = Number(analyze?.currentPrice ?? candles[candles.length - 1]?.close);
  const mid = (pocketTop + pocketBot) / 2;
  const span = Math.max(pocketTop - pocketBot, 1e-9);
  if (Number.isFinite(close)) {
    if (close < pocketBot - span * 0.02) {
      scoreShort += 2.2;
      reasonsKo.push('종가·존 하향 이탈');
    } else if (close > pocketTop + span * 0.02) {
      scoreLong += 1.5;
    } else {
      scoreLong += close >= mid ? 0.6 : 0;
      scoreShort += close < mid ? 0.6 : 0;
    }
  }

  const end = candles.length - 1;
  const marks = structureMarksFu(candles, 2, 8);
  const lastMk = marks.length ? marks[marks.length - 1] : null;
  if (lastMk?.bias === 'bullish') scoreLong += 1;
  if (lastMk?.bias === 'bearish') scoreShort += 1;

  const stTrend = stCore?.trend?.[end];
  if (stTrend === 1) scoreLong += 0.9;
  if (stTrend === -1) scoreShort += 0.9;

  const arr = candles.slice(-Math.min(120, candles.length));
  const clusters = buildVolumeHotZoneClustersFromArr(arr, 32, 82);
  const recentBars = arr.slice(-8).map((c) => ({ open: c.open, close: c.close, high: c.high, low: c.low }));
  if (clusters?.length) {
    const best = [...clusters].sort((a, b) => b.strength - a.strength)[0]!;
    const hz = resolveHotZoneClusterSignal(
      {
        bot: best.bot,
        top: best.top,
        center: best.center,
        fullH: best.fullH,
        inside: best.inside,
        longProb: best.longProb,
        shortProb: best.shortProb,
        probSampleN: best.probSampleN,
      },
      recentBars,
      analyze?.verdict === 'LONG' || analyze?.verdict === 'SHORT' ? analyze.verdict : null
    );
    if (hz === 'LONG') {
      scoreLong += 1.4;
      lineupParts.push('hotZone');
    } else if (hz === 'SHORT') {
      scoreShort += 1.4;
      lineupParts.push('hotZone');
    }
  }

  const dd = analyze?.depthDeltaContext;
  if (dd?.trapLong) scoreShort += 1.5;
  if (dd?.trapShort) scoreLong += 1.5;

  const mtfBoost = computeMonthDeskMtfFusionBoost(
    analyze?.mtfCloseSettleBoard,
    chartTimeframe ?? analyze?.chartTimeframe ?? '4h'
  );
  if (mtfBoost) {
    scoreLong += mtfBoost.scoreLong;
    scoreShort += mtfBoost.scoreShort;
    reasonsKo.push(...mtfBoost.reasonsKo);
    lineupParts.push('mtfBoard');
    if (mtfBoost.conflict) reasonsKo.push('MTF표·방향 혼재');
  }

  const lineupKo = [...new Set(lineupParts)].slice(0, 8).join('+') || '마감·차트';
  return { scoreLong, scoreShort, reasonsKo: [...new Set(reasonsKo)].slice(0, 14), lineupKo };
}

function resolveEliteLevels(params: {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  analyze: MonthDeskAnalysisFusionInput | null | undefined;
  pocketTop: number;
  pocketBot: number;
  legHi: number;
  legLo: number;
  entrySeed: number;
  atr: number;
  timeframe: string;
  close: number;
  scenario: ClosingEnvelopeFuturesScenario | null;
  stCore?: InstitutionalSuperTrendCore | null;
  end: number;
}): { entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number; zoneTop: number; zoneBot: number } {
  const { direction, analyze, pocketTop, pocketBot, legHi, legLo, entrySeed, atr, timeframe, close, scenario, stCore, end } =
    params;

  let zoneTop = pocketTop;
  let zoneBot = pocketBot;
  let entry = entrySeed;
  let stopLoss = entrySeed;
  let tp1 = entrySeed;
  let tp2 = entrySeed;
  let tp3 = entrySeed;

  const fr = analyze?.frontRunSignal;
  const frActive =
    fr &&
    (fr.state === 'READY' || fr.state === 'TRIGGERED') &&
    (fr.direction === 'LONG' || fr.direction === 'SHORT') &&
    fr.direction === direction;
  if (frActive && Number.isFinite(fr.entry) && Number.isFinite(fr.stop)) {
    entry = Number(fr.entry);
    stopLoss = Number(fr.stop);
    tp1 = Number(fr.tp1) || tp1;
    tp2 = Number(fr.tp2) || tp2;
    tp3 = Number(fr.tp3) || tp3;
  }

  const az = analyze?.aiZoneSignal?.zone;
  if (az && (direction === 'LONG' || direction === 'SHORT') && az.side === direction) {
    zoneTop = Math.max(az.high, az.low);
    zoneBot = Math.min(az.high, az.low);
    if (!frActive) {
      entry = (zoneTop + zoneBot) / 2;
      if (Number.isFinite(close) && close >= zoneBot && close <= zoneTop) entry = close;
      if (az.invalidation != null && Number.isFinite(az.invalidation)) stopLoss = az.invalidation;
      if (az.targetHint != null && Number.isFinite(az.targetHint)) tp1 = az.targetHint;
    }
  }

  const watch = analyze?.aiUnifiedLongShort?.watch;
  if (watch && watch.side === direction && zoneTop - zoneBot < (legHi - legLo) * 0.35) {
    zoneTop = Math.max(zoneTop, watch.high);
    zoneBot = Math.min(zoneBot, watch.low);
  }

  const invUni = analyze?.aiUnifiedLongShort?.invalidation?.price;
  if (direction === 'LONG' || direction === 'SHORT') {
    const eq =
      Number(analyze?.supportLevel?.price) > 0 && Number(analyze?.resistanceLevel?.price) > 0
        ? (Number(analyze!.supportLevel!.price) + Number(analyze!.resistanceLevel!.price)) / 2
        : (zoneTop + zoneBot) / 2;
    const plan = computeTradePlan({
      signal: direction,
      currentPrice: close,
      equilibrium: eq,
      rangeHigh: legHi,
      rangeLow: legLo,
      atr,
      timeframe: normalizeChartTimeframe(timeframe),
    });
    if (!frActive) {
      entry = entry * 0.55 + plan.entry * 0.45;
      entry = Math.max(zoneBot, Math.min(zoneTop, entry));
    }
    const swingSl = direction === 'LONG' ? legLo - atr * 0.35 : legHi + atr * 0.35;
    const envInv =
      scenario?.invalidationPrice != null && Number.isFinite(Number(scenario.invalidationPrice))
        ? Number(scenario.invalidationPrice)
        : null;
    if (direction === 'LONG') {
      const cands = [
        stopLoss,
        swingSl,
        envInv != null && scenario?.invalidationSide === 'below' ? envInv : swingSl,
        analyze?.invalidationLevel?.price,
        invUni,
        plan.stopLoss,
        zoneBot - atr * 0.4,
      ].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
      stopLoss = tightenMonthDeskStopLossLong({
        entry,
        zoneBot,
        zoneTop,
        atr,
        legLo,
        timeframe,
        looseCandidates: cands,
      });
    } else {
      const cands = [
        stopLoss,
        swingSl,
        envInv != null && scenario?.invalidationSide === 'above' ? envInv : swingSl,
        analyze?.invalidationLevel?.price,
        invUni,
        plan.stopLoss,
        zoneTop + atr * 0.4,
      ].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
      stopLoss = tightenMonthDeskStopLossShort({
        entry,
        zoneBot,
        zoneTop,
        atr,
        legHi,
        timeframe,
        looseCandidates: cands,
      });
    }
    const legTp =
      direction === 'LONG'
        ? [legHi, legHi + Math.min((legHi - entry) * 0.5, atr * 2.5)]
        : [legLo, legLo - Math.min((entry - legLo) * 0.5, atr * 2.5)];
    const srTp =
      direction === 'LONG'
        ? [analyze?.resistanceLevel?.price, stCore?.finalUpper?.[end]]
        : [analyze?.supportLevel?.price, stCore?.finalLower?.[end]];
    const [p1, p2, p3] = pickTpLadder(direction, entry, [
      tp1,
      tp2,
      tp3,
      ...plan.targets,
      ...legTp,
      ...parseTargets(analyze?.targets),
      ...srTp.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)),
    ]);
    tp1 = p1;
    tp2 = p2;
    tp3 = p3;
    if (direction === 'LONG') {
      const wide = widenMonthDeskReboundTargetsLong({
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        legHi,
        swingHi:
          analyze?.resistanceLevel?.price != null
            ? Number(analyze.resistanceLevel.price)
            : undefined,
        atr,
      });
      tp1 = wide.tp1;
      tp2 = wide.tp2;
      tp3 = wide.tp3;
    } else {
      const wide = widenMonthDeskReboundTargetsShort({
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        legLo,
        swingLo:
          analyze?.supportLevel?.price != null ? Number(analyze.supportLevel.price) : undefined,
        atr,
      });
      tp1 = wide.tp1;
      tp2 = wide.tp2;
      tp3 = wide.tp3;
    }
  }

  return { entry, stopLoss, tp1, tp2, tp3, zoneTop, zoneBot };
}

export function computeMonthDeskUnifiedFusion(params: {
  candles: Candle[];
  timeframe: string;
  pocketTop: number;
  pocketBot: number;
  legHi: number;
  legLo: number;
  scenario: ClosingEnvelopeFuturesScenario | null;
  confirmedSignal?: MonthDeskConfirmedInput | null;
  analyze?: MonthDeskAnalysisFusionInput | null;
  stCore?: InstitutionalSuperTrendCore | null;
  zoneResolveSignal: MonthDeskZoneSignal;
}): MonthDeskUnifiedFusion {
  const {
    candles,
    timeframe,
    pocketTop: pocketTopIn,
    pocketBot: pocketBotIn,
    legHi,
    legLo,
    scenario,
    confirmedSignal,
    analyze,
    stCore,
    zoneResolveSignal,
  } = params;

  const end = candles.length - 1;
  const close = Number(analyze?.currentPrice ?? candles[end]?.close);
  const atr = Number(analyze?.atr) > 0 ? Number(analyze?.atr) : atr14(candles);
  const midIn = (pocketTopIn + pocketBotIn) / 2;

  const elite = computeEliteLineupScores({
    analyze,
    scenario,
    confirmedSignal,
    zoneResolveSignal,
    candles,
    pocketTop: pocketTopIn,
    pocketBot: pocketBotIn,
    stCore,
    chartTimeframe: params.timeframe,
  });

  let { scoreLong, scoreShort, reasonsKo, lineupKo } = elite;

  if (zoneResolveSignal === 'WAIT_MTF' || (confirmedSignal?.mtfBlocked && Number(confirmedSignal?.gatesPassCount ?? 0) >= 5)) {
    return {
      direction: 'WAIT',
      tier: 'MTF_VETO',
      displaySignal: 'WAIT_MTF',
      scoreLong,
      scoreShort,
      confidencePct: 50,
      reasonsKo,
      lineupKo,
      entry: midIn,
      stopLoss: midIn - atr,
      tp1: midIn + atr * 2,
      tp2: midIn + atr * 3,
      tp3: midIn + atr * 4,
      zoneTop: pocketTopIn,
      zoneBot: pocketBotIn,
      zoneCoreTop: midIn + atr * 0.2,
      zoneCoreBot: midIn - atr * 0.2,
      headlineKo: `연합·MTF보류 (롱 ${scoreLong.toFixed(1)} vs 숏 ${scoreShort.toFixed(1)})`,
      rrApprox: 0,
      rr1: 0,
      riskPct: 0,
      invalidated: false,
    };
  }

  const margin = 1.15;
  let direction: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (scoreLong > scoreShort + margin) direction = 'LONG';
  else if (scoreShort > scoreLong + margin) direction = 'SHORT';

  const total = scoreLong + scoreShort;
  const confidencePct =
    total > 0
      ? Math.round(
          (100 * (direction === 'LONG' ? scoreLong : direction === 'SHORT' ? scoreShort : Math.max(scoreLong, scoreShort))) /
            total
        )
      : 50;

  let tier: MonthDeskTradeDeskTier = 'WAIT';
  if (direction !== 'WAIT') {
    const azStage = analyze?.aiZoneSignal?.stage;
    const afTier = analyze?.aiFusionSignal?.tier;
    if (
      zoneResolveSignal === 'CONFIRMED_LONG' ||
      zoneResolveSignal === 'CONFIRMED_SHORT' ||
      (afTier === 'confirmed' && analyze?.aiFusionSignal?.verdict === direction) ||
      (azStage === 'confirmed' && analyze?.aiZoneSignal?.verdict === direction)
    ) {
      tier = 'CONFIRMED';
    } else if (
      zoneResolveSignal === 'LONG_CANDIDATE' ||
      zoneResolveSignal === 'SHORT_CANDIDATE' ||
      afTier === 'likely' ||
      azStage === 'prepared' ||
      Number(confirmedSignal?.gatesPassCount ?? 0) >= 4
    ) {
      tier = 'CANDIDATE';
    } else {
      tier = 'BIAS';
    }
  }

  let displaySignal: MonthDeskZoneSignal = zoneResolveSignal;
  if (direction === 'LONG') {
    if (tier === 'CONFIRMED') displaySignal = 'CONFIRMED_LONG';
    else if (tier === 'CANDIDATE') displaySignal = 'LONG_CANDIDATE';
    else displaySignal = 'LONG';
  } else if (direction === 'SHORT') {
    if (tier === 'CONFIRMED') displaySignal = 'CONFIRMED_SHORT';
    else if (tier === 'CANDIDATE') displaySignal = 'SHORT_CANDIDATE';
    else displaySignal = 'SHORT';
  } else {
    displaySignal = zoneResolveSignal === 'MISMATCH' ? 'MISMATCH' : 'WAIT';
  }

  const levels =
    direction === 'LONG' || direction === 'SHORT'
      ? resolveEliteLevels({
          direction,
          analyze,
          pocketTop: pocketTopIn,
          pocketBot: pocketBotIn,
          legHi,
          legLo,
          entrySeed: midIn,
          atr,
          timeframe,
          close,
          scenario,
          stCore,
          end,
        })
      : {
          entry: midIn,
          stopLoss: midIn - atr,
          tp1: midIn + atr * 2,
          tp2: midIn + atr * 3,
          tp3: midIn + atr * 4,
          zoneTop: pocketTopIn,
          zoneBot: pocketBotIn,
        };

  let { entry, stopLoss, tp1, tp2, tp3, zoneTop, zoneBot } = levels;

  const chartTf = normalizeChartTimeframe(timeframe);
  const htf = isMonthDeskHtfTimeframe(chartTf);
  const pocketSpan = Math.max(zoneTop - zoneBot, 1e-9);
  const maxSpan = htf
    ? htfMaxPocketSpan({ legHi, legLo, atr, refPrice: close || entry, timeframe: chartTf })
    : Math.max(pocketSpan * 0.5, atr * 1.05);
  const capped = capZoneVerticalSpan(zoneTop, zoneBot, entry, maxSpan);
  zoneTop = Math.min(capped.top, legHi);
  zoneBot = Math.max(capped.bot, legLo);

  const coreHalf = Math.max(pocketSpan * (htf ? 0.05 : 0.07), atr * 0.2);
  let zoneCoreTop = Math.min(zoneTop, entry + coreHalf);
  let zoneCoreBot = Math.max(zoneBot, entry - coreHalf);

  let invalidated = false;
  if (direction === 'LONG' && Number.isFinite(close) && close < stopLoss) invalidated = true;
  if (direction === 'SHORT' && Number.isFinite(close) && close > stopLoss) invalidated = true;
  if (invalidated) {
    tier = 'INVALIDATED';
    displaySignal = 'WAIT';
    reasonsKo = [...reasonsKo, 'SL 무효·종가 이탈'];
  }

  const risk = Math.abs(entry - stopLoss);
  const sign = direction === 'SHORT' ? -1 : 1;
  const rr1 = risk > 0 ? Math.round(((tp1 - entry) * sign) / risk * 100) / 100 : 0;
  const rrApprox = risk > 0 ? Math.round(((tp2 - entry) * sign) / risk * 100) / 100 : 0;
  const riskPct = Number.isFinite(close) && close > 0 ? Math.round((risk / close) * 10000) / 100 : 0;

  const tierKo: Record<MonthDeskTradeDeskTier, string> = {
    CONFIRMED: '확정',
    CANDIDATE: '후보',
    BIAS: '편향',
    WAIT: '대기',
    INVALIDATED: '무효',
    MTF_VETO: 'MTF보류',
  };
  const tierLabel = tierKo[tier];
  const dirKo = direction === 'LONG' ? '롱' : direction === 'SHORT' ? '숏' : '대기';
  const headlineKo =
    direction === 'WAIT'
      ? `연합·${tierLabel} (롱 ${scoreLong.toFixed(1)} vs 숏 ${scoreShort.toFixed(1)}) · ${lineupKo}`
      : `연합·${dirKo}·${tierLabel} ${confidencePct}% · E ${fmtPx(entry)} · SL ${fmtPx(stopLoss)} · RR1 ${rr1}`;

  return {
    direction,
    tier,
    displaySignal,
    scoreLong,
    scoreShort,
    confidencePct,
    reasonsKo,
    lineupKo,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    zoneTop,
    zoneBot,
    zoneCoreTop,
    zoneCoreBot,
    headlineKo,
    rrApprox,
    rr1,
    riskPct,
    invalidated,
  };
}

export function buildMonthDeskUnifiedZoneOverlays(
  fusion: MonthDeskUnifiedFusion,
  t1: number,
  t2: number,
  signal: MonthDeskZoneSignal
): OverlayItem[] {
  const pal = monthDeskZonePalette(signal);
  const dirKo = fusion.direction === 'LONG' ? '롱' : fusion.direction === 'SHORT' ? '숏' : '대기';
  const zoneKind: OverlayItem['kind'] =
    fusion.direction === 'SHORT' ? 'supplyZone' : fusion.direction === 'LONG' ? 'demandZone' : 'zone';

  const tierKo =
    fusion.tier === 'CONFIRMED'
      ? '★확정'
      : fusion.tier === 'CANDIDATE'
        ? '◐후보'
        : fusion.tier === 'INVALIDATED'
          ? '✕무효'
          : '';

  const tip = [
    fusion.headlineKo,
    `라인업: ${fusion.lineupKo}`,
    ...fusion.reasonsKo.slice(0, 6),
    `진입(E) ${fmtPx(fusion.entry)} · 손절(SL) ${fmtPx(fusion.stopLoss)} · 위험~${fusion.riskPct}%`,
    `수익 TP1 ${fmtPx(fusion.tp1)} (RR1~${fusion.rr1}) · TP2 ${fmtPx(fusion.tp2)} · TP3 ${fmtPx(fusion.tp3)}`,
    '최강연합(aiFusion+aiZone+마감+SMC+HotZone) — 참고용.',
  ].join('\n');

  const out: OverlayItem[] = [
    {
      id: 'month-desk-unified-zone',
      kind: zoneKind,
      label:
        fusion.direction === 'LONG'
          ? '연합L'
          : fusion.direction === 'SHORT'
            ? '연합S'
            : '연합',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: Math.min(t1, t2),
      time2: t2,
      price1: fusion.zoneTop,
      price2: fusion.zoneBot,
      confidence: Math.min(99, Math.round(fusion.confidencePct)),
      color: pal.zoneFill,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      lineLabelColor: pal.lineLabel,
      labelBackgroundColor:
        fusion.direction === 'LONG'
          ? 'rgba(21,128,61,0.94)'
          : fusion.direction === 'SHORT'
            ? 'rgba(127,29,29,0.94)'
            : 'rgba(113,63,18,0.92)',
      labelTextColor: '#f8fafc',
      zonePulse: fusion.tier === 'CONFIRMED' || fusion.tier === 'CANDIDATE',
      overlayZoneExtraClass: `overlay-zone--monthdesk-unified overlay-zone--monthdesk-typeom--${pal.cssDir} overlay-zone--monthdesk-tier--${fusion.tier.toLowerCase()}`,
    } as OverlayItem,
  ];

  if (fusion.zoneCoreTop > fusion.zoneCoreBot + 1e-9) {
    out.push({
      id: 'month-desk-unified-core',
      kind: zoneKind,
      label: '코어',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: Math.min(t1, t2),
      time2: t2,
      price1: fusion.zoneCoreTop,
      price2: fusion.zoneCoreBot,
      confidence: Math.min(95, Math.round(fusion.confidencePct)),
      color: pal.coreFill,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      overlayZoneExtraClass: `overlay-zone--monthdesk-unified-core overlay-zone--monthdesk-typeom--${pal.cssDir}`,
    } as OverlayItem);
  }
  return out;
}

/** 손절·수익 구간 면 + E/SL/TP 가로선(차트 한눈에) */
export function buildMonthDeskTradeDeskPlanOverlays(
  fusion: MonthDeskUnifiedFusion,
  t1: number,
  t2: number,
  signal: MonthDeskZoneSignal
): OverlayItem[] {
  if (fusion.direction !== 'LONG' && fusion.direction !== 'SHORT') return [];
  const pal = monthDeskZonePalette(signal);
  const tA = Math.min(t1, t2);
  const tB = t2;
  const { entry, stopLoss, tp1, tp2, tp3, direction } = fusion;
  const out: OverlayItem[] = [];

  const baseLine = (partial: Omit<OverlayItem, 'x1' | 'y1' | 'x2' | 'y2' | 'confidence'>): OverlayItem => ({
    ...partial,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    confidence: 88,
    time1: tA,
    time2: tB,
    category: 'scenario',
  });

  if (direction === 'LONG') {
    const riskTop = entry;
    const riskBot = Math.min(stopLoss, entry - 1e-9);
    if (riskTop > riskBot) {
      out.push({
        id: 'month-desk-plan-risk-zone',
        kind: 'demandZone',
        label: '연합·위험(E↔SL)',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: tA,
        time2: tB,
        price1: riskTop,
        price2: riskBot,
        confidence: 70,
        color: 'rgba(239,68,68,0.06)',
        category: 'scenario',
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'overlay-zone--monthdesk-plan-risk',
        labelTooltip: `연합 손절(SL) ${fmtPx(stopLoss)} — phz·타입옴과 함께 참고`,
      } as OverlayItem);
    }
    if (tp1 > entry) {
      out.push({
        id: 'month-desk-plan-reward-zone',
        kind: 'demandZone',
        label: '연합·TP1 구간',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: tA,
        time2: tB,
        price1: tp1,
        price2: entry,
        confidence: 72,
        color: 'rgba(34,197,94,0.06)',
        category: 'scenario',
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'overlay-zone--monthdesk-plan-reward',
        labelTooltip: `연합 1차 수익 E→TP1 · RR1~${fusion.rr1}`,
      } as OverlayItem);
    }
  } else {
    const riskBot = entry;
    const riskTop = Math.max(stopLoss, entry + 1e-9);
    if (riskTop > riskBot) {
      out.push({
        id: 'month-desk-plan-risk-zone',
        kind: 'supplyZone',
        label: '연합·위험(E↔SL)',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: tA,
        time2: tB,
        price1: riskTop,
        price2: riskBot,
        confidence: 70,
        color: 'rgba(239,68,68,0.06)',
        category: 'scenario',
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'overlay-zone--monthdesk-plan-risk',
        labelTooltip: `연합 손절(SL) ${fmtPx(stopLoss)} — phz·타입옴과 함께 참고`,
      } as OverlayItem);
    }
    if (tp1 < entry) {
      out.push({
        id: 'month-desk-plan-reward-zone',
        kind: 'supplyZone',
        label: '연합·TP1 구간',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: tA,
        time2: tB,
        price1: entry,
        price2: tp1,
        confidence: 72,
        color: 'rgba(34,197,94,0.06)',
        category: 'scenario',
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'overlay-zone--monthdesk-plan-reward',
        labelTooltip: `연합 1차 수익 E→TP1 · RR1~${fusion.rr1}`,
      } as OverlayItem);
    }
  }

  const slW = fusion.tier === 'CONFIRMED' ? 3 : 2;
  const eW = fusion.tier === 'CONFIRMED' ? 4 : 3;

  out.push(
    baseLine({
      id: 'month-desk-plan-sl',
      kind: 'keyLevel',
      label: 'SL',
      price1: stopLoss,
      price2: stopLoss,
      color: pal.slLine,
      lineLabelColor: '#fecaca',
      lineDash: '5 4',
      lineStrokeWidth: slW,
      labelTooltip: `${fusion.headlineKo} · 구조 맞춤 짧은 손절(참고)`,
      overlayZoneExtraClass: 'overlay-zone--monthdesk-plan-line-sl',
    }),
    baseLine({
      id: 'month-desk-plan-entry',
      kind: 'keyLevel',
      label: 'E',
      price1: entry,
      price2: entry,
      color: pal.entryLine,
      lineLabelColor: '#e0f2fe',
      lineStrokeWidth: eW,
      labelTooltip: `연합 진입(E) · ${fusion.lineupKo}`,
      overlayZoneExtraClass: 'overlay-zone--monthdesk-plan-line-entry',
    }),
    baseLine({
      id: 'month-desk-plan-tp1',
      kind: 'keyLevel',
      label: `TP1`,
      price1: tp1,
      price2: tp1,
      color: pal.tpLine,
      lineLabelColor: '#bbf7d0',
      lineDash: '8 5',
      lineStrokeWidth: 2,
      labelTooltip: `TP1 ${fmtPx(tp1)} · RR1~${fusion.rr1}`,
    }),
    baseLine({
      id: 'month-desk-plan-tp2',
      kind: 'keyLevel',
      label: `TP2`,
      price1: tp2,
      price2: tp2,
      color: pal.tpLineSoft,
      lineLabelColor: '#86efac',
      lineDash: '8 6',
      lineStrokeWidth: 2,
      labelTooltip: `TP2 ${fmtPx(tp2)} · RR~${fusion.rrApprox}`,
    }),
    baseLine({
      id: 'month-desk-plan-tp3',
      kind: 'keyLevel',
      label: `TP3`,
      price1: tp3,
      price2: tp3,
      color: pal.tpLineSoft,
      lineLabelColor: '#86efac',
      lineDash: '6 8',
      lineStrokeWidth: 1,
      labelTooltip: `TP3 ${fmtPx(tp3)} — 참고`,
    })
  );

  return out;
}

export type { MonthDeskPriceActionInput };
