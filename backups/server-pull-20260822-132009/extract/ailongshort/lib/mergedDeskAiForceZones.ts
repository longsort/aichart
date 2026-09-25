/**
 * 통합·분석 — 캔들·거래량으로 세력/고래 **방어·매수·매도 ZONE** 자동 감지.
 * 출력은 기존 HotZone과 동일 OverlayItem(demandZone/supplyZone) — 카드/HUD 없음.
 * 고정 승률·확정 수익 문구 금지.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
  mergedWorkCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import { mergedDeskAutoZoneDetectCandles } from '@/lib/mergedDesk4hReference';

export type AiForceZoneKind = 'defense' | 'buy' | 'sell';

export type AiForceZone = {
  id: string;
  kind: AiForceZoneKind;
  side: 'LONG' | 'SHORT';
  top: number;
  bot: number;
  mid: number;
  score: number;
  strength: number;
  labelKo: string;
  reasonKo: string;
  time1: number;
  barIndex: number;
};

export type AiForceZonesPack = {
  zones: AiForceZone[];
  overlays: OverlayItem[];
  summaryKo: string;
};

function atr(candles: Candle[], end: number, period = 14): number {
  if (end < 1) return Math.abs(candles[end]?.close ?? 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - period + 1);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n += 1;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]!.close) * 0.01;
}

function smaVol(candles: Candle[], i: number, period: number): number {
  let s = 0;
  let n = 0;
  for (let k = Math.max(0, i - period + 1); k <= i; k++) {
    s += Math.max(0, Number(candles[k]?.volume) || 0);
    n += 1;
  }
  return n > 0 ? s / n : 0;
}

function fmt(p: number): string {
  if (!(p > 0)) return '—';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function zoneFill(side: 'LONG' | 'SHORT', kind: AiForceZoneKind, strength: number): string {
  const a = Math.max(0.16, Math.min(0.36, 0.14 + strength * 0.22));
  if (kind === 'defense') {
    return side === 'LONG' ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`;
  }
  if (kind === 'buy') return `rgba(16,185,129,${a})`;
  return `rgba(248,113,113,${a})`;
}

function labelFor(kind: AiForceZoneKind, side: 'LONG' | 'SHORT'): string {
  if (kind === 'buy') return '세력매수ZONE';
  if (kind === 'sell') return '세력매도ZONE';
  return side === 'LONG' ? '세력방어ZONE·롱' : '세력방어ZONE·숏';
}

/**
 * 최근 캔들 윈도에서 거래량 충격 + 윅/몸통으로
 * - 세력매수ZONE: 저가 근처 매집·롱 방어(아랫심지 + 고거래량)
 * - 세력매도ZONE: 고가 근처 분산·숏 방어(윗심지 + 고거래량)
 * - 세력방어ZONE: 흡수(고거래·작은 몸통) 후 방향 유지
 */
