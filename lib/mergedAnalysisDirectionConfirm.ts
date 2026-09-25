/**
 * 통합·분석 — 차트 가시 구간 롱/숏 확정·시나리오 자체 탐지.
 * ST·zone·종가·RSI·거래량 + ST지지/저항 홀드(오르기 전 선행).
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import { rsi } from '@/lib/indicators';
import {
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type InstitutionalSuperTrendCore,
} from '@/lib/institutionalSuperBand';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  mergedLeadingBarExtremes,
  mergedLeadingCloseGate,
  mergedLeadingMomentumGate,
  mergedLeadingVolumeGate,
} from '@/lib/mergedAnalysisLeadingBar';

export type MergedDirectionConfirmTier = 'confirmed' | 'strong' | 'building';

export type MergedDirectionConfirmGates = {
  structure: boolean;
  zone: boolean;
  close: boolean;
  momentum: boolean;
  volume: boolean;
  /** ST 계단선 터치 후 종가 홀드(원 표시형 반등·하락 선행) */
  stHold: boolean;
};

export type MergedDirectionConfirm = {
  id: string;
  time: number;
  direction: 'LONG' | 'SHORT';
  tier: MergedDirectionConfirmTier;
  gatesPassCount: number;
  gates: MergedDirectionConfirmGates;
  labelKo: string;
  detailKo: string;
  /** 마지막 봉 analyze confirmedSignal과 병합된 경우 */
  fromAnalyze?: boolean;
};

function sourceCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedWorkCandles(candles, timeframe);
}

function minSpacingBars(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number> = {
    '1m': 14,
    '3m': 12,
    '5m': 10,
    '15m': 8,
    '1h': 6,
    '4h': 5,
    '1d': 4,
    '1w': 3,
    '1M': 2,
  };
  return map[tf] ?? 6;
}

function avgVolume(candles: Candle[], endIdx: number, period = 20): number {
  const start = Math.max(0, endIdx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    sum += candles[i]!.volume > 0 ? candles[i]!.volume : 1;
    n++;
  }
  return n > 0 ? sum / n : 1;
}

function recentSwingHigh(candles: Candle[], endIdx: number, lookback = 14): number {
  const start = Math.max(0, endIdx - lookback);
  let hi = -Infinity;
  for (let i = start; i < endIdx; i++) hi = Math.max(hi, candles[i]!.high);
  return Number.isFinite(hi) ? hi : candles[endIdx]!.high;
}

function recentSwingLow(candles: Candle[], endIdx: number, lookback = 14): number {
  const start = Math.max(0, endIdx - lookback);
  let lo = Infinity;
  for (let i = start; i < endIdx; i++) lo = Math.min(lo, candles[i]!.low);
  return Number.isFinite(lo) ? lo : candles[endIdx]!.low;
}

function zoneTouchAtBar(
  candles: Candle[],
  idx: number,
  direction: 'LONG' | 'SHORT',
  keyZones: MergedKeyZone[],
  bundle: MonthDeskStrikeDeskBundle | null | undefined,
  lookback = 6
): boolean {
  const start = Math.max(0, idx - lookback);
  for (let j = start; j <= idx; j++) {
    const isLast = j === candles.length - 1;
    const c = candles[j]!;
    const ex = mergedLeadingBarExtremes(c, isLast);
    if (direction === 'LONG') {
      for (const z of keyZones) {
        if (z.kind !== 'demand') continue;
        if (ex.low <= z.top && ex.low >= z.bot - (z.top - z.bot) * 0.15) return true;
      }
      const leg = bundle?.long;
      if (leg && ex.low <= leg.zoneTop && ex.low >= leg.zoneBot) return true;
    } else {
      for (const z of keyZones) {
        if (z.kind !== 'supply') continue;
        if (ex.high >= z.bot && ex.high <= z.top + (z.top - z.bot) * 0.15) return true;
      }
      const leg = bundle?.short;
      if (leg && ex.high >= leg.zoneBot && ex.high <= leg.zoneTop) return true;
    }
  }
  return false;
}

