/**
 * 통합·분석 — 핵심 지지·저항 구간 (차트 전용, 선명 표시).
 * 하락 시 하방 지지 · 상승 시 상방 저항을 가격 기준으로 방향 분리.
 * key + critical 합류, 지지 최대 3 · 저항 최대 3. 승률·수익 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
  mergedWorkCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import { isMergedDeskSharedFeatureTf } from '@/lib/mergedDeskSharedTfFeatures';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

export type MergedDeskCoreSrSide = 'SUPPORT' | 'RESIST';

export type MergedDeskCoreSrZone = {
  id: string;
  side: MergedDeskCoreSrSide;
  rank: number;
  top: number;
  bot: number;
  mid: number;
  score: number;
  labelKo: string;
  reasonKo: string;
  sources: string[];
  nearPrice: boolean;
  /** 형성봉 */
  time1?: number;
};

export type MergedDeskCoreSrPack = {
  supports: MergedDeskCoreSrZone[];
  resists: MergedDeskCoreSrZone[];
  all: MergedDeskCoreSrZone[];
  overlays: OverlayItem[];
  summaryKo: string;
};

const MAX_EACH = 3;

function fmt(p: number): string {
  if (!(p > 0)) return '—';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function atr(candles: Candle[], end: number, period = 14): number {
  if (end < 1) return Math.abs(candles[end]?.close ?? 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - period + 1);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]?.close ?? 1) * 0.01;
}

type Cand = {
  side: MergedDeskCoreSrSide;
  top: number;
  bot: number;
  mid: number;
  score: number;
  reasonKo: string;
  sources: string[];
  time1?: number;
};

function emptyPack(): MergedDeskCoreSrPack {
  return {
    supports: [],
    resists: [],
    all: [],
    overlays: [],
    summaryKo: '핵심 지지·저항 — 대기',
  };
}

/**
 * 핵심 지지(아래)·저항(위) — HotZone 진입과 별도로 항상 보이도록 작도.
 */
