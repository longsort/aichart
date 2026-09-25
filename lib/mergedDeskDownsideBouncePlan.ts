/**

 * 통합·분석 — CHoCH/BOS SMC 구조 분석 기반 하방 shelf + 지지 후 반등 경로.

 * smcLeading(CHOCH·BOS·OB·bounceHint) 우선 — fib 투영은 SMC 부재 시만 보조.

 */

import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

import type { UTCTimestamp } from 'lightweight-charts';

import { normalizeChartTimeframe } from '@/lib/constants';

import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';

import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';

import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';

import type {

  MergedSmcLeadingContext,

  MergedSmcLeadingOb,

  MergedSmcStructureMark,

} from '@/lib/mergedAnalysisSmcLeading';

import {

  detectProjectedDownsideSupports,

  type ProjectedDownsideSupport,

} from '@/lib/mergedDeskProjectedDownsideSupports';

import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';

/** 통합·분석 — CHoCH/BOS 하방 shelf 차트·HUD (false = 숨김, 코드는 유지) */
export const MERGED_DESK_DOWNSIDE_BOUNCE_PLAN_VISIBLE = false;

export type DownsideBounceSet = {

  id: string;

  supportPrice: number;

  bounceT1: number;

  bounceTmax: number;

  labelKo: string;

  sourceKo: string;

  color: string;

};



export type SmcDownsidePlanPhase =

  | 'BEAR_CHOCH'

  | 'BEAR_BOS'

  | 'CHOCH_FAILED'

  | 'BULL_WATCH'

  | 'WAIT';



const SET_PALETTE = [

  { stroke: '#22d3ee', fill: 'rgba(34,211,238,0.14)', path: 'rgba(34,211,238,0.07)', tag: '①' },

  { stroke: '#60a5fa', fill: 'rgba(96,165,250,0.13)', path: 'rgba(96,165,250,0.06)', tag: '②' },

  { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.12)', path: 'rgba(167,139,250,0.06)', tag: '③' },

] as const;



function fmtPx(p: number): string {

  const a = Math.abs(p);

  if (a >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });

  if (a >= 1) return p.toFixed(1);

  return p.toFixed(3);

}



function estimateAtr(candles: Candle[], endIdx: number, period = 14): number {

  const start = Math.max(1, endIdx - period + 1);

  let sum = 0;

  let n = 0;

  for (let i = start; i <= endIdx; i++) {

    const c = candles[i]!;

    const p = candles[i - 1]!.close;

    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));

    n++;

  }

  return n > 0 ? sum / n : Math.abs(candles[endIdx]?.close ?? 1) * 0.01;

}



type SmcPlanRow = {

  id: string;

  role: 'choch' | 'ob' | 'bos' | 'leg' | 'liquidity' | 'proj';

  supportPrice: number;

  top: number;

  bot: number;

  bounceT1: number;

  bounceTmax: number;

  anchorTime: number;

  labelKo: string;

  sourceKo: string;

  score: number;

};



function resolveSmcPhase(smc: MergedSmcLeadingContext | null | undefined): SmcDownsidePlanPhase {

  if (!smc?.active && !smc?.lastChoch) return 'WAIT';

  const choch = smc.lastChoch;

  if (choch?.phase === 'failed') return 'CHOCH_FAILED';

  if (choch?.bias === 'bearish') return 'BEAR_CHOCH';

  if (smc.legDirection === 'down' && smc.bosCountInLeg >= 1) return 'BEAR_BOS';

  if (smc.legDirection === 'up' || choch?.bias === 'bullish') return 'BULL_WATCH';

  return 'WAIT';

}



/** CHoCH 레그 기준 — 지지 후 반등 T1/Tmax (BOS 많을수록 얕은 반등) */

function reboundAfterSupport(params: {

  support: number;

  legHigh: number;

  chochPrice: number;

  atr: number;

  bosCount: number;

}): { t1: number; tmax: number } {

  const { support, legHigh, chochPrice, atr, bosCount } = params;

  const span = Math.max(legHigh - support, atr * 1.5);

  const shallow = bosCount >= 4;

  const t1 = support + span * (shallow ? 0.236 : 0.382);

  const tmaxRaw = support + span * (shallow ? 0.382 : 0.618);

  const tmax = Math.min(chochPrice > support ? chochPrice : tmaxRaw, tmaxRaw);

  return {

    t1: Math.max(support + atr * 0.1, t1),

    tmax: Math.max(t1 + atr * 0.12, tmax),

  };

}



