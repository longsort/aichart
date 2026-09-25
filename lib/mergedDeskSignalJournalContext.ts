/**
 * 신호 기록부 — 봉 시점 맥락·다중 합류(confluence) 스냅샷.
 * 가중치·조건부 표본 보강용 — 확정 승률·수익 보장 아님.
 */
import type { Candle, AnalyzeResponse } from '@/types';
import type { Eagle1AiZonePack } from '@/lib/eagle1/aiZonePack';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';
import type { Scalp200PlanPack } from '@/lib/mergedDeskScalp200Plan';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { VolumeAiZonePack } from '@/lib/volumeAiZoneEngine';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';
import type { MergedDeskRbMasterStance } from '@/lib/mergedDeskRbMasterStance';
import type { MergedDeskRbLiveEntryHub } from '@/lib/mergedDeskRbLiveEntryHub';
import {
  buildAiCandleToneByTime,
  toneKoShort,
  toneToJournalDirection,
  type AiCandleDumpZoneHint,
} from '@/lib/aiCandleBorderEngine';
import { buildVolumeTfBarMetrics, buildVolumeTfMetricsSeries } from '@/lib/mergedDeskVolumeTfMetrics';
import { verdictShortKo } from '@/lib/volumeAiZoneEngine';
import { DUMP_LIFE_KO } from '@/lib/mergedDeskDumpLifeCycle';

export type DeskSignalContextInput = {
  symbol: string;
  chartTf: string;
  candles: Candle[];
  price: number;
  analyzeVerdict?: string | null;
  analysis?: AnalyzeResponse | null;
  activeTradePlan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  masterFutures?: MasterFuturesDecision | null;
  aiZonePack?: Eagle1AiZonePack | null;
  volumeAiZonePack?: VolumeAiZonePack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  corridorPaint?: MergedDeskRbCorridorPaint | null;
  rbStance?: MergedDeskRbMasterStance | null;
  rbLiveHub?: MergedDeskRbLiveEntryHub | null;
  scalp200Plan?: Scalp200PlanPack | null;
};

export type SignalConfluenceVote = {
  source: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  labelKo: string;
};

function sessionKoFromMs(ms: number): string {
  const h = new Date(ms).getHours();
  if (h >= 7 && h < 15) return '유럽';
  if (h >= 15 && h < 22) return '미국';
  return '아시아';
}

function dumpHints(zones: MtfDumpZoneSpec[] | null | undefined): AiCandleDumpZoneHint[] {
  if (!zones?.length) return [];
  return zones.map((z) => ({
    top: z.top,
    bot: z.bot,
    mid: z.mid,
    lifeState: z.lifeState ?? null,
    bandRole: z.bandRole ?? null,
  }));
}

function activeDumpLifeKo(zones: MtfDumpZoneSpec[] | null | undefined, price: number): string | null {
  if (!zones?.length) return null;
  let best: MtfDumpZoneSpec | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    const mid = z.mid;
    if (!(mid > 0)) continue;
    const d = Math.abs(price - mid) / mid;
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  if (!best?.lifeState) return null;
  return `${best.sourceTfKo || best.sourceTf}·${DUMP_LIFE_KO[best.lifeState]}`;
}