export function buildMergedDeskCoreSrPack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  currentPrice?: number | null;
}): MergedDeskCoreSrPack {
  if (!isMergedDeskSharedFeatureTf(params.timeframe)) return emptyPack();

  const tf = normalizeChartTimeframe(params.timeframe);
  const candles = mergedWorkCandles(params.candles, tf);
  if (candles.length < 16) return emptyPack();

  const last = candles[candles.length - 1]!;
  const price =
    params.currentPrice && params.currentPrice > 0 ? params.currentPrice : last.close;
  const atrVal = atr(candles, candles.length - 1);
  const maxH = Math.max(atrVal * 1.15, price * 0.01);
  const gap = Math.max(atrVal * 0.55, price * 0.004);

  const raw: Cand[] = [];

  for (const z of params.keyZones ?? []) {
    const isSup = z.kind === 'demand';
    let top = z.top;
    let bot = z.bot;
    if (!(top > bot)) continue;
    if (top - bot > maxH) {
      const mid = (top + bot) / 2;
      top = mid + maxH / 2;
      bot = mid - maxH / 2;
    }
    const mid = (top + bot) / 2;
    // 하방 지지(아래)·상방 저항(위) 가점, 역방향은 강한 감점 — 캔들 근처만 선호하지 않음
    const distPct = (Math.abs(mid - price) / Math.max(price, 1e-9)) * 100;
    let score = 55 + Math.min(30, z.score * 4) + Math.min(10, z.bouncePct);
    if (isSup && mid > price * 1.004) score -= 22;
    else if (isSup && mid < price) score += Math.min(14, 4 + distPct * 0.35);
    if (!isSup && mid < price * 0.996) score -= 22;
    else if (!isSup && mid > price) score += Math.min(14, 4 + distPct * 0.35);
    if (Math.abs(mid - price) / price < 0.012) score += 4;
    raw.push({
      side: isSup ? 'SUPPORT' : 'RESIST',
      top,
      bot,
      mid,
      score,
      reasonKo: z.labelKo || (isSup ? '하방핵심지지' : '상방핵심저항'),
      sources: ['핵심존', z.pattern],
      time1: Number(z.time1) || undefined,
    });
  }

  for (const z of params.criticalZones ?? []) {
    const isSup = z.scenario === 'if_decline' || z.kind === 'demand';
    let top = z.top;
    let bot = z.bot;
    if (!(top > bot)) {
      const half = Math.max(atrVal * 0.35, Math.abs(z.price) * 0.003);
      top = z.price + half;
      bot = z.price - half;
    }
    if (top - bot > maxH) {
      const mid = (top + bot) / 2;
      top = mid + maxH / 2;
      bot = mid - maxH / 2;
    }
    const mid = (top + bot) / 2;
    const distPct = (Math.abs(mid - price) / Math.max(price, 1e-9)) * 100;
    let score =
      62 +
      (z.tier === 'S' ? 18 : z.tier === 'A' ? 12 : 6) +
      Math.min(12, z.confluenceCount * 3) +
      Math.min(10, z.score * 0.12);
    if (z.isPrimary) score += 8;
    if (z.htfLabel) score += 6;
    if (isSup && mid > price * 1.006) score -= 20;
    else if (isSup && mid < price) score += Math.min(16, 6 + distPct * 0.4);
    if (!isSup && mid < price * 0.994) score -= 20;
    else if (!isSup && mid > price) score += Math.min(16, 6 + distPct * 0.4);
    raw.push({
      side: isSup ? 'SUPPORT' : 'RESIST',
      top,
      bot,
      mid,
      score,
      reasonKo: z.headlineKo || z.labelKo || (isSup ? '하락핵심지지' : '상승핵심저항'),
      sources: ['임계합류', ...(z.sources?.slice(0, 2) ?? [])],
      time1: Number(z.time1) || undefined,
    });
  }

  // 가격 기준 스윙 저/고 보강 (존이 비었을 때) — 가시 구간 확대
  if (raw.filter((r) => r.side === 'SUPPORT').length === 0 || raw.filter((r) => r.side === 'RESIST').length === 0) {
    const start = Math.max(2, candles.length - 160);
    let minI = start;
    let maxI = start;
    let minL = Infinity;
    let maxHbar = -Infinity;
    for (let i = start; i < candles.length - 1; i++) {
      if (candles[i]!.low < minL) {
        minL = candles[i]!.low;
        minI = i;
      }
      if (candles[i]!.high > maxHbar) {
        maxHbar = candles[i]!.high;
        maxI = i;
      }
    }
    const half = atrVal * 0.4;
    if (raw.filter((r) => r.side === 'SUPPORT').length === 0 && Number.isFinite(minL) && minL < price) {
      raw.push({
        side: 'SUPPORT',
        top: minL + half,
        bot: minL - half * 0.6,
        mid: minL,
        score: 58,
        reasonKo: '스윙저점',
        sources: ['스윙'],
        time1: Number(candles[minI]!.time),
      });
    }
    if (raw.filter((r) => r.side === 'RESIST').length === 0 && Number.isFinite(maxHbar) && maxHbar > price) {
      raw.push({
        side: 'RESIST',
        top: maxHbar + half * 0.6,
        bot: maxHbar - half,
        mid: maxHbar,
        score: 58,
        reasonKo: '스윙고점',
        sources: ['스윙'],
        time1: Number(candles[maxI]!.time),
      });
    }
  }

  const pickSide = (side: MergedDeskCoreSrSide): MergedDeskCoreSrZone[] => {
    const directed = raw.filter((r) => {
      if (r.side !== side) return false;
      // 지지 = 현재가 아래, 저항 = 현재가 위 (역방향은 최후 후보)
      if (side === 'SUPPORT') return r.mid <= price * 1.003;
      return r.mid >= price * 0.997;
    });
    const fallback = raw.filter((r) => r.side === side);
    const list = (directed.length ? directed : fallback).sort(
      (a, b) => b.score - a.score || Math.abs(a.mid - price) - Math.abs(b.mid - price)
    );
    const out: MergedDeskCoreSrZone[] = [];
    for (const r of list) {
      if (out.some((p) => Math.abs(p.mid - r.mid) < gap)) continue;
      const rank = out.length + 1;
      const nearPrice = Math.abs(r.mid - price) / price < 0.015;
      const sideKo = side === 'SUPPORT' ? '하방지지' : '상방저항';
      out.push({
        id: `merged-desk-core-sr-${side === 'SUPPORT' ? 'sup' : 'res'}-${rank}-${Math.round(r.mid * 100)}`,
        side,
        rank,
        top: r.top,
        bot: r.bot,
        mid: r.mid,
        score: clamp(Math.round(r.score), 0, 99),
        labelKo: `${sideKo}${rank} ${fmt(r.mid)}`,
        reasonKo: r.reasonKo,
        sources: r.sources,
        nearPrice,
        time1: r.time1,
      });
      if (out.length >= MAX_EACH) break;
    }
    return out;
  };

  const supports = pickSide('SUPPORT');
  const resists = pickSide('RESIST');
  const all = [...supports, ...resists];

  const overlays: OverlayItem[] = [];

  for (const z of all) {
    const isSup = z.side === 'SUPPORT';
    const formT = findMergedDeskZoneFormationBarTime(candles, z.top, z.bot, z.time1 ?? null);
    const zoneTimes = mergedDeskAnalyzedZoneSpanTimes(candles, {
      id: z.id,
      time1: formT,
      price1: z.top,
      price2: z.bot,
    });
    if (!zoneTimes) continue;
    overlays.push({
      id: z.id,
      kind: isSup ? 'demandZone' : 'supplyZone',
      label: z.nearPrice ? `★${z.labelKo}` : z.labelKo,
      labelTooltip: `${z.reasonKo} · ${fmt(z.bot)}~${fmt(z.top)} · ${z.sources.join('+')} (조건부 참고)`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: zoneTimes.t1 as UTCTimestamp,
      time2: zoneTimes.t2 as UTCTimestamp,
      price1: z.top,
      price2: z.bot,
      confidence: z.score,
      color: isSup ? 'rgba(56,189,248,0.34)' : 'rgba(251,146,60,0.32)',
      category: 'zones',
      zonePulse: z.nearPrice || z.rank === 1,
      zoneFillPreserve: true,
      lineLabelColor: isSup ? '#7dd3fc' : '#fdba74',
      labelBackgroundColor: isSup ? 'rgba(8,47,73,0.96)' : 'rgba(124,45,18,0.96)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: [
        'merged-desk-core-sr',
        isSup ? 'merged-desk-core-sr--support' : 'merged-desk-core-sr--resist',
        z.rank === 1 ? 'merged-desk-core-sr--primary' : '',
        z.nearPrice ? 'merged-desk-core-sr--near' : '',
      ]
        .filter(Boolean)
        .join(' '),
    });

    // 1순위 지지/저항 가격선 — 라벨은 zone 캡션만 (HTML 알약 중복 금지)
    if (z.rank === 1) {
      overlays.push({
        id: `${z.id}-line`,
        kind: 'keyLevel',
        label: '',
        labelTooltip: isSup ? '지지' : '저항',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: zoneTimes.t1 as UTCTimestamp,
        time2: zoneTimes.t2 as UTCTimestamp,
        price1: z.mid,
        price2: z.mid,
        confidence: z.score,
        color: isSup ? 'rgba(56,189,248,0.95)' : 'rgba(251,146,60,0.95)',
        category: 'structure',
        lineLabelColor: isSup ? '#7dd3fc' : '#fdba74',
        labelBackgroundColor: 'rgba(8,12,28,0.92)',
        labelTextColor: '#f8fafc',
        overlayZoneExtraClass: 'merged-desk-core-sr-line',
      });
    }
  }

  const whereSup =
    supports.length === 0
      ? '하방 핵심지지 없음'
      : supports.map((z) => `${z.labelKo}(${z.reasonKo})`).join(' · ');
  const whereRes =
    resists.length === 0
      ? '상방 핵심저항 없음'
      : resists.map((z) => `${z.labelKo}(${z.reasonKo})`).join(' · ');

  return {
    supports,
    resists,
    all,
    overlays,
    summaryKo: `하방 핵심지지: ${whereSup} | 상방 핵심저항: ${whereRes}`,
  };
}

/** 1순위 지지·저항 전폭 가격선 (지표형) */
export function buildMergedDeskCoreSrAxisLines(pack: MergedDeskCoreSrPack): AtlasPulsePriceLine[] {
  const out: AtlasPulsePriceLine[] = [];
  for (const z of pack.all) {
    if (z.rank !== 1) continue;
    const isSup = z.side === 'SUPPORT';
    out.push({
      price: z.mid,
      color: isSup ? '#38BDF8' : '#FB923C',
      title: isSup ? `하방지지 ${fmt(z.mid)}` : `상방저항 ${fmt(z.mid)}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
    out.push({
      price: z.top,
      color: isSup ? 'rgba(56,189,248,0.45)' : 'rgba(251,146,60,0.45)',
      title: isSup ? '지지상' : '저항상',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    out.push({
      price: z.bot,
      color: isSup ? 'rgba(56,189,248,0.45)' : 'rgba(251,146,60,0.45)',
      title: isSup ? '지지하' : '저항하',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  return out;
}

export function summarizeMergedDeskCoreSrKo(pack: MergedDeskCoreSrPack): string {
  return pack.summaryKo;
}