function findTouchTime(work: Candle[], price: number, atr: number, beforeIdx?: number): number {

  const end = beforeIdx ?? work.length - 1;

  const tol = Math.max(atr * 0.5, Math.abs(price) * 0.004);

  const start = Math.max(0, end - Math.min(140, work.length));

  let bestIdx = -1;

  let bestScore = -Infinity;

  for (let i = start; i < end; i++) {

    const c = work[i]!;

    if (c.low > price + tol || c.high < price - tol) continue;

    const score = i / work.length;

    if (score > bestScore) {

      bestScore = score;

      bestIdx = i;

    }

  }

  if (bestIdx >= 0) return Number(work[bestIdx]!.time);

  let loIdx = start;

  let loDiff = Infinity;

  for (let i = start; i < end; i++) {

    const d = Math.abs(work[i]!.low - price);

    if (d < loDiff) {

      loDiff = d;

      loIdx = i;

    }

  }

  return Number(work[loIdx]!.time);

}



function legBoundsFromSmc(

  work: Candle[],

  smc: MergedSmcLeadingContext,

  choch: MergedSmcStructureMark | null

): { legHigh: number; legLow: number; chochPrice: number; anchorTime: number } {

  const hint = smc.bounceHint;

  const chochPrice = choch?.price ?? work[work.length - 1]!.close;

  const anchorTime = choch?.time ?? Number(work[Math.max(0, work.length - 24)]!.time);

  if (hint) {

    return { legHigh: hint.legHigh, legLow: hint.legLow, chochPrice, anchorTime };

  }

  const idx = choch?.index ?? work.length - 1;

  const start = Math.max(0, idx - 80);

  let legHigh = -Infinity;

  let legLow = Infinity;

  for (let i = start; i <= idx; i++) {

    legHigh = Math.max(legHigh, work[i]!.high);

    legLow = Math.min(legLow, work[i]!.low);

  }

  if (!Number.isFinite(legHigh) || !Number.isFinite(legLow)) {

    legHigh = work[work.length - 1]!.high;

    legLow = work[work.length - 1]!.low;

  }

  return { legHigh, legLow, chochPrice, anchorTime };

}



function pushRow(rows: SmcPlanRow[], row: SmcPlanRow, close: number, atr: number): void {

  if (!Number.isFinite(row.supportPrice) || row.supportPrice >= close - atr * 0.05) return;

  const tol = Math.max(atr * 0.35, close * 0.004);

  const dup = rows.find((r) => Math.abs(r.supportPrice - row.supportPrice) <= tol);

  if (dup) {

    dup.score = Math.max(dup.score, row.score);

    dup.sourceKo = `${dup.sourceKo} · ${row.sourceKo}`;

    return;

  }

  rows.push(row);

}



/** CHoCH/BOS·OB·레그 기준 지지 shelf 후보 */