export function detectMergedDeskAiForceZones(
  candlesIn: Candle[],
  timeframe: string
): AiForceZonesPack {
  const work = mergedWorkCandles(candlesIn, timeframe);
  const candles = mergedDeskAutoZoneDetectCandles(work, timeframe);
  if (candles.length < 24) {
    return { zones: [], overlays: [], summaryKo: '세력 ZONE 감지용 봉 부족' };
  }

  const n = candles.length;
  const last = n - 1;
  const atrVal = Math.max(atr(candles, last, 14), Math.abs(candles[last]!.close) * 0.0008);
  const lookback = Math.min(n - 2, Math.max(48, Math.floor(n * 0.7)));
  const start = Math.max(8, n - lookback);
  const raw: AiForceZone[] = [];

  for (let i = start; i < n - 1; i++) {
    const c = candles[i]!;
    const vol = Math.max(0, Number(c.volume) || 0);
    const vSma = smaVol(candles, i, 20);
    if (vSma <= 0 || vol < vSma * 1.15) continue;

    const range = Math.max(c.high - c.low, atrVal * 0.05);
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const rvol = vol / vSma;
    const bodyRatio = body / range;
    const t = Number(c.time);
    if (!Number.isFinite(t)) continue;

    const half = Math.max(atrVal * 0.32, range * 0.4);
    const bullish = c.close >= c.open;
    const absorb = bodyRatio <= 0.45 && rvol >= 1.35;
    const buyReject = lowerWick >= range * 0.32 && lowerWick >= upperWick * 1.05 && rvol >= 1.2;
    const sellReject = upperWick >= range * 0.32 && upperWick >= lowerWick * 1.05 && rvol >= 1.2;

    // 세력매수 ZONE — 저가 방어·매집
    if (buyReject || (absorb && bullish && lowerWick >= upperWick * 0.85)) {
      const bot = c.low - atrVal * 0.08;
      const top = Math.min(c.low + half * 1.2, c.close + atrVal * 0.2);
      if (top > bot) {
        const score = Math.min(
          96,
          48 + rvol * 10 + (buyReject ? 14 : 8) + (absorb ? 10 : 0)
        );
        raw.push({
          id: `merged-desk-ai-buy-${t}`,
          kind: 'buy',
          side: 'LONG',
          top,
          bot,
          mid: (top + bot) / 2,
          score,
          strength: Math.min(1, 0.45 + rvol * 0.12),
          labelKo: labelFor('buy', 'LONG'),
          reasonKo: absorb ? '거래량흡수·롱방어' : '고거래량·아랫심지 매집',
          time1: t,
          barIndex: i,
        });
      }
    }

    // 세력매도 ZONE — 고가 분산·숏 방어
    if (sellReject || (absorb && !bullish && upperWick >= lowerWick * 0.85)) {
      const top = c.high + atrVal * 0.08;
      const bot = Math.max(c.high - half * 1.2, c.close - atrVal * 0.2);
      if (top > bot) {
        const score = Math.min(
          96,
          48 + rvol * 10 + (sellReject ? 14 : 8) + (absorb ? 10 : 0)
        );
        raw.push({
          id: `merged-desk-ai-sell-${t}`,
          kind: 'sell',
          side: 'SHORT',
          top,
          bot,
          mid: (top + bot) / 2,
          score,
          strength: Math.min(1, 0.45 + rvol * 0.12),
          labelKo: labelFor('sell', 'SHORT'),
          reasonKo: absorb ? '거래량흡수·숏방어' : '고거래량·윗심지 분산',
          time1: t,
          barIndex: i,
        });
      }
    }

    // 세력 방어 ZONE — 강한 흡수(몸통 작고 거래량 큼)
    if (absorb && rvol >= 1.55) {
      const mid = (c.high + c.low) / 2;
      const pad = Math.max(half * 0.85, atrVal * 0.35);
      const side: 'LONG' | 'SHORT' =
        bullish || lowerWick > upperWick ? 'LONG' : 'SHORT';
      const top = mid + pad * (side === 'SHORT' ? 1.05 : 0.75);
      const bot = mid - pad * (side === 'LONG' ? 1.05 : 0.75);
      raw.push({
        id: `merged-desk-ai-defense-${t}`,
        kind: 'defense',
        side,
        top,
        bot,
        mid,
        score: Math.min(94, 52 + rvol * 12),
        strength: Math.min(1, 0.5 + rvol * 0.1),
        labelKo: labelFor('defense', side),
        reasonKo: '세력·고래 거래량 흡수 방어',
        time1: t,
        barIndex: i,
      });
    }
  }

  // 후보 없으면 최근 고거래량 봉으로 최소 1매수·1매도 보강 (차트에 무조건 보이게)
  if (raw.length === 0) {
    let bestBuy: { i: number; rvol: number } | null = null;
    let bestSell: { i: number; rvol: number } | null = null;
    for (let i = start; i < n - 1; i++) {
      const c = candles[i]!;
      const vol = Math.max(0, Number(c.volume) || 0);
      const vSma = smaVol(candles, i, 20);
      if (vSma <= 0) continue;
      const rvol = vol / vSma;
      if (rvol < 1.05) continue;
      const range = Math.max(c.high - c.low, atrVal * 0.05);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      if (lowerWick >= upperWick) {
        if (!bestBuy || rvol > bestBuy.rvol) bestBuy = { i, rvol };
      } else {
        if (!bestSell || rvol > bestSell.rvol) bestSell = { i, rvol };
      }
      if (!bestBuy && lowerWick / range >= 0.2) bestBuy = { i, rvol };
      if (!bestSell && upperWick / range >= 0.2) bestSell = { i, rvol };
    }
    const pushFallback = (
      pick: { i: number; rvol: number },
      kind: 'buy' | 'sell'
    ) => {
      const c = candles[pick.i]!;
      const t = Number(c.time);
      const half = Math.max(atrVal * 0.35, (c.high - c.low) * 0.45);
      if (kind === 'buy') {
        const bot = c.low - atrVal * 0.06;
        const top = c.low + half;
        raw.push({
          id: `merged-desk-ai-buy-${t}`,
          kind: 'buy',
          side: 'LONG',
          top,
          bot,
          mid: (top + bot) / 2,
          score: Math.min(78, 42 + pick.rvol * 8),
          strength: Math.min(0.85, 0.4 + pick.rvol * 0.1),
          labelKo: labelFor('buy', 'LONG'),
          reasonKo: '상대고거래량·저가 매집 후보',
          time1: t,
          barIndex: pick.i,
        });
      } else {
        const top = c.high + atrVal * 0.06;
        const bot = c.high - half;
        raw.push({
          id: `merged-desk-ai-sell-${t}`,
          kind: 'sell',
          side: 'SHORT',
          top,
          bot,
          mid: (top + bot) / 2,
          score: Math.min(78, 42 + pick.rvol * 8),
          strength: Math.min(0.85, 0.4 + pick.rvol * 0.1),
          labelKo: labelFor('sell', 'SHORT'),
          reasonKo: '상대고거래량·고가 분산 후보',
          time1: t,
          barIndex: pick.i,
        });
      }
    };
    if (bestBuy) pushFallback(bestBuy, 'buy');
    if (bestSell) pushFallback(bestSell, 'sell');
  }

  // 같은 가격대 병합·점수순 · 지지/저항 각 ≤3
  const merged = mergeNearbyZones(raw, atrVal);
  const longs = merged
    .filter((z) => z.side === 'LONG')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const shorts = merged
    .filter((z) => z.side === 'SHORT')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const zones = [...longs, ...shorts].sort((a, b) => a.barIndex - b.barIndex);

  const overlays: OverlayItem[] = [];
  for (const z of zones) {
    const formT = findMergedDeskZoneFormationBarTime(candles, z.top, z.bot, z.time1);
    const zoneTimes = mergedDeskAnalyzedZoneSpanTimes(candles, {
      id: z.id,
      time1: formT,
      price1: z.top,
      price2: z.bot,
    });
    if (!zoneTimes) continue;
    const isLong = z.side === 'LONG';
    overlays.push({
      id: z.id,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: z.labelKo,
      zoneFaceBase: z.labelKo,
      labelTooltip: `${z.reasonKo} · ${fmt(z.bot)}~${fmt(z.top)} · 캔들·거래량 자동감지 (참고)`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: zoneTimes.t1 as UTCTimestamp,
      time2: zoneTimes.t2 as UTCTimestamp,
      price1: z.top,
      price2: z.bot,
      confidence: z.score,
      color: zoneFill(z.side, z.kind, z.strength),
      category: 'zones',
      zonePulse: z.score >= 72,
      zoneFillPreserve: true,
      lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
      labelBackgroundColor: isLong ? 'rgba(6,78,59,0.94)' : 'rgba(127,29,29,0.94)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: [
        'merged-desk-ai-force-zone',
        `merged-desk-ai-force-zone--${z.kind}`,
        'merged-desk-zone-caption-clean',
        'merged-desk-pill-zone',
        'merged-desk-zone-pro-hero',
        isLong ? 'overlay-zone--ai-force-long' : 'overlay-zone--ai-force-short',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  const summaryKo =
    zones.length === 0
      ? '세력·고래 ZONE 후보 없음 (거래량·윅 조건)'
      : `AI ZONE ${zones.length} · 매수${longs.filter((z) => z.kind === 'buy').length} · 매도${shorts.filter((z) => z.kind === 'sell').length} · 방어${zones.filter((z) => z.kind === 'defense').length}`;

  return { zones, overlays, summaryKo };
}

function mergeNearbyZones(zones: AiForceZone[], atrVal: number): AiForceZone[] {
  if (zones.length <= 1) return zones;
  const sorted = [...zones].sort((a, b) => a.mid - b.mid || b.score - a.score);
  const out: AiForceZone[] = [];
  const thr = atrVal * 0.85;
  for (const z of sorted) {
    const hit = out.find(
      (o) => o.side === z.side && Math.abs(o.mid - z.mid) < thr && o.kind === z.kind
    );
    if (!hit) {
      out.push(z);
      continue;
    }
    if (z.score > hit.score) {
      hit.top = Math.max(hit.top, z.top);
      hit.bot = Math.min(hit.bot, z.bot);
      hit.mid = (hit.top + hit.bot) / 2;
      hit.score = z.score;
      hit.strength = Math.max(hit.strength, z.strength);
      hit.reasonKo = z.reasonKo;
      hit.labelKo = z.labelKo;
      hit.time1 = Math.min(hit.time1, z.time1);
      hit.barIndex = Math.min(hit.barIndex, z.barIndex);
      hit.id = z.id;
    } else {
      hit.top = Math.max(hit.top, z.top);
      hit.bot = Math.min(hit.bot, z.bot);
      hit.mid = (hit.top + hit.bot) / 2;
      hit.time1 = Math.min(hit.time1, z.time1);
    }
  }
  return out;
}

export function summarizeMergedDeskAiForceZonesKo(pack: AiForceZonesPack): string {
  return pack.summaryKo;
}
