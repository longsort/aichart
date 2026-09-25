/**
 * 통합·분석 — 고확률 롱/숏 진입 zone (신호 등급·합류 점수).
 * 라벨은 「롱자리/숏자리 + 등급」 — 승률·수익 보장 아님. 종가 이탈 시 무효.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  detectMergedAnalysisKeyZones,
  type MergedKeyZone,
} from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { SwingRetracePack } from '@/lib/mergedDeskSwingRetrace';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import {
  findMergedDeskZoneFormationBarTime,
  mergedWorkCandles,
  snapMergedOverlayTimeToCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import { isMergedDeskSharedFeatureTf } from '@/lib/mergedDeskSharedTfFeatures';

export type HqEntrySide = 'LONG' | 'SHORT';
export type HqEntryGrade = 'A' | 'B';

export type HqEntryZone = {
  id: string;
  side: HqEntrySide;
  grade: HqEntryGrade;
  /** 신호 합류 점수 0–100 (승률 아님) */
  score: number;
  top: number;
  bot: number;
  mid: number;
  time1: number;
  time2: number;
  labelKo: string;
  reasonKo: string;
  invalidationKo: string;
  sources: string[];
  /** 현재가 기준 상태 */
  status: 'above' | 'inside' | 'below' | 'broken';
  touchedNow: boolean;
};

export type HqEntryZonesPack = {
  longZones: HqEntryZone[];
  shortZones: HqEntryZone[];
  all: HqEntryZone[];
  overlays: OverlayItem[];
  summaryKo: string;
  whereLongKo: string;
  whereShortKo: string;
};

function atr(candles: Candle[], end: number, period = 14): number {
  const start = Math.max(1, end - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]?.close ?? 1) * 0.01;
}