/** 차트 TF 봉 시점 — RSI·MACD·RVOL·세션·플랜·마스터 */
export function buildDeskSignalContextMeta(
  input: DeskSignalContextInput
): Record<string, string | number | boolean | null> {
  const candles = input.candles;
  const last = candles[candles.length - 1] ?? null;
  const lastTime = last ? Number(last.time) : null;
  const plan = input.activeTradePlan;
  const practice = input.practiceAi;
  const master = input.masterFutures;
  const paint = input.corridorPaint;
  const stance = input.rbStance;
  const hub = input.rbLiveHub;

  let rsi: number | null = null;
  let macdHist: number | null = null;
  let rvol: number | null = null;
  let buyPct: number | null = null;
  if (last && candles.length >= 20) {
    const series = buildVolumeTfMetricsSeries({ candles, spotPx: input.price });
    const m = series[series.length - 1];
    if (m) {
      rsi = m.rsi;
      macdHist = m.macdHist;
      rvol = m.rvol;
      buyPct = m.buyPct;
    }
  } else if (last) {
    const m = buildVolumeTfBarMetrics({
      candles,
      barIdx: candles.length - 1,
      spotPx: input.price,
    });
    if (m) {
      rsi = m.rsi;
      macdHist = m.macdHist;
      rvol = m.rvol;
      buyPct = m.buyPct;
    }
  }

  let candleTone: string | null = null;
  if (last && candles.length >= 4) {
    const toneMap = buildAiCandleToneByTime({
      candles,
      timeframe: input.chartTf,
      activeTradePlan: plan ?? null,
      practiceAi: practice ?? null,
      dumpZones: dumpHints(input.dumpZones),
      analyzeVerdict: input.analyzeVerdict ?? null,
      planStatus: plan?.status ?? null,
      planDirection:
        plan?.direction === 'LONG' || plan?.direction === 'SHORT' ? plan.direction : null,
      planEntryAllowed: plan?.entryAllowed,
      planEntry: plan?.entry,
    });
    const tone = toneMap.get(Number(last.time));
    if (tone && tone !== 'none') candleTone = toneKoShort(tone);
  }

  let volVerdictKo: string | null = null;
  if (last && input.volumeAiZonePack?.zones.length) {
    const t = Number(last.time);
    for (const z of input.volumeAiZonePack.zones) {
      if (z.timeFrom <= t && t <= z.timeTo) {
        volVerdictKo = verdictShortKo(z.verdictSide);
        break;
      }
    }
  }

  const rbSide =
    paint?.side === 'long'
      ? 'LONG'
      : paint?.side === 'short'
        ? 'SHORT'
        : stance?.side && stance.side !== 'WAIT'
          ? stance.side
          : hub?.side && hub.side !== 'WAIT'
            ? hub.side
            : null;

  const ghostPct = input.aiZonePack?.ghostResist?.liveHoldPct ?? input.aiZonePack?.ghostResist?.holdPct;
  const supportPct =
    input.aiZonePack?.activeSupport?.liveHoldPct ?? input.aiZonePack?.activeSupport?.holdPct;
  const entryPct = input.aiZonePack?.entry?.liveHoldPct ?? input.aiZonePack?.entry?.holdPct;

  return {
    candleTime: lastTime,
    anchorPrice: input.price,
    sessionKo: sessionKoFromMs(Date.now()),
    analyzeVerdict: input.analyzeVerdict ?? input.analysis?.verdict ?? null,
    planDirection: plan?.direction ?? null,
    planStatus: plan?.status ?? null,
    planEntryAllowed: plan?.entryAllowed ?? null,
    practiceState: practice?.state ?? null,
    practiceSettleKo: practice?.settleKo ?? null,
    practiceEntryAllowed: practice?.entryAllowed ?? null,
    masterSide: master?.side ?? null,
    masterGrade: master?.grade ?? null,
    masterStrength: master?.strength ?? null,
    masterEntryAllowed: master?.entryAllowed ?? null,
    fundingBias: master?.futures?.fundingBias ?? null,
    rsi: rsi != null ? Math.round(rsi * 10) / 10 : null,
    macdHist: macdHist != null ? Math.round(macdHist * 100) / 100 : null,
    rvol: rvol != null ? Math.round(rvol * 100) / 100 : null,
    buyPct: buyPct != null ? Math.round(buyPct) : null,
    candleTone,
    volVerdictKo,
    rbSide,
    rbTrigger: paint?.trigger ?? null,
    rbAtSupport: paint?.atSupport ?? null,
    rbAtResist: paint?.atResist ?? null,
    dumpLifeKo: activeDumpLifeKo(input.dumpZones, input.price),
    aiGhostResistPct: ghostPct != null ? Math.round(ghostPct) : null,
    aiSupportPct: supportPct != null ? Math.round(supportPct) : null,
    aiEntryPct: entryPct != null ? Math.round(entryPct) : null,
    scalp200State: input.scalp200Plan?.state ?? null,
    scalp200ZoneLife: input.scalp200Plan?.zoneLife?.lifeState ?? null,
  };
}