/**
 * 초록/빨강 계단선(SuperTrend) 터치 후 종가 홀드 —
 * 큰 양봉·음봉 나오기 전 「시나리오」 선행 (원 표시 구간).
 */
function stLineHoldAtBar(
  candles: Candle[],
  idx: number,
  direction: 'LONG' | 'SHORT',
  core: InstitutionalSuperTrendCore
): boolean {
  const c = candles[idx]!;
  const st = core.trend[idx] ?? 0;
  const prevSt = idx > 0 ? core.trend[idx - 1] ?? st : st;
  const line = direction === 'LONG' ? core.finalLower[idx] : core.finalUpper[idx];
  if (!(line > 0) || !Number.isFinite(line)) return false;

  const range = Math.max(c.high - c.low, Math.abs(c.close - c.open), c.close * 0.0008);
  const tol = range * 0.65;

  if (direction === 'LONG') {
    const trendOk = st === 1 || (prevSt === -1 && st === 1);
    if (!trendOk) return false;
    const touched = c.low <= line + tol;
    const held = c.close > line;
    const reject =
      c.close >= c.open || c.low <= Math.min(c.open, c.close) - range * 0.2;
    return touched && held && reject;
  }

  const trendOk = st === -1 || (prevSt === 1 && st === -1);
  if (!trendOk) return false;
  const touched = c.high >= line - tol;
  const held = c.close < line;
  const reject =
    c.close <= c.open || c.high >= Math.max(c.open, c.close) + range * 0.2;
  return touched && held && reject;
}

function evaluateBarGates(params: {
  candles: Candle[];
  idx: number;
  direction: 'LONG' | 'SHORT';
  stTrend: number[];
  core: InstitutionalSuperTrendCore;
  rsiVals: number[];
  keyZones: MergedKeyZone[];
  bundle: MonthDeskStrikeDeskBundle | null | undefined;
}): MergedDirectionConfirmGates {
  const { candles, idx, direction, stTrend, core, rsiVals, keyZones, bundle } = params;
  const c = candles[idx]!;
  const isLastBar = idx === candles.length - 1;
  const st = stTrend[idx] ?? 0;
  const structure = direction === 'LONG' ? st === 1 : st === -1;

  const zone = zoneTouchAtBar(candles, idx, direction, keyZones, bundle, isLastBar ? 8 : 6);

  const swingHi = recentSwingHigh(candles, idx);
  const swingLo = recentSwingLow(candles, idx);
  const close = mergedLeadingCloseGate({
    candle: c,
    direction,
    swingHigh: swingHi,
    swingLow: swingLo,
    isLastBar,
  });

  const r = rsiVals[idx] ?? 50;
  const momentum = mergedLeadingMomentumGate(r, direction, isLastBar);
  const volume = mergedLeadingVolumeGate(c, avgVolume(candles, idx), isLastBar);
  const stHold = stLineHoldAtBar(candles, idx, direction, core);

  return { structure, zone, close, momentum, volume, stHold };
}

function tierFromGates(
  gates: MergedDirectionConfirmGates,
  gatesPass: number,
  isLastBar: boolean
): MergedDirectionConfirmTier | null {
  const closeOrHold = gates.close || gates.stHold;
  /** ST홀드+구조+zone — 돌파 전 시나리오(원 구간형)도 confirmed 경로 */
  if (gatesPass >= 4 && gates.structure && closeOrHold && gates.zone) return 'confirmed';
  if (gates.structure && gates.stHold && (gates.zone || gates.volume) && gatesPass >= 3) {
    return gates.close ? 'confirmed' : 'strong';
  }
  if (gatesPass >= 4 && gates.structure && closeOrHold) return 'strong';
  if (gatesPass >= 3 && gates.structure) return 'building';
  if (isLastBar && gatesPass >= 3 && (closeOrHold || gates.zone)) return 'building';
  return null;
}

function gateSummaryKo(gates: MergedDirectionConfirmGates): string {
  const parts: string[] = [];
  if (gates.structure) parts.push('구조');
  if (gates.stHold) parts.push('ST홀드');
  if (gates.zone) parts.push('zone');
  if (gates.close) parts.push('종가');
  if (gates.momentum) parts.push('RSI');
  if (gates.volume) parts.push('Vol');
  return parts.length ? parts.join('+') : '게이트 미충족';
}