function fmt(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function gradeOf(score: number): HqEntryGrade | null {
  if (score >= 78) return 'A';
  if (score >= 64) return 'B';
  return null;
}

function zoneStatus(
  side: HqEntrySide,
  top: number,
  bot: number,
  close: number,
  high: number,
  low: number
): { status: HqEntryZone['status']; touchedNow: boolean; broken: boolean } {
  const inside = high >= bot && low <= top;
  if (side === 'LONG') {
    if (close < bot) return { status: 'broken', touchedNow: false, broken: true };
    if (inside) return { status: 'inside', touchedNow: true, broken: false };
    if (close > top) return { status: 'above', touchedNow: false, broken: false };
    return { status: 'below', touchedNow: false, broken: false };
  }
  if (close > top) return { status: 'broken', touchedNow: false, broken: true };
  if (inside) return { status: 'inside', touchedNow: true, broken: false };
  if (close < bot) return { status: 'below', touchedNow: false, broken: false };
  return { status: 'above', touchedNow: false, broken: false };
}

type RawCand = {
  side: HqEntrySide;
  top: number;
  bot: number;
  time1: number;
  scoreBase: number;
  sources: string[];
  reasonBits: string[];
};

function mergeOverlap(cands: RawCand[], atrVal: number): RawCand[] {
  const sorted = [...cands].sort((a, b) => b.scoreBase - a.scoreBase);
  const out: RawCand[] = [];
  for (const c of sorted) {
    const mid = (c.top + c.bot) / 2;
    const hit = out.find((o) => {
      if (o.side !== c.side) return false;
      const om = (o.top + o.bot) / 2;
      return Math.abs(om - mid) < atrVal * 0.85;
    });
    if (hit) {
      hit.top = Math.max(hit.top, c.top);
      hit.bot = Math.min(hit.bot, c.bot);
      hit.scoreBase = Math.max(hit.scoreBase, c.scoreBase) + 4;
      hit.sources = [...new Set([...hit.sources, ...c.sources])];
      hit.reasonBits = [...new Set([...hit.reasonBits, ...c.reasonBits])];
      hit.time1 = Math.min(hit.time1, c.time1);
      continue;
    }
    out.push({ ...c, sources: [...c.sources], reasonBits: [...c.reasonBits] });
  }
  return out;
}

/**
 * 고확률 롱/숏 진입 zone 팩.
 * - demand + 되돌림 Fib 합류 → 롱자리
 * - supply + 되돌림 Fib 합류 → 숏자리
 * - 마스터 선물 동일 방향이면 가점
 * - 종가 이탈 존은 제외
 */
export function buildMergedDeskHqEntryZonesPack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  swingRetrace?: SwingRetracePack | null;
  masterFutures?: MasterFuturesDecision | null;
  currentPrice?: number | null;
}): HqEntryZonesPack {
  const empty: HqEntryZonesPack = {
    longZones: [],
    shortZones: [],
    all: [],
    overlays: [],
    summaryKo: '롱/숏 자리 — 봉 수 부족',
    whereLongKo: '롱자리 없음 (관망)',
    whereShortKo: '숏자리 없음 (관망)',
  };
  if (!isMergedDeskSharedFeatureTf(params.timeframe)) return empty;
  const tf = normalizeChartTimeframe(params.timeframe);
  const candles = mergedWorkCandles(params.candles, tf);
  if (candles.length < 24) return empty;

  const last = candles[candles.length - 1]!;
  const price = params.currentPrice && params.currentPrice > 0 ? params.currentPrice : last.close;
  const atrVal = atr(candles, candles.length - 1);
  const keyZones = params.keyZones?.length
    ? params.keyZones
    : detectMergedAnalysisKeyZones(candles, tf);
  const critical = params.criticalZones ?? [];
  const retrace = params.swingRetrace ?? null;
  const master = params.masterFutures ?? null;

  const raw: RawCand[] = [];

  for (const z of keyZones) {
    const span = Math.max(z.top - z.bot, atrVal * 0.25);
    if (span > atrVal * 4.5) continue;
    if (z.kind === 'demand') {
      if (z.top > price * 1.012) continue;
      const mid = (z.top + z.bot) / 2;
      const distPct = Math.abs(price - mid) / price;
      let score = 48 + Math.min(22, z.score * 3.5) + Math.min(12, z.bouncePct);
      if (distPct < 0.012) score += 8;
      else if (distPct < 0.028) score += 4;
      raw.push({
        side: 'LONG',
        top: z.top,
        bot: z.bot,
        time1: z.time1,
        scoreBase: score,
        sources: ['지지반등'],
        reasonBits: [`${z.labelKo}`],
      });
    } else {
      if (z.bot < price * 0.988) continue;
      const mid = (z.top + z.bot) / 2;
      const distPct = Math.abs(price - mid) / price;
      let score = 48 + Math.min(22, z.score * 3.5) + Math.min(12, z.bouncePct);
      if (distPct < 0.012) score += 8;
      else if (distPct < 0.028) score += 4;
      raw.push({
        side: 'SHORT',
        top: z.top,
        bot: z.bot,
        time1: z.time1,
        scoreBase: score,
        sources: ['저항거부'],
        reasonBits: [`${z.labelKo}`],
      });
    }
  }

  for (const z of critical) {
    if (z.tier !== 'S' && z.tier !== 'A') continue;
    const span = Math.max(z.top - z.bot, atrVal * 0.2);
    if (span > atrVal * 5) continue;
    if (z.kind === 'demand' && z.scenario === 'if_decline') {
      if (z.top > price * 1.02) continue;
      raw.push({
        side: 'LONG',
        top: z.top,
        bot: z.bot,
        time1: z.time1,
        scoreBase: 58 + (z.tier === 'S' ? 16 : 10) + Math.min(10, z.confluenceCount * 2),
        sources: ['핵심합류'],
        reasonBits: [z.headlineKo || z.labelKo],
      });
    }
    if (z.kind === 'supply' && z.scenario === 'if_rally') {
      if (z.bot < price * 0.98) continue;
      raw.push({
        side: 'SHORT',
        top: z.top,
        bot: z.bot,
        time1: z.time1,
        scoreBase: 58 + (z.tier === 'S' ? 16 : 10) + Math.min(10, z.confluenceCount * 2),
        sources: ['핵심합류'],
        reasonBits: [z.headlineKo || z.labelKo],
      });
    }
  }

  const active = retrace?.active;
  if (active) {
    for (const lv of active.levels) {
      if (lv.ratio < 0.35 || lv.ratio > 0.65) continue;
      const half = atrVal * 0.35;
      if (active.side === 'decline_bounce') {
        raw.push({
          side: 'LONG',
          top: lv.price + half,
          bot: lv.price - half * 0.6,
          time1: active.impulseToTime,
          scoreBase: 62 + (lv.ratio === 0.5 ? 8 : 4) + (lv.hit ? 6 : 0),
          sources: ['되돌림'],
          reasonBits: [`하락→반등 ${lv.label}`],
        });
      } else {
        raw.push({
          side: 'SHORT',
          top: lv.price + half * 0.6,
          bot: lv.price - half,
          time1: active.impulseToTime,
          scoreBase: 62 + (lv.ratio === 0.5 ? 8 : 4) + (lv.hit ? 6 : 0),
          sources: ['되돌림'],
          reasonBits: [`상승→되돌림 ${lv.label}`],
        });
      }
    }
  }

  if (master && master.entryAllowed && (master.side === 'LONG' || master.side === 'SHORT')) {
    const e = master.entryPrice;
    const sl = master.stopPrice;
    if (e > 0 && sl > 0) {
      const half = Math.max(Math.abs(e - sl) * 0.35, atrVal * 0.3);
      const boost = master.grade === 'A' ? 14 : master.grade === 'B' ? 8 : 0;
      const top = master.side === 'LONG' ? e + half * 0.4 : Math.max(e, sl) - Math.abs(e - sl) * 0.15;
      const bot =
        master.side === 'LONG'
          ? Math.min(e, sl) + Math.abs(e - sl) * 0.15
          : e - half * 0.4;
      const formT = findMergedDeskZoneFormationBarTime(candles, top, bot, null);
      if (master.side === 'LONG') {
        raw.push({
          side: 'LONG',
          top,
          bot,
          time1: formT,
          scoreBase: 55 + boost + Math.min(12, master.strength / 8),
          sources: ['마스터'],
          reasonBits: [`마스터 ${master.grade} E ${fmt(e)}`],
        });
      } else {
        raw.push({
          side: 'SHORT',
          top,
          bot,
          time1: formT,
          scoreBase: 55 + boost + Math.min(12, master.strength / 8),
          sources: ['마스터'],
          reasonBits: [`마스터 ${master.grade} E ${fmt(e)}`],
        });
      }
    }
  }

  const merged = mergeOverlap(raw, atrVal);
  const tEnd = Number(snapMergedOverlayTimeToCandles(Number(last.time), candles));

  const zones: HqEntryZone[] = [];
  for (const c of merged) {
    let score = c.scoreBase;
    if (master?.side === c.side && master.entryAllowed) {
      score += master.grade === 'A' ? 10 : master.grade === 'B' ? 6 : 2;
    } else if (master && master.side !== 'WAIT' && master.side !== c.side) {
      score -= 8;
    }
    if (c.sources.includes('되돌림') && c.sources.includes('지지반등')) score += 8;
    if (c.sources.includes('되돌림') && c.sources.includes('저항거부')) score += 8;
    if (c.sources.includes('핵심합류')) score += 4;
    score = clamp(Math.round(score), 0, 99);

    const grade = gradeOf(score);
    if (!grade) continue;

    const top = Math.max(c.top, c.bot);
    const bot = Math.min(c.top, c.bot);
    if (!(top > bot) || (top - bot) / price > 0.045) continue;

    const st = zoneStatus(c.side, top, bot, last.close, last.high, last.low);
    if (st.broken) continue;

    const mid = (top + bot) / 2;
    const labelKo = c.side === 'LONG' ? `$$$$롱` : `$$$$숏`;
    const reasonKo =
      [`합류${grade}`, ...c.reasonBits.slice(0, 3)].join(' · ') || c.sources.join('+');
    const invalidationKo =
      c.side === 'LONG'
        ? `종가 ${fmt(bot)} 이탈 시 $$$$롱 무효`
        : `종가 ${fmt(top)} 돌파 시 $$$$숏 무효`;

    zones.push({
      id: `merged-desk-hq-${c.side.toLowerCase()}-${Math.round(mid * 100)}-${grade}`,
      side: c.side,
      grade,
      score,
      top,
      bot,
      mid,
      time1: Number(snapMergedOverlayTimeToCandles(c.time1, candles)),
      time2: tEnd,
      labelKo,
      reasonKo,
      invalidationKo,
      sources: c.sources,
      status: st.status,
      touchedNow: st.touchedNow,
    });
  }

  zones.sort((a, b) => b.score - a.score || a.grade.localeCompare(b.grade));
  const longZones = zones.filter((z) => z.side === 'LONG').slice(0, 2);
  const shortZones = zones.filter((z) => z.side === 'SHORT').slice(0, 2);
  const all = [...longZones, ...shortZones].sort((a, b) => b.score - a.score);

  const overlays: OverlayItem[] = all.map((z) => {
    const isLong = z.side === 'LONG';
    return {
      id: z.id,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: z.labelKo,
      labelTooltip: `${z.reasonKo} · ${z.invalidationKo} · 합류:${z.sources.join('+')} (승률 아님)`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: z.time1 as UTCTimestamp,
      time2: z.time2 as UTCTimestamp,
      price1: z.top,
      price2: z.bot,
      confidence: z.score,
      color: isLong ? 'rgba(34,197,94,0.32)' : 'rgba(239,68,68,0.3)',
      category: 'scenario',
      zonePulse: z.grade === 'A' || z.touchedNow,
      zoneFillPreserve: true,
      lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
      labelBackgroundColor: isLong ? 'rgba(6,78,59,0.95)' : 'rgba(127,29,29,0.94)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: [
        'merged-hq-entry-zone',
        'merged-desk-hotzone-entry',
        isLong ? 'merged-hq-long overlay-zone--hotzone-signal--long' : 'merged-hq-short overlay-zone--hotzone-signal--short',
        `merged-hq-grade-${z.grade}`,
        z.touchedNow ? 'merged-hq-touch merged-desk-hotzone-entry--touch' : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  });

  const whereLongKo =
    longZones.length === 0
      ? '롱진입 없음 — 지지·되돌림 합류 대기 (관망)'
      : longZones
          .map(
            (z) =>
              `${z.grade} ${fmt(z.bot)}~${fmt(z.top)}${z.status === 'inside' ? ' ←터치중' : ''} (${z.reasonKo})`
          )
          .join(' · ');

  const whereShortKo =
    shortZones.length === 0
      ? '숏진입 없음 — 저항·되돌림 합류 대기 (관망)'
      : shortZones
          .map(
            (z) =>
              `${z.grade} ${fmt(z.bot)}~${fmt(z.top)}${z.status === 'inside' ? ' ←터치중' : ''} (${z.reasonKo})`
          )
          .join(' · ');

  const best = all[0];
  const summaryKo = best
    ? `진입존 ${all.length} · 우선 ${best.labelKo} @ ${fmt(best.mid)} · ${best.reasonKo}`
    : '고확률 롱/숏 진입 미형성 — 관망';

  return {
    longZones,
    shortZones,
    all,
    overlays,
    summaryKo,
    whereLongKo,
    whereShortKo,
  };
}

export function summarizeHqEntryZonesKo(pack: HqEntryZonesPack): string {
  return `롱: ${pack.whereLongKo} | 숏: ${pack.whereShortKo}`;
}

/** 직전 봉은 미터치 → 현재 봉 터치 전이 (서버 텔레용) */
export function detectHqZoneTouchTransitions(
  pack: HqEntryZonesPack,
  candles: Candle[]
): HqEntryZone[] {
  if (candles.length < 2 || !pack.all.length) return [];
  const cur = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const out: HqEntryZone[] = [];
  for (const z of pack.all) {
    const curTouch = cur.high >= z.bot && cur.low <= z.top;
    const prevTouch = prev.high >= z.bot && prev.low <= z.top;
    if (!curTouch || prevTouch) continue;
    if (z.side === 'LONG' && cur.close < z.bot) continue;
    if (z.side === 'SHORT' && cur.close > z.top) continue;
    out.push({ ...z, status: 'inside', touchedNow: true });
  }
  return out;
}
