/**
 * AI 캔들 테두리 — **타점(E) 중심** 통합 연동.
 * 본봉(상승/하락)과 분리 · 꼬리/테두리만 색.
 *
 * 원칙 (선물 실전):
 * - 거래량만 빠졌다고 숏/롱 **확정(진한색) 금지** → 물림 방지.
 * - **노랑** = E 근처·합류 대기 (진입 금지)
 * - **연한 녹/적** = E **터치(TOUCH)** · 주시
 * - **진한 녹/적** = E **확정(ENTER)** + 거래량·플랜·폭락존·구조 합류
 *
 * 연동: ActiveTrade · 실전AI · 폭락존 · 거래량AI · AVWAP판정 · 고래빔
 * 확정 수익·승률 보장 없음.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  buildVolumeTfMetricsSeries,
  type VolumeTfBarMetrics,
} from '@/lib/mergedDeskVolumeTfMetrics';
import {
  applyVolumeVerdictCandleBorders,
  type VolumeAiZonePack,
} from '@/lib/volumeAiZoneEngine';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import type { DumpLifeState } from '@/lib/mergedDeskDumpLifeCycle';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';

export type AiCandleBorderTone =
  | 'long_confirmed'
  | 'short_confirmed'
  | 'long_watch'
  | 'short_watch'
  | 'wait'
  | 'none';

const BORDER: Record<Exclude<AiCandleBorderTone, 'none'>, string> = {
  long_confirmed: '#16a34a',
  short_confirmed: '#dc2626',
  long_watch: '#86efac',
  short_watch: '#fca5a5',
  wait: '#eab308',
};

export const AI_CANDLE_BORDER_HEX = BORDER;

export function aiCandleBorderHex(tone: AiCandleBorderTone): string | null {
  if (tone === 'none') return null;
  return BORDER[tone];
}

export type AiCandleDumpZoneHint = {
  top: number;
  bot: number;
  mid?: number;
  lifeState?: DumpLifeState | string | null;
  bandRole?: 'floor' | 'ceiling' | string | null;
};

/** 타점 앵커 — E·존 mid·폭락 바닥/천장 */
export type AiCandleEntryAnchor = {
  direction: 'LONG' | 'SHORT';
  entry: number;
  top?: number;
  bot?: number;
  sourceKo?: string;
};