function buildSmcDownsideRows(params: {

  work: Candle[];

  smc: MergedSmcLeadingContext;

  phase: SmcDownsidePlanPhase;

  close: number;

  atr: number;

}): SmcPlanRow[] {

  const { work, smc, phase, close, atr } = params;

  const choch = smc.lastChoch;

  const { legHigh, legLow, chochPrice, anchorTime } = legBoundsFromSmc(work, smc, choch);

  const bosCount = smc.bosCountInLeg;

  const rows: SmcPlanRow[] = [];



  const mkRebound = (support: number) =>

    reboundAfterSupport({ support, legHigh, chochPrice, atr, bosCount });



  if (phase === 'BEAR_CHOCH' || phase === 'BEAR_BOS') {

    const demandObs = smc.obs.filter((o) => o.bias === 'bullish' && o.high < close - atr * 0.08);

    for (const ob of demandObs.slice(0, 2)) {

      const mid = (ob.low + ob.high) / 2;

      const { t1, tmax } = mkRebound(mid);

      pushRow(rows, {

        id: `smc-ob-${ob.chochIndex}`,

        role: 'ob',

        supportPrice: mid,

        top: ob.high,

        bot: ob.low,

        bounceT1: t1,

        bounceTmax: tmax,

        anchorTime: ob.time,

        labelKo: 'CHoCH↓ OB(수요)',

        sourceKo: ob.labelKo,

        score: phase === 'BEAR_CHOCH' ? 88 : 82,

      }, close, atr);

    }



    if (legLow < close - atr * 0.1) {

      const { t1, tmax } = mkRebound(legLow);

      pushRow(rows, {

        id: 'smc-leg-low',

        role: 'leg',

        supportPrice: legLow,

        top: legLow + atr * 0.22,

        bot: legLow - atr * 0.28,

        bounceT1: t1,

        bounceTmax: tmax,

        anchorTime: findTouchTime(work, legLow, atr, choch?.index),

        labelKo: 'CHoCH 레그 저점',

        sourceKo: `레그 ${fmtPx(legLow)}~${fmtPx(legHigh)}`,

        score: 86,

      }, close, atr);

    }



    const bearMarks = smc.marks

      .filter((m) => m.bias === 'bearish' && m.price < close - atr * 0.06)

      .slice(-4);

    for (const m of bearMarks) {

      if (m.tag === 'CHOCH' && m.index === choch?.index) continue;

      const pad = atr * 0.18;

      const { t1, tmax } = mkRebound(m.price);

      pushRow(rows, {

        id: `smc-${m.tag.toLowerCase()}-${m.index}`,

        role: m.tag === 'BOS' ? 'bos' : 'choch',

        supportPrice: m.price,

        top: m.price + pad * 0.45,

        bot: m.price - pad * 0.55,

        bounceT1: t1,

        bounceTmax: tmax,

        anchorTime: m.time,

        labelKo: m.tag === 'BOS' ? `BOS↓ ${fmtPx(m.price)}` : `CH↓ ${fmtPx(m.price)}`,

        sourceKo: `${m.tag} ${String(m.phase)} · BOS${bosCount}`,

        score: m.tag === 'BOS' ? 78 : 74,

      }, close, atr);

    }



    const hint = smc.bounceHint;

    if (hint?.direction === 'down' && hint.t2 < close - atr * 0.12) {

      const { t1, tmax } = mkRebound(hint.t2);

      pushRow(rows, {

        id: 'smc-hint-t2',

        role: 'liquidity',

        supportPrice: hint.t2,

        top: hint.t2 + atr * 0.2,

        bot: hint.t2 - atr * 0.25,

        bounceT1: t1,

        bounceTmax: Math.min(tmax, hint.t1 > hint.t2 ? hint.t1 : tmax),

        anchorTime: hint.anchorTime,

        labelKo: 'SMC 하락 T2',

        sourceKo: hint.strengthKo,

        score: 80,

      }, close, atr);

    }

  }



  if (phase === 'CHOCH_FAILED' && choch) {

    const band = Math.max(atr * 0.35, Math.abs(choch.price) * 0.004);

    const { t1, tmax } = mkRebound(choch.price - band * 0.5);

    pushRow(rows, {

      id: 'smc-choch-failed',

      role: 'choch',

      supportPrice: choch.price,

      top: choch.price + band,

      bot: choch.price - band,

      bounceT1: t1,

      bounceTmax: tmax,

      anchorTime: choch.time,

      labelKo: 'CHoCH 무효·전환',

      sourceKo: 'CHoCH 안착 실패 — 반전 감시',

      score: 70,

    }, close, atr);

  }



  if (phase === 'BULL_WATCH') {

    const demandOb = smc.obs.find((o) => o.bias === 'bullish' && o.high < close);

    if (demandOb) {

      const mid = (demandOb.low + demandOb.high) / 2;

      const { t1, tmax } = mkRebound(mid);

      pushRow(rows, {

        id: 'smc-bull-watch-ob',

        role: 'ob',

        supportPrice: mid,

        top: demandOb.high,

        bot: demandOb.low,

        bounceT1: t1,

        bounceTmax: tmax,

        anchorTime: demandOb.time,

        labelKo: '상방 CHoCH·눌림 OB',

        sourceKo: 'CHoCH↑ 레그 눌림 (하방 대비)',

        score: 65,

      }, close, atr);

    }

  }



  rows.sort((a, b) => b.supportPrice - a.supportPrice);

  return rows.slice(0, 3);

}



function fallbackRowsFromProjection(

  supports: ProjectedDownsideSupport[],

  work: Candle[],

  close: number,

  atr: number,

  legHigh: number,

  chochPrice: number,

  bosCount: number

): SmcPlanRow[] {

  return supports.slice(0, 2).map((s, i) => {

    const { t1, tmax } = reboundAfterSupport({

      support: s.price,

      legHigh,

      chochPrice,

      atr,

      bosCount,

    });

    return {

      id: s.id,

      role: 'proj' as const,

      supportPrice: s.price,

      top: s.top,

      bot: s.bot,

      bounceT1: t1,

      bounceTmax: tmax,

      anchorTime: findTouchTime(work, s.price, atr),

      labelKo: s.labelKo.replace(/^하방 핵심지지 · /, ''),

      sourceKo: s.sourceKo,

      score: 60 - i * 4,

    };

  });

}