/** 동시점 feature 방향 투표 → 합류 */
export function buildSignalConfluenceVotes(input: DeskSignalContextInput): SignalConfluenceVote[] {
  const ctx = buildDeskSignalContextMeta(input);
  const votes: SignalConfluenceVote[] = [];

  const push = (source: string, dir: unknown, labelKo: string) => {
    const d = String(dir || '').toUpperCase();
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' =
      d === 'LONG' || d === 'BUY' || d === 'BULL'
        ? 'LONG'
        : d === 'SHORT' || d === 'SELL' || d === 'BEAR'
          ? 'SHORT'
          : 'NEUTRAL';
    if (direction === 'NEUTRAL') return;
    votes.push({ source, direction, labelKo });
  };

  if (ctx.candleTone) {
    const tone = String(ctx.candleTone);
    if (tone.includes('롱')) push('candle_tone', 'LONG', tone);
    else if (tone.includes('숏')) push('candle_tone', 'SHORT', tone);
  }
  if (ctx.volVerdictKo) {
    push('volume', ctx.volVerdictKo === '롱' ? 'LONG' : 'SHORT', `거래량${ctx.volVerdictKo}`);
  }
  if (ctx.rbSide) push('rb_corridor', ctx.rbSide, String(ctx.rbSide));
  if (ctx.planDirection) push('active_trade', ctx.planDirection, '실전AI');
  const ps = String(ctx.practiceState ?? '');
  if (ps.includes('LONG')) push('practice_ai', 'LONG', ps);
  if (ps.includes('SHORT')) push('practice_ai', 'SHORT', ps);
  if (ctx.masterSide && ctx.masterSide !== 'WAIT') push('master', ctx.masterSide, '마스터');
  if (ctx.analyzeVerdict) push('analyze', ctx.analyzeVerdict, String(ctx.analyzeVerdict));
  if (input.scalp200Plan?.direction && input.scalp200Plan.direction !== 'NEUTRAL') {
    push('scalp200', input.scalp200Plan.direction, input.scalp200Plan.state);
  }

  const last = input.candles[input.candles.length - 1];
  if (last && input.aiZonePack) {
    const px = input.price;
    const inSupport =
      input.aiZonePack.activeSupport &&
      px >= input.aiZonePack.activeSupport.lower &&
      px <= input.aiZonePack.activeSupport.upper;
    const inResist =
      input.aiZonePack.ghostResist &&
      px >= input.aiZonePack.ghostResist.lower &&
      px <= input.aiZonePack.ghostResist.upper;
    if (inSupport) push('ai_zone', 'LONG', '롱구간');
    if (inResist) push('ai_zone', 'SHORT', '다음저항');
  }

  return votes;
}

export function buildConfluenceMeta(
  input: DeskSignalContextInput,
  eventDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
): Record<string, string | number | boolean | null> {
  const votes = buildSignalConfluenceVotes(input);
  let longN = 0;
  let shortN = 0;
  const labels: string[] = [];
  for (const v of votes) {
    if (v.direction === 'LONG') longN += 1;
    if (v.direction === 'SHORT') shortN += 1;
    labels.push(`${v.source}:${v.labelKo}`);
  }
  const majority =
    longN > shortN ? 'LONG' : shortN > longN ? 'SHORT' : ('NEUTRAL' as const);
  const confluenceScore = Math.max(longN, shortN);
  const confluenceAligned =
    eventDirection !== 'NEUTRAL' && majority === eventDirection && confluenceScore >= 2;

  return {
    confluenceLong: longN,
    confluenceShort: shortN,
    confluenceScore,
    confluenceMajority: majority,
    confluenceAligned,
    confluenceKo: labels.slice(0, 8).join(' · ') || null,
  };
}

export function mergeSignalJournalMeta(
  base: Record<string, string | number | boolean | null> | undefined,
  input: DeskSignalContextInput,
  eventDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
): Record<string, string | number | boolean | null> {
  return {
    ...buildDeskSignalContextMeta(input),
    ...buildConfluenceMeta(input, eventDirection),
    ...(base ?? {}),
  };
}