export type AiCandleBorderInputs = {
  candles: Candle[];
  timeframe?: string;
  volumeAiZonePack?: VolumeAiZonePack | null;
  analyzeVerdict?: string | null;
  planStatus?: string | null;
  planDirection?: 'LONG' | 'SHORT' | null;
  planEntryAllowed?: boolean;
  planEntry?: number;
  activeTradePlan?: MergedDeskActiveTradePlan | null;
  whaleBeamIntel?: WhaleBeamIntelPack | null;
  spotPx?: number | null;
  lastBarsHighlight?: number;
  dumpZones?: AiCandleDumpZoneHint[] | null;
  /** 명시 타점 — 없으면 plan/practice/dump에서 구성 */
  entryAnchors?: AiCandleEntryAnchor[] | null;
  practiceAi?: PracticeAiPlanPack | null;
  /** E 밴드 폭 (가격 대비) — 기본 0.45% */
  entryApproachRatio?: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeDir(v: string | null | undefined): 'LONG' | 'SHORT' | 'WAIT' | null {
  const s = String(v || '').toUpperCase();
  if (s === 'LONG' || s === 'BUY' || s === 'BULL') return 'LONG';
  if (s === 'SHORT' || s === 'SELL' || s === 'BEAR') return 'SHORT';
  if (s === 'WAIT' || s === 'NEUTRAL' || s === 'FLAT') return 'WAIT';
  return null;
}

function approxAtr(rows: Candle[], i: number, len = 14): number {
  const end = Math.min(rows.length, i + 1);
  const start = Math.max(1, end - len);
  let s = 0;
  let c = 0;
  for (let j = start; j < end; j++) {
    const a = rows[j]!;
    const b = rows[j - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  const px = Number(rows[i]?.close) || 1;
  return c > 0 ? s / c : px * 0.004;
}

function barWickRatios(row: Candle): { upperR: number; lowerR: number; bodyUp: boolean } {
  const hi = Number(row.high);
  const lo = Number(row.low);
  const cl = Number(row.close);
  const o = Number(row.open);
  const range = hi - lo;
  if (!(range > 0)) return { upperR: 0, lowerR: 0, bodyUp: cl >= o };
  return {
    upperR: (hi - Math.max(o, cl)) / range,
    lowerR: (Math.min(o, cl) - lo) / range,
    bodyUp: cl >= o,
  };
}

function entryBand(entry: number, atr: number, ratio: number): { lo: number; hi: number } {
  const pad = Math.max(Math.abs(entry) * ratio, atr * 0.38, Math.abs(entry) * 0.0007);
  return { lo: entry - pad, hi: entry + pad };
}

function barTouchesBand(bar: Candle, lo: number, hi: number): boolean {
  const bLo = Number(bar.low);
  const bHi = Number(bar.high);
  return bHi >= lo && bLo <= hi;
}

function barOverlapsZone(hi: number, lo: number, top: number, bot: number, pad: number): boolean {
  const zHi = Math.max(top, bot);
  const zLo = Math.min(top, bot);
  return lo <= zHi + pad && hi >= zLo - pad;
}

/** plan · 실전AI · 폭락존 → 타점 앵커 */
export function buildAiCandleEntryAnchors(params: {
  plan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  dumpZones?: AiCandleDumpZoneHint[] | null;
}): AiCandleEntryAnchor[] {
  const out: AiCandleEntryAnchor[] = [];
  const seen = new Set<string>();

  const push = (a: AiCandleEntryAnchor) => {
    if (!(a.entry > 0)) return;
    const k = `${a.direction}:${Math.round(a.entry)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };

  const plan = params.plan;
  if (plan && plan.direction !== 'NEUTRAL' && plan.entry > 0) {
    push({
      direction: plan.direction,
      entry: plan.entry,
      sourceKo: plan.sourceKo || 'ActiveTrade',
    });
  }

  const pa = params.practiceAi;
  if (pa && pa.direction !== 'NEUTRAL' && pa.entry > 0) {
    push({
      direction: pa.direction,
      entry: pa.entry,
      sourceKo: '실전AI',
    });
  }

  for (const z of params.dumpZones ?? []) {
    const top = Number(z.top);
    const bot = Number(z.bot);
    const mid = Number(z.mid) || (top + bot) / 2;
    if (!(top > 0) || !(bot > 0)) continue;
    const role = String(z.bandRole || '');
    const st = String(z.lifeState || '');
    if (role === 'floor' || st === 'BOUNCE_WATCH' || st === 'CONFIRM_UP') {
      push({ direction: 'LONG', entry: mid, top, bot, sourceKo: '폭락·반등E' });
    }
    if (role === 'ceiling' || st === 'RESIST_WATCH' || st === 'CONFIRM_RESIST' || st === 'CONFIRM_DOWN') {
      push({ direction: 'SHORT', entry: mid, top, bot, sourceKo: '폭락·저항E' });
    }
  }

  return out;
}

type EntryCtx = {
  analyze: 'LONG' | 'SHORT' | 'WAIT' | null;
  planDir: 'LONG' | 'SHORT' | null;
  planSt: string;
  planEnter: boolean;
  planTouch: boolean;
  planEntryAllowed: boolean;
  practiceEnter: boolean;
  practiceTouch: boolean;
  practiceEntryAllowed: boolean;
  beam: 'LONG' | 'SHORT' | null;
};

function dumpAtBar(
  hi: number,
  lo: number,
  cl: number,
  zones: AiCandleDumpZoneHint[] | null | undefined,
  dir: 'LONG' | 'SHORT'
): { confirm: boolean; touch: boolean; wait: boolean } {
  if (!zones?.length) return { confirm: false, touch: false, wait: false };
  const mid = (hi + lo) / 2 || cl;
  const pad = Math.max(Math.abs(mid) * 0.0009, 8);
  let confirm = false;
  let touch = false;
  let wait = false;
  for (const z of zones) {
    const top = Number(z.top);
    const bot = Number(z.bot);
    if (!(top > 0) || !(bot > 0)) continue;
    if (!barOverlapsZone(hi, lo, top, bot, pad)) continue;
    const st = String(z.lifeState || 'WATCH');
    const role = String(z.bandRole || '');
    if (dir === 'LONG') {
      if (st === 'CONFIRM_UP') confirm = true;
      else if (st === 'BOUNCE_WATCH' || role === 'floor') touch = true;
      else if (st === 'WATCH' && role === 'floor') wait = true;
    } else {
      if (st === 'CONFIRM_DOWN' || st === 'CONFIRM_RESIST') confirm = true;
      else if (st === 'RESIST_WATCH' || role === 'ceiling') touch = true;
      else if (st === 'WATCH' && role === 'ceiling') wait = true;
    }
  }
  return { confirm, touch, wait };
}

/**
 * 타점 밴드 + 합류 → 톤.
 * 저거래량 단독 → confirmed 불가 (wait/watch만).
 */
function toneAtEntryBar(
  bar: Candle,
  anchor: AiCandleEntryAnchor,
  m: VolumeTfBarMetrics | undefined,
  dumpZones: AiCandleDumpZoneHint[] | null | undefined,
  ctx: EntryCtx,
  isLastBar: boolean
): AiCandleBorderTone {
  const dir = anchor.direction;
  const { upperR, lowerR, bodyUp } = barWickRatios(bar);
  const hi = Number(bar.high);
  const lo = Number(bar.low);
  const cl = Number(bar.close);
  const rvol = m?.rvol ?? null;
  const lowVol = rvol != null && rvol < 0.88;
  const volOk = rvol != null && rvol >= 1.02;
  const volStrong = rvol != null && rvol >= 1.35;

  const dump = dumpAtBar(hi, lo, cl, dumpZones, dir);
  const planAlign = ctx.planDir === dir;
  const analyzeAlign = ctx.analyze === dir;

  const rejectShort = upperR >= 0.24 || (!bodyUp && upperR >= 0.16);
  const rejectLong = lowerR >= 0.24 || (bodyUp && lowerR >= 0.16);

  const practiceAlign =
    ctx.practiceEntryAllowed || ctx.practiceTouch || ctx.practiceEnter;
  const planLive =
    isLastBar &&
    planAlign &&
    (ctx.planEnter || ctx.planTouch || ctx.planEntryAllowed);
  const practiceLive =
    isLastBar && practiceAlign && (ctx.practiceEnter || ctx.practiceTouch);

  /** ── SHORT 타점 ── */
  if (dir === 'SHORT') {
    const structOk = rejectShort || !bodyUp;
    const volGate = !lowVol && (volOk || ctx.beam === 'SHORT' || m?.sellDominant === true);
    const confirmCore =
      structOk &&
      volGate &&
      (dump.confirm ||
        (planLive && ctx.planEnter && ctx.planEntryAllowed) ||
        (practiceLive && ctx.practiceEntryAllowed && ctx.practiceEnter));
    if (confirmCore) return 'short_confirmed';

    const touchCore =
      structOk &&
      (dump.touch ||
        (planLive && ctx.planTouch) ||
        (practiceLive && ctx.practiceTouch) ||
        (isLastBar && analyzeAlign && rejectShort));
    if (touchCore) return lowVol ? 'wait' : 'short_watch';

    if (dump.wait || (isLastBar && planAlign && ctx.planTouch)) return 'wait';
    if (isLastBar && (analyzeAlign || ctx.beam === 'SHORT') && lowVol) return 'wait';
    return 'none';
  }

  /** ── LONG 타점 ── */
  const structOk = rejectLong || bodyUp;
  const volGate = !lowVol && (volOk || ctx.beam === 'LONG' || m?.buyDominant === true);
  const confirmCore =
    structOk &&
    volGate &&
    (dump.confirm ||
      (planLive && ctx.planEnter && ctx.planEntryAllowed) ||
      (practiceLive && ctx.practiceEntryAllowed && ctx.practiceEnter));
  if (confirmCore) return 'long_confirmed';

  const touchCore =
    structOk &&
    (dump.touch ||
      (planLive && ctx.planTouch) ||
      (practiceLive && ctx.practiceTouch) ||
      (isLastBar && analyzeAlign && rejectLong));
  if (touchCore) return lowVol ? 'wait' : 'long_watch';

  if (dump.wait || (isLastBar && planAlign && ctx.planTouch)) return 'wait';
  if (isLastBar && (analyzeAlign || ctx.beam === 'LONG') && lowVol) return 'wait';
  if (isLastBar && volStrong && m?.buyDominant && rejectLong) return 'long_watch';
  return 'none';
}

function mergeTone(a: AiCandleBorderTone, b: AiCandleBorderTone): AiCandleBorderTone {
  const rank: Record<AiCandleBorderTone, number> = {
    none: 0,
    wait: 1,
    long_watch: 2,
    short_watch: 2,
    long_confirmed: 4,
    short_confirmed: 4,
  };
  return rank[b] > rank[a] ? b : a;
}

/**
 * 봉별 AI 테두리 tone — **E·존 터치 봉만**.
 */
export function buildAiCandleToneByTime(input: AiCandleBorderInputs): Map<number, AiCandleBorderTone> {
  const tf = normalizeChartTimeframe(input.timeframe ?? '15m');
  const rows = sanitizeChartCandlesForSeries(input.candles, tf);
  const n = rows.length;
  const out = new Map<number, AiCandleBorderTone>();
  if (n < 4) return out;

  const ratio = input.entryApproachRatio ?? 0.0045;
  const dumpZones = input.dumpZones ?? null;
  const anchors =
    input.entryAnchors ??
    buildAiCandleEntryAnchors({
      plan: input.activeTradePlan ?? null,
      practiceAi: input.practiceAi ?? null,
      dumpZones,
    });

  if (!anchors.length) return out;

  const metrics = buildVolumeTfMetricsSeries({
    candles: rows,
    spotPx: input.spotPx,
    rvolPeriod: 20,
    whaleBeamIntel: input.whaleBeamIntel ?? null,
  });
  const byTime = new Map(metrics.map((m) => [m.time, m]));

  const planSt = String(input.planStatus || '').toUpperCase();
  const pa = input.practiceAi;
  const ctx: EntryCtx = {
    analyze: normalizeDir(input.analyzeVerdict),
    planDir: input.planDirection ?? null,
    planSt,
    planEnter: planSt === 'ENTER' || planSt === 'ACTIVE' || planSt === 'CONFIRMED',
    planTouch: planSt === 'TOUCH' || planSt === 'ENTER',
    planEntryAllowed: input.planEntryAllowed === true,
    practiceEnter: pa?.state === 'CONFIRMED_LONG' || pa?.state === 'CONFIRMED_SHORT',
    practiceTouch: Boolean(pa?.state?.includes('WATCH')),
    practiceEntryAllowed: pa?.entryAllowed === true,
    beam:
      input.whaleBeamIntel?.live?.beamKo === '롱빔'
        ? 'LONG'
        : input.whaleBeamIntel?.live?.beamKo === '숏빔'
          ? 'SHORT'
          : null,
  };

  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    const t = Number(row.time);
    if (!(t > 0)) continue;
    const atr = approxAtr(rows, i);
    const m = byTime.get(t);
    const isLast = i === n - 1;
    let tone: AiCandleBorderTone = 'none';

    for (const anchor of anchors) {
      const eb = entryBand(anchor.entry, atr, ratio);
      const zoneLo = Math.min(Number(anchor.bot ?? anchor.entry), Number(anchor.top ?? anchor.entry));
      const zoneHi = Math.max(Number(anchor.bot ?? anchor.entry), Number(anchor.top ?? anchor.entry));
      const lo = Math.min(eb.lo, zoneLo);
      const hi = Math.max(eb.hi, zoneHi);
      if (!barTouchesBand(row, lo, hi)) continue;

      const tOne = toneAtEntryBar(row, anchor, m, dumpZones, ctx, isLast);
      tone = mergeTone(tone, tOne);
    }

    if (tone !== 'none') out.set(t, tone);
  }

  return out;
}

export function toneToJournalDirection(tone: AiCandleBorderTone): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (tone === 'long_confirmed' || tone === 'long_watch') return 'LONG';
  if (tone === 'short_confirmed' || tone === 'short_watch') return 'SHORT';
  return 'NEUTRAL';
}

export function toneKoShort(tone: AiCandleBorderTone): string {
  const map: Record<AiCandleBorderTone, string> = {
    long_confirmed: '롱확정',
    short_confirmed: '숏확정',
    long_watch: '롱터치',
    short_watch: '숏터치',
    wait: '횡보·대기',
    none: '무색',
  };
  return map[tone];
}

/**
 * 봉별 AI 테두리 — **E·존 터치 봉만** 색칠.
 */
export function buildAiCandleBorderByTime(input: AiCandleBorderInputs): Map<number, string> {
  const out = new Map<number, string>();
  for (const [t, tone] of buildAiCandleToneByTime(input)) {
    const hex = aiCandleBorderHex(tone);
    if (hex) out.set(t, hex);
  }
  return out;
}

export function applyAiCandleBorders<T extends { time: unknown; borderColor?: string; wickColor?: string }>(
  data: T[],
  borderByTime: Map<number, string>
): T[] {
  return applyVolumeVerdictCandleBorders(data, borderByTime);
}

export function aiCandleBorderLegendKo(): Array<{ tone: AiCandleBorderTone; hex: string | null; labelKo: string }> {
  return [
    { tone: 'long_confirmed', hex: BORDER.long_confirmed, labelKo: '롱·E확정(진한초록)' },
    { tone: 'short_confirmed', hex: BORDER.short_confirmed, labelKo: '숏·E확정(진한빨강)' },
    { tone: 'long_watch', hex: BORDER.long_watch, labelKo: '롱·E터치(연한초록)' },
    { tone: 'short_watch', hex: BORDER.short_watch, labelKo: '숏·E터치(연한빨강)' },
    { tone: 'wait', hex: BORDER.wait, labelKo: 'E근처·대기(노랑·진입금지)' },
    { tone: 'none', hex: null, labelKo: '무색(타점 밖)' },
  ];
}

export function aiCandleBorderScoreClamp(n: number): number {
  return clamp(n, -20, 20);
}