function planHorizonTimes(

  work: Candle[],

  tf: string,

  breakTime: number | null,

  anchorTimes: number[]

): { t1: UTCTimestamp; t2: UTCTimestamp } {

  const tEnd = Number(work[work.length - 1]!.time);

  const candidates = [breakTime, ...anchorTimes].filter(

    (t): t is number => t != null && Number.isFinite(t) && t < tEnd

  );

  let tStart = candidates.length ? Math.min(...candidates) : Number(work[Math.max(0, work.length - 48)]!.time);

  const minSpan = 86400 * 1.5; // 4h 참조 — 전 TF 동일 최소 zone 시간폭
  if (tEnd - tStart < minSpan) {
    tStart = Math.max(Number(work[0]!.time), tEnd - minSpan);
  }

  return { t1: tStart as UTCTimestamp, t2: tEnd as UTCTimestamp };

}



function phaseLabelKo(phase: SmcDownsidePlanPhase, smc: MergedSmcLeadingContext): string {

  const choch = smc.lastChoch;

  const bos = smc.bosCountInLeg;

  switch (phase) {

    case 'BEAR_CHOCH':

      return choch?.phase === 'confirmed'

        ? `CHoCH↓ 안착 · BOS ${bos}`

        : choch?.phase === 'settling'

          ? `CHoCH↓ 안착중 · BOS ${bos}`

          : `CHoCH↓ ${choch?.developing ? '선행' : '돌파'} · BOS ${bos}`;

    case 'BEAR_BOS':

      return `하락 BOS ${bos} · 연속 하방`;

    case 'CHOCH_FAILED':

      return 'CHoCH 무효 · 전환 감시';

    case 'BULL_WATCH':

      return `CHoCH↑ · 하방 shelf 참고`;

    default:

      return 'SMC 구조 대기';

  }

}