function labelForTier(
  tier: MergedDirectionConfirmTier,
  direction: 'LONG' | 'SHORT',
  stHold: boolean
): string {
  if (tier === 'confirmed') {
    return direction === 'LONG' ? '▲ 롱확정' : '▼ 숏확정';
  }
  if (tier === 'strong' || (tier === 'building' && stHold)) {
    return direction === 'LONG' ? '▲ 롱시나리오' : '▼ 숏시나리오';
  }
  return direction === 'LONG' ? '▲ 롱선행' : '▼ 숏선행';
}

/** 가시 구간 캔들 스캔 — 과거·현재 롱/숏 확정·시나리오 이벤트 */
export function detectMergedDirectionConfirms(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  bundle?: MonthDeskStrikeDeskBundle | null;
  analysis?: AnalyzeResponse | null;
  maxEvents?: number;
}): MergedDirectionConfirm[] {
  const { candles, timeframe, bundle, analysis } = params;
  const source = sourceCandles(candles, timeframe);
  if (source.length < 24) return [];

  const keyZones = params.keyZones ?? [];
  const core = computeInstitutionalSuperTrendCore(
    source,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  if (!core) return [];

  const rsiVals = rsi(source, 14);
  const spacing = minSpacingBars(timeframe);
  const maxEvents = params.maxEvents ?? 12;
  const out: MergedDirectionConfirm[] = [];
  let lastLongIdx = -999;
  let lastShortIdx = -999;

  const startIdx = Math.max(20, Math.floor(source.length * 0.08));
  for (let i = startIdx; i < source.length; i++) {
    for (const direction of ['LONG', 'SHORT'] as const) {
      const lastIdx = direction === 'LONG' ? lastLongIdx : lastShortIdx;
      if (i - lastIdx < spacing) continue;

      const gates = evaluateBarGates({
        candles: source,
        idx: i,
        direction,
        stTrend: core.trend,
        core,
        rsiVals,
        keyZones,
        bundle,
      });
      const gatesPassCount = Object.values(gates).filter(Boolean).length;
      const isLast = i === source.length - 1;
      const tier = tierFromGates(gates, gatesPassCount, isLast);
      if (!tier) continue;
      /** building은 마지막 봉만 — 단 ST홀드 시나리오는 과거 봉에도 표시 */
      if (tier === 'building' && !isLast && !gates.stHold) continue;
      const t = Number(source[i]!.time);
      if (!Number.isFinite(t)) continue;

      const labelKo = labelForTier(tier, direction, gates.stHold);
      const inval =
        direction === 'LONG'
          ? '무효: ST·지지 종가 이탈 시 시나리오 폐기'
          : '무효: ST·저항 종가 돌파 시 시나리오 폐기';

      out.push({
        id: `merged-ares-confirm-${direction.toLowerCase()}-${t}`,
        time: t,
        direction,
        tier: tier === 'building' && gates.stHold ? 'strong' : tier,
        gatesPassCount,
        gates,
        labelKo,
        detailKo: `${gateSummaryKo(gates)} · ${gatesPassCount}/6 · TF ${normalizeChartTimeframe(timeframe)}${
          gates.stHold ? ' · ST터치홀드' : ''
        }${isLast ? (tier === 'building' ? ' · 선행봉' : ' · 현재봉') : ''} · ${inval}`,
      });

      if (direction === 'LONG') lastLongIdx = i;
      else lastShortIdx = i;
    }
  }

  out.sort((a, b) => b.time - a.time);
  const trimmed = out.slice(0, maxEvents);

  const cs = analysis?.confirmedSignal;
  const lastT = Number(source[source.length - 1]!.time);
  if (cs?.confirmed && cs.direction && Number.isFinite(lastT)) {
    const existing = trimmed.find((e) => e.time === lastT && e.direction === cs.direction);
    if (existing) {
      existing.tier = 'confirmed';
      existing.fromAnalyze = true;
      existing.labelKo = cs.direction === 'LONG' ? '▲ 롱확정' : '▼ 숏확정';
      existing.gatesPassCount = Math.max(existing.gatesPassCount, cs.gatesPassCount ?? 5);
      existing.detailKo = `analyze 5게이트 · ${existing.detailKo}`;
    } else {
      trimmed.unshift({
        id: `merged-ares-confirm-${cs.direction.toLowerCase()}-${lastT}-analyze`,
        time: lastT,
        direction: cs.direction,
        tier: 'confirmed',
        gatesPassCount: cs.gatesPassCount ?? 5,
        gates: {
          structure: cs.structure,
          zone: cs.supportResistance,
          close: cs.close,
          momentum: cs.rsi,
          volume: cs.fvgZone,
          stHold: false,
        },
        labelKo: cs.direction === 'LONG' ? '▲ 롱확정' : '▼ 숏확정',
        detailKo: `analyze 확정 · ${(cs.reasons ?? []).slice(0, 2).join(' · ') || '5게이트'} · 참고`,
        fromAnalyze: true,
      });
    }
  }

  return trimmed.slice(0, maxEvents + 1);
}

export function buildMergedDirectionConfirmMarkers(
  confirms: MergedDirectionConfirm[]
): AtlasPulseMarker[] {
  const out: AtlasPulseMarker[] = [];
  for (const c of confirms.filter((x) => x.tier === 'confirmed' || x.tier === 'strong')) {
    const t = Number(c.time) as UTCTimestamp;
    if (!Number.isFinite(t)) continue;
    const long = c.direction === 'LONG';
    const hot = c.tier === 'confirmed';
    const st = c.gates.stHold;
    out.push({
      time: t,
      position: long ? 'belowBar' : 'aboveBar',
      shape: long ? 'square' : 'circle',
      color: hot ? (long ? '#22c55e' : '#ef4444') : long ? '#4ade80' : '#f87171',
      text: hot
        ? long
          ? '롱확정'
          : '숏확정'
        : st
          ? long
            ? '롱시나리오'
            : '숏시나리오'
          : long
            ? '롱+'
            : '숏+',
      size: hot || st ? 2 : 1,
      id: `${c.id}-mark`,
    });
  }
  return out;
}

export function buildMergedDirectionConfirmLabels(
  confirms: MergedDirectionConfirm[],
  candles: Candle[]
): OverlayItem[] {
  const out: OverlayItem[] = [];
  const byTime = new Map<number, Candle>();
  for (const c of candles) byTime.set(Number(c.time), c);

  for (const c of confirms.filter((x) => x.tier === 'confirmed' || x.tier === 'strong').slice(0, 10)) {
    const t = Number(c.time) as UTCTimestamp;
    if (!Number.isFinite(t)) continue;
    const bar = byTime.get(t);
    const px = bar ? (c.direction === 'LONG' ? bar.low : bar.high) : 0;
    const long = c.direction === 'LONG';
    out.push({
      id: c.id,
      kind: 'label',
      label: `${c.labelKo} ${c.gatesPassCount}/6`,
      x1: 0.5,
      y1: long ? 1 : 0,
      x2: 0.5,
      y2: long ? 1 : 0,
      time1: t,
      time2: t,
      price1: px,
      confidence: c.gatesPassCount * 16,
      color: long ? '#22c55e' : '#ef4444',
      category: 'scenario',
      labelTooltip: c.detailKo,
      labelBackgroundColor: long ? 'rgba(22,101,52,0.94)' : 'rgba(127,29,29,0.92)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: [
        'merged-ares-confirm-label',
        long ? 'merged-ares-confirm-long' : 'merged-ares-confirm-short',
        c.fromAnalyze ? 'merged-ares-confirm-analyze' : '',
        c.gates.stHold ? 'merged-ares-confirm-st-hold' : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  return out;
}

export function summarizeMergedDirectionConfirmsKo(confirms: MergedDirectionConfirm[]): string {
  if (!confirms.length) return '롱·숏 확정/시나리오 대기(참고)';
  const last = confirms[0]!;
  return `${last.labelKo} · ${last.gatesPassCount}/6 · ${last.detailKo.slice(0, 72)}`;
}