function buildOverlaysFromRows(params: {

  rows: SmcPlanRow[];

  work: Candle[];

  tf: string;

  phase: SmcDownsidePlanPhase;

  smc: MergedSmcLeadingContext;

  choch: MergedSmcStructureMark | null;

  showChochRail: boolean;

}): OverlayItem[] {

  const { rows, work, tf, phase, smc, choch, showChochRail } = params;

  if (!rows.length) return [];



  const lastT = Number(work[work.length - 1]!.time) as UTCTimestamp;

  const breakTime = choch?.time ?? null;

  const anchorTimes = rows.map((r) => r.anchorTime);

  const { t1: planT1, t2: planT2 } = planHorizonTimes(work, tf, breakTime, anchorTimes);

  const overlays: OverlayItem[] = [];



  if (showChochRail && choch && (phase === 'BEAR_CHOCH' || phase === 'BEAR_BOS')) {

    const band = Math.max(Math.abs(choch.price) * 0.0012, 1);

    overlays.push({

      id: 'merged-desk-downside-plan-choch-rail',

      kind: 'supplyZone',

      label: '',

      x1: 0,

      y1: 0,

      x2: 1,

      y2: 0,

      time1: snapPlanT(choch.time, planT1) as UTCTimestamp,

      time2: planT2,

      price1: choch.price + band,

      price2: choch.price - band,

      confidence: 84,

      color: 'rgba(248,113,113,0.08)',

      category: 'scenario',

      zoneFillPreserve: true,

      zoneSpanOnly: true,

      overlayZoneExtraClass: [

        'merged-desk-downside-plan',

        'merged-desk-downside-plan-choch-rail',

      ].join(' '),

      labelTooltip: `CHoCH↓ ${fmtPx(choch.price)} · 재돌파 시 하방 시나리오 약화 (조건부)`,

    });

  }



  for (let i = 0; i < rows.length; i++) {

    const row = rows[i]!;

    const pal = SET_PALETTE[Math.min(i, SET_PALETTE.length - 1)]!;

    const setClass = `merged-desk-downside-plan-set-${i + 1}`;

    const shelfT1 = Math.min(planT1, row.anchorTime) as UTCTimestamp;

    const compactLabel = `${pal.tag} ${fmtPx(row.supportPrice)} → ${fmtPx(row.bounceT1)}`;



    overlays.push({

      id: `merged-desk-downside-plan-zone-${i}-${Math.round(row.supportPrice)}`,

      kind: 'demandZone',

      label: compactLabel,

      x1: 0,

      y1: 0,

      x2: 1,

      y2: 0,

      time1: shelfT1,

      time2: planT2,

      price1: row.top,

      price2: row.bot,

      confidence: Math.min(92, row.score),

      color: pal.fill,

      category: 'scenario',

      zoneFillPreserve: true,

      zoneSpanOnly: true,

      overlayZoneExtraClass: [

        'merged-desk-downside-plan',

        'merged-desk-downside-plan-support',

        'merged-desk-downside-plan-zone',

        setClass,

        row.role === 'proj' ? 'merged-desk-downside-plan-zone--proj' : 'merged-desk-downside-plan-zone--smc',

      ].join(' '),

      lineLabelColor: pal.stroke,

      labelTooltip: `${row.labelKo} · ${row.sourceKo} · Tmax ${fmtPx(row.bounceTmax)} (조건부)`,

    });



    const pathLo = Math.min(row.supportPrice, row.bounceT1, row.bounceTmax);

    const pathHi = Math.max(row.supportPrice, row.bounceT1, row.bounceTmax);

    const pathPad = Math.max(Math.abs(row.supportPrice) * 0.001, 1);

    overlays.push({

      id: `merged-desk-downside-plan-path-${i}`,

      kind: 'demandZone',

      label: '',

      x1: 0,

      y1: 0,

      x2: 1,

      y2: 0,

      time1: row.anchorTime as UTCTimestamp,

      time2: planT2,

      price1: pathHi + pathPad,

      price2: pathLo - pathPad,

      confidence: 66,

      color: pal.path,

      category: 'scenario',

      zoneFillPreserve: true,

      zoneSpanOnly: true,

      overlayZoneExtraClass: [

        'merged-desk-downside-plan',

        'merged-desk-downside-plan-path',

        setClass,

      ].join(' '),

    });



    overlays.push({

      id: `merged-desk-downside-plan-conn-${i}`,

      kind: 'trendLine',

      label: '',

      x1: 0,

      y1: 0,

      x2: 1,

      y2: 1,

      time1: row.anchorTime as UTCTimestamp,

      time2: lastT,

      price1: row.supportPrice,

      price2: row.bounceT1,

      confidence: 72,

      color: pal.stroke,

      category: 'scenario',

      lineDash: '6 5',

      lineStrokeWidth: 1.25,

      noProject: true,

      overlayZoneExtraClass: [

        'merged-desk-downside-plan',

        'merged-desk-downside-plan-connector',

        setClass,

      ].join(' '),

      labelTooltip: compactLabel,

    });



    overlays.push({

      id: `merged-desk-downside-plan-bounce-t1-${i}`,

      kind: 'keyLevel',

      label: '',

      x1: 0,

      y1: 0,

      x2: 1,

      y2: 0,

      time1: shelfT1,

      time2: planT2,

      price1: row.bounceT1,

      price2: row.bounceT1,

      confidence: 70,

      color: pal.stroke,

      category: 'scenario',

      lineDash: '5 6',

      lineStrokeWidth: 1,

      noProject: true,

      overlayZoneExtraClass: [

        'merged-desk-downside-plan',

        'merged-desk-downside-plan-bounce',

        'merged-desk-downside-plan-bounce-t1',

        setClass,

      ].join(' '),

    });



    if (Math.abs(row.bounceTmax - row.bounceT1) > pathPad * 8) {

      overlays.push({

        id: `merged-desk-downside-plan-bounce-tmax-${i}`,

        kind: 'keyLevel',

        label: '',

        x1: 0,

        y1: 0,

        x2: 1,

        y2: 0,

        time1: shelfT1,

        time2: planT2,

        price1: row.bounceTmax,

        price2: row.bounceTmax,

        confidence: 74,

        color: pal.stroke,

        category: 'scenario',

        lineDash: '2 7',

        lineStrokeWidth: 0.9,

        noProject: true,

        overlayZoneExtraClass: [

          'merged-desk-downside-plan',

          'merged-desk-downside-plan-bounce',

          'merged-desk-downside-plan-bounce-tmax',

          setClass,

        ].join(' '),

      });

    }

  }



  return overlays;

}



function snapPlanT(t: number, floor: UTCTimestamp): UTCTimestamp {

  return (Number.isFinite(t) && t > Number(floor) ? t : Number(floor)) as UTCTimestamp;

}



export type MergedDeskDownsideBouncePlanPack = {

  summaryKo: string;

  detailKo: string;

  bearBreak: boolean;

  smcPhase: SmcDownsidePlanPhase;

  sets: DownsideBounceSet[];

  overlays: OverlayItem[];

};



export function buildMergedDeskDownsideBouncePlanPack(params: {

  candles: Candle[];

  timeframe: string;

  keyZones?: MergedKeyZone[];

  criticalZones?: MergedCriticalZone[];

  bounceScenarios?: MergedBounceScenario[];

  smcLeading?: MergedSmcLeadingContext | null;

  analysis?: AnalyzeResponse | null;

  vrvp?: { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;

  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;

}): MergedDeskDownsideBouncePlanPack {

  if (!MERGED_DESK_DOWNSIDE_BOUNCE_PLAN_VISIBLE) {
    return {
      summaryKo: '',
      detailKo: '',
      bearBreak: false,
      smcPhase: 'WAIT',
      sets: [],
      overlays: [],
    };
  }

  const tf = normalizeChartTimeframe(params.timeframe);

  const work = mergedWorkCandles(params.candles, tf);

  const empty: MergedDeskDownsideBouncePlanPack = {

    summaryKo: '',

    detailKo: '',

    bearBreak: false,

    smcPhase: 'WAIT',

    sets: [],

    overlays: [],

  };

  if (work.length < 24) return empty;



  const smc = params.smcLeading;

  const close = work[work.length - 1]!.close;

  const atr = estimateAtr(work, work.length - 1);

  const phase = resolveSmcPhase(smc);

  const choch = smc?.lastChoch ?? null;

  const bearBreak = phase === 'BEAR_CHOCH' || phase === 'BEAR_BOS';



  if (phase === 'WAIT' || !smc) {

    return {

      ...empty,

      summaryKo: smc?.summaryKo ? `${smc.summaryKo}` : 'SMC 구조 대기',

    };

  }



  let rows = buildSmcDownsideRows({ work, smc, phase, close, atr });



  if (rows.length < 2 && (phase === 'BEAR_CHOCH' || phase === 'BEAR_BOS')) {

    const { legHigh, chochPrice } = legBoundsFromSmc(work, smc, choch);

    const projected = detectProjectedDownsideSupports({

      candles: params.candles,

      timeframe: params.timeframe,

      keyZones: params.keyZones,

      criticalZones: params.criticalZones,

      bounceScenarios: params.bounceScenarios,

      vrvp: params.vrvp,

      analysis: params.analysis,

      whaleMemoryZones: params.whaleMemoryZones,

    });

    const fallback = fallbackRowsFromProjection(

      projected,

      work,

      close,

      atr,

      legHigh,

      chochPrice,

      smc.bosCountInLeg

    );

    for (const f of fallback) {

      pushRow(rows, f, close, atr);

    }

    rows = rows.sort((a, b) => b.supportPrice - a.supportPrice).slice(0, 3);

  }



  const sets: DownsideBounceSet[] = rows.map((row, i) => ({

    id: row.id,

    supportPrice: row.supportPrice,

    bounceT1: row.bounceT1,

    bounceTmax: row.bounceTmax,

    labelKo: `${SET_PALETTE[Math.min(i, SET_PALETTE.length - 1)]!.tag} ${row.labelKo}`,

    sourceKo: row.sourceKo,

    color: SET_PALETTE[Math.min(i, SET_PALETTE.length - 1)]!.stroke,

  }));



  const overlays = buildOverlaysFromRows({

    rows,

    work,

    tf,

    phase,

    smc,

    choch,

    showChochRail: phase === 'BEAR_CHOCH' || phase === 'BEAR_BOS',

  });



  const phaseKo = phaseLabelKo(phase, smc);

  const depth = sets.length ? `${fmtPx(sets[0]!.supportPrice)} → ${fmtPx(sets[sets.length - 1]!.supportPrice)}` : '—';

  const summaryKo =

    sets.length > 0

      ? `${phaseKo} · shelf ${depth}`

      : phaseKo;



  const detailKo = [

    smc.detailKo,

    sets.map((s) => `${s.labelKo} T1 ${fmtPx(s.bounceT1)}`).join(' · '),

  ]

    .filter(Boolean)

    .join(' · ');



  return {

    summaryKo,

    detailKo,

    bearBreak,

    smcPhase: phase,

    sets,

    overlays,

  };

}

