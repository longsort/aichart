/**
 * 통합·분석 — 와이코프 축적/분배 A–E + 마크업/마크다운 휴리스틱.
 * 시퀀스·거래량·레인지 조건부 해석. 확정 예측·승률 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { buildWyckoffBlinkOverlays, wyckoffEventEn } from '@/lib/mergedDeskWyckoffSchematic';

export type WyckoffSchematic = 'accumulation' | 'distribution';
export type WyckoffMacro = 'accumulation' | 'markup' | 'distribution' | 'markdown';
export type WyckoffPhase = 'A' | 'B' | 'C' | 'D' | 'E';
export type WyckoffEvent =
  | 'PS'
  | 'SC'
  | 'AR'
  | 'ST'
  | 'Spring'
  | 'LPS'
  | 'SOS'
  | 'BU'
  | 'PSY'
  | 'BC'
  | 'UT'
  | 'UTAD'
  | 'SOW'
  | 'LPSY'
  | 'none';

export type MergedDeskWyckoffRead = {
  macro: WyckoffMacro;
  schematic: WyckoffSchematic | null;
  schematicVariant: 1 | 2 | null;
  phase: WyckoffPhase | null;
  event: WyckoffEvent;
  eventKo: string;
  eventEn: string;
  headlineKo: string;
  detailKo: string;
  confidence: number;
  support: number;
  resist: number;
  rangeStartIdx: number;
  rangeEndIdx: number;
  eventIdx: number;
  eventTime: number;
  eventPrice: number;
  spring: boolean;
  utad: boolean;
};

export type MergedDeskWyckoffPack = {
  read: MergedDeskWyckoffRead | null;
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
};

const EVENT_KO: Record<WyckoffEvent, string> = {
  PS: 'PS',
  SC: 'SC',
  AR: 'AR',
  ST: 'ST',
  Spring: '스프링',
  LPS: 'LPS',
  SOS: 'SOS',
  BU: 'BU',
  PSY: 'PSY',
  BC: 'BC',
  UT: 'UT',
  UTAD: 'UTAD',
  SOW: 'SOW',
  LPSY: 'LPSY',
  none: '',
};

const MACRO_KO: Record<WyckoffMacro, string> = {
  accumulation: '축적',
  markup: '마크업',
  distribution: '분배',
  markdown: '마크다운',
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 3) return 0;
  const from = Math.max(1, n - 14);
  let sum = 0;
  let count = 0;
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    count++;
  }
  return count > 0 ? sum / count : Math.max(1e-12, candles[n - 1]!.high - candles[n - 1]!.low);
}

function volAvg(candles: Candle[], from: number, to: number): number {
  let s = 0;
  let n = 0;
  for (let i = from; i <= to; i++) {
    s += candles[i]?.volume ?? 0;
    n++;
  }
  return n > 0 ? s / n : 0;
}

type RangeHit = {
  startIdx: number;
  endIdx: number;
  high: number;
  low: number;
  score: number;
  hiTouches: number;
  loTouches: number;
};

function findTradingRange(candles: Candle[], atr: number): RangeHit | null {
  const n = candles.length;
  if (n < 36 || !(atr > 0)) return null;
  let best: RangeHit | null = null;
  for (const win of [40, 56, 72, 96, 120]) {
    if (n < win) continue;
    const a = n - win;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = a; i < n; i++) {
      hi = Math.max(hi, candles[i]!.high);
      lo = Math.min(lo, candles[i]!.low);
    }
    const width = hi - lo;
    if (!(width > atr * 1.8) || width > atr * 18) continue;
    let hiTouches = 0;
    let loTouches = 0;
    let inside = 0;
    for (let i = a; i < n; i++) {
      const c = candles[i]!;
      if (c.high >= hi - atr * 0.38) hiTouches++;
      if (c.low <= lo + atr * 0.38) loTouches++;
      if (c.close <= hi && c.close >= lo) inside++;
    }
    const insideRatio = inside / win;
    if (insideRatio < 0.68 || hiTouches < 2 || loTouches < 2) continue;
    const score =
      insideRatio * 42 +
      Math.min(hiTouches, 7) * 3.5 +
      Math.min(loTouches, 7) * 3.5 +
      (width / atr < 12 ? 8 : 0);
    if (!best || score > best.score) {
      best = { startIdx: a, endIdx: n - 1, high: hi, low: lo, score, hiTouches, loTouches };
    }
  }
  return best;
}

function priorSlope(candles: Candle[], rangeStart: number): number {
  const from = Math.max(0, rangeStart - Math.min(36, Math.max(12, Math.floor(rangeStart * 0.35))));
  const to = Math.max(from + 2, rangeStart - 1);
  return (candles[to]!.close - candles[from]!.close) / Math.max(1, to - from);
}

function climaxIdx(candles: Candle[], from: number, to: number): number {
  let bestI = from;
  let bestS = -1;
  for (let i = from; i <= to; i++) {
    const c = candles[i]!;
    const s = (c.volume ?? 0) * Math.max(1e-12, c.high - c.low);
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return bestI;
}

export function detectMergedDeskWyckoff(candles: Candle[]): MergedDeskWyckoffRead | null {
  if (candles.length < 40) return null;
  const atr = atr14(candles);
  if (!(atr > 0)) return null;
  const last = candles[candles.length - 1]!;
  const range = findTradingRange(candles, atr);
  const closes = candles.slice(-24).map((c) => c.close);
  const trendSlope = (closes[closes.length - 1]! - closes[0]!) / Math.max(1, closes.length - 1);
  const trendStrength = Math.abs(trendSlope) / atr;

  if (!range) {
    if (trendStrength < 0.18) return null;
    const macro: WyckoffMacro = trendSlope > 0 ? 'markup' : 'markdown';
    return {
      macro,
      schematic: null,
      schematicVariant: null,
      phase: 'E',
      event: 'none',
      eventKo: MACRO_KO[macro],
      eventEn: macro === 'markup' ? 'Markup' : 'Markdown',
      headlineKo: `와이코프 ${MACRO_KO[macro]} 진행`,
      detailKo: `뚜렷한 TR보다 ${MACRO_KO[macro]} 기울기. 상위 TF 맥락·무효화 확인 필요. 확정 아님.`,
      confidence: Math.min(62, 42 + Math.round(trendStrength * 40)),
      support: last.low,
      resist: last.high,
      rangeStartIdx: Math.max(0, candles.length - 24),
      rangeEndIdx: candles.length - 1,
      eventIdx: candles.length - 1,
      eventTime: Number(last.time),
      eventPrice: last.close,
      spring: false,
      utad: false,
    };
  }

  const slope = priorSlope(candles, range.startIdx);
  const schematic: WyckoffSchematic = slope <= 0 ? 'accumulation' : 'distribution';
  const vAvg = volAvg(candles, range.startIdx, range.endIdx);
  const midIdx = range.startIdx + Math.floor((range.endIdx - range.startIdx) * 0.42);
  const cli = climaxIdx(candles, range.startIdx, Math.min(midIdx, range.endIdx));
  const cliBar = candles[cli]!;
  const width = range.high - range.low;
  const band = Math.max(atr * 0.22, width * 0.08);

  let spring = false;
  let utad = false;
  let springIdx = -1;
  let utadIdx = -1;
  const testFrom = range.startIdx + Math.floor((range.endIdx - range.startIdx) * 0.45);
  for (let i = testFrom; i <= range.endIdx; i++) {
    const c = candles[i]!;
    if (c.low < range.low - atr * 0.12 && c.close > range.low - atr * 0.05) {
      spring = true;
      springIdx = i;
    }
    if (c.high > range.high + atr * 0.12 && c.close < range.high + atr * 0.05) {
      utad = true;
      utadIdx = i;
    }
  }

  const lastVol = last.volume ?? 0;
  const volExpand = vAvg > 0 && lastVol >= vAvg * 1.35;
  const closesAbove = candles.slice(-5).every((c) => c.close > range.high - band * 0.15);
  const closesBelow = candles.slice(-5).every((c) => c.close < range.low + band * 0.15);
  const sos = last.close > range.high && volExpand;
  const sow = last.close < range.low && volExpand;

  let phase: WyckoffPhase = 'B';
  let event: WyckoffEvent = 'ST';
  let macro: WyckoffMacro = schematic;

  if (schematic === 'accumulation') {
    if (closesAbove || (sos && last.close > range.high)) {
      macro = 'markup';
      phase = closesAbove ? 'E' : 'D';
      event = closesAbove ? 'SOS' : last.close > range.high - band ? 'BU' : 'SOS';
    } else if (sos) {
      phase = 'D';
      event = 'SOS';
    } else if (spring) {
      phase = 'C';
      event = 'Spring';
    } else {
      const lateLows = candles.slice(Math.max(testFrom, candles.length - 18)).map((c) => c.low);
      const earlyLow = Math.min(...candles.slice(range.startIdx, midIdx + 1).map((c) => c.low));
      const hhLows = lateLows.length >= 3 && lateLows[lateLows.length - 1]! > earlyLow + band * 0.4;
      if (hhLows && last.close > (range.low + range.high) / 2) {
        phase = 'C';
        event = 'LPS';
      } else if (cli <= midIdx && cliBar.low <= range.low + band * 1.4) {
        const afterHi = Math.max(...candles.slice(cli, Math.min(cli + 12, range.endIdx + 1)).map((c) => c.high));
        phase = afterHi >= range.high - band ? (range.endIdx - range.startIdx > 28 ? 'B' : 'A') : 'A';
        event = phase === 'A' ? (cliBar.volume >= vAvg * 1.2 ? 'SC' : 'ST') : 'ST';
      }
    }
  } else {
    if (closesBelow || (sow && last.close < range.low)) {
      macro = 'markdown';
      phase = closesBelow ? 'E' : 'D';
      event = closesBelow ? 'SOW' : 'LPSY';
    } else if (sow) {
      phase = 'D';
      event = 'SOW';
    } else if (utad) {
      phase = 'C';
      event = 'UTAD';
    } else {
      const lateHighs = candles.slice(Math.max(testFrom, candles.length - 18)).map((c) => c.high);
      const earlyHigh = Math.max(...candles.slice(range.startIdx, midIdx + 1).map((c) => c.high));
      const llHighs = lateHighs.length >= 3 && lateHighs[lateHighs.length - 1]! < earlyHigh - band * 0.4;
      if (llHighs && last.close < (range.low + range.high) / 2) {
        phase = 'C';
        event = 'LPSY';
      } else if (cli <= midIdx && cliBar.high >= range.high - band * 1.4) {
        phase = range.endIdx - range.startIdx > 28 ? 'B' : 'A';
        event = phase === 'A' ? (cliBar.volume >= vAvg * 1.2 ? 'BC' : 'ST') : 'UT';
      }
    }
  }

  if (phase === 'B') {
    const midP = (range.low + range.high) / 2;
    if (schematic === 'accumulation') {
      event = last.close <= midP ? 'ST' : 'ST';
    } else if (last.close >= midP && last.high >= range.high - band * 1.2) {
      event = 'UT';
    } else if (last.close <= midP && last.low <= range.low + band * 1.2) {
      event = 'SOW';
    } else {
      event = 'ST';
    }
  }

  const schematicVariant: 1 | 2 = spring || utad ? 1 : 2;
  const eventEn = wyckoffEventEn(phase, event) || EVENT_KO[event];
  const roman = schematicVariant === 1 ? 'I' : 'II';
  const eventKo = eventEn || EVENT_KO[event];
  let confidence = Math.round(Math.min(86, 38 + range.score * 0.45));
  if (spring || utad) confidence += 8;
  if (sos || sow) confidence += 6;
  if (phase === 'E') confidence += 4;
  confidence = Math.max(40, Math.min(88, confidence));

  const trapNote =
    schematic === 'accumulation'
      ? spring
        ? 'Phase C 스프링(베어트랩) 후보.'
        : event === 'LPS'
          ? '스프링 없이 LPS형 Phase C 후보.'
          : phase === 'B'
            ? 'Phase B 원인 구축 · ST in Phase B 후보.'
            : 'TR 안 축적 시퀀스.'
      : utad
        ? 'Phase C UTAD(불트랩) 후보.'
        : event === 'LPSY'
          ? 'UTAD 없이 LPSY형 Phase C 후보.'
          : phase === 'B'
            ? 'Phase B 원인 구축 · ST/UT/SOW 후보.'
            : 'TR 안 분배 시퀀스.';

  let eventIdx = candles.length - 1;
  const lookFrom = Math.max(range.startIdx, candles.length - 16);
  if (event === 'Spring' && springIdx >= 0) eventIdx = springIdx;
  else if (event === 'UTAD' && utadIdx >= 0) eventIdx = utadIdx;
  else if (event === 'SC' || event === 'ST' || event === 'LPS' || event === 'SOW') {
    let best = eventIdx;
    let bestP = Infinity;
    for (let i = lookFrom; i < candles.length; i++) {
      if (candles[i]!.low < bestP) {
        bestP = candles[i]!.low;
        best = i;
      }
    }
    eventIdx = best;
  } else if (event === 'BC' || event === 'UT' || event === 'SOS' || event === 'LPSY' || event === 'AR') {
    let best = eventIdx;
    let bestP = -Infinity;
    for (let i = lookFrom; i < candles.length; i++) {
      if (candles[i]!.high > bestP) {
        bestP = candles[i]!.high;
        best = i;
      }
    }
    eventIdx = best;
  }
  const evBar = candles[eventIdx]!;
  const lowEvent =
    event === 'PS' ||
    event === 'SC' ||
    event === 'ST' ||
    event === 'Spring' ||
    event === 'LPS' ||
    event === 'SOW';
  const eventPrice = lowEvent ? evBar.low : evBar.high;

  return {
    macro,
    schematic,
    schematicVariant,
    phase,
    event,
    eventKo,
    eventEn,
    headlineKo: `와이코프 ${MACRO_KO[macro]} ${roman} · ${eventEn || EVENT_KO[event] || phase}`,
    detailKo: `${trapNote} 지금 자리 ${eventEn || eventKo}. 지지·저항은 SC/AR(또는 BC/AR) 근사. 확정 아님.`,
    confidence,
    support: range.low,
    resist: range.high,
    rangeStartIdx: range.startIdx,
    rangeEndIdx: range.endIdx,
    eventIdx,
    eventTime: Number(evBar.time),
    eventPrice,
    spring: spring || springIdx >= 0,
    utad: utad || utadIdx >= 0,
  };
}

export function buildMergedDeskWyckoffPack(params: {
  candles: Candle[];
  timeframe: string;
  enabled?: boolean;
}): MergedDeskWyckoffPack {
  if (params.enabled === false || params.candles.length < 40) {
    return { read: null, overlays: [], priceLines: [] };
  }
  const read = detectMergedDeskWyckoff(params.candles);
  if (!read) return { read: null, overlays: [], priceLines: [] };

  const candles = params.candles;
  const t1 = Number(candles[read.rangeStartIdx]!.time);
  const lastT = Number(candles[candles.length - 1]!.time);
  const barSec = candleBarDurationSec(params.timeframe, lastT);
  const t2 = lastT + barSec * MERGED_DESK_RIGHT_FUTURE_BARS;
  const width = Math.max(1e-12, read.resist - read.support);
  const face = Math.min(width * 0.22, width * 0.28);
  const acc = read.schematic !== 'distribution' && read.macro !== 'markdown';
  const supportColor = acc ? 'rgba(34,197,94,0.22)' : 'rgba(244,63,94,0.2)';
  const resistColor = acc ? 'rgba(248,113,113,0.2)' : 'rgba(251,146,60,0.22)';
  const lineSupport = acc ? '#4ade80' : '#fb7185';
  const lineResist = acc ? '#f87171' : '#fdba74';

  const overlays: OverlayItem[] = [
    {
      id: 'merged-desk-wyckoff-support-face',
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.support,
      price2: read.support + face,
      color: supportColor,
      confidence: read.confidence / 100,
      category: 'zones',
      zoneFillPreserve: true,
      zoneFaceBase: acc ? '축적지지' : '분배지지',
      zoneFaceSignal: read.phase ? `${read.phase}단계` : 'TR',
      zoneFaceDetailKo: read.detailKo,
      overlayZoneExtraClass: [
        'merged-desk-wyckoff-face',
        'merged-desk-money-zone-keep',
        acc ? 'merged-desk-wyckoff-acc' : 'merged-desk-wyckoff-dist',
      ].join(' '),
      structureBias: acc ? 'bullish' : 'bearish',
      labelTooltip: read.detailKo,
    },
    {
      id: 'merged-desk-wyckoff-resist-face',
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.resist - face,
      price2: read.resist,
      color: resistColor,
      confidence: read.confidence / 100,
      category: 'zones',
      zoneFillPreserve: true,
      zoneFaceBase: acc ? '축적저항' : '분배저항',
      zoneFaceSignal: read.eventKo || 'TR',
      zoneFaceDetailKo: read.detailKo,
      overlayZoneExtraClass: [
        'merged-desk-wyckoff-face',
        'merged-desk-money-zone-keep',
        acc ? 'merged-desk-wyckoff-acc' : 'merged-desk-wyckoff-dist',
      ].join(' '),
      structureBias: acc ? 'bullish' : 'bearish',
      labelTooltip: read.detailKo,
    },
    {
      id: 'merged-desk-wyckoff-support-line',
      kind: 'supportLine',
      label: acc ? 'WK지지' : 'WK분배하',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.support,
      price2: read.support,
      color: lineSupport,
      lineLabelColor: lineSupport,
      lineStrokeWidth: 1.4,
      lineDash: '6 4',
      category: 'zones',
      confidence: read.confidence,
      noProject: false,
      overlayZoneExtraClass: 'merged-desk-wyckoff-line',
    },
    {
      id: 'merged-desk-wyckoff-resist-line',
      kind: 'resistanceLine',
      label: acc ? 'WK저항' : 'WK분배상',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: read.resist,
      price2: read.resist,
      color: lineResist,
      lineLabelColor: lineResist,
      lineStrokeWidth: 1.4,
      lineDash: '6 4',
      category: 'zones',
      confidence: read.confidence,
      noProject: false,
      overlayZoneExtraClass: 'merged-desk-wyckoff-line',
    },
  ];

  const lowEvent =
    read.event === 'PS' ||
    read.event === 'SC' ||
    read.event === 'ST' ||
    read.event === 'Spring' ||
    read.event === 'LPS' ||
    read.event === 'SOW';
  const blinkLabel = read.eventEn || read.eventKo || 'Wyckoff';
  overlays.push(
    ...buildWyckoffBlinkOverlays([
      {
        id: 'merged-desk-wyckoff-blink-low',
        side: 'low',
        time: lowEvent ? read.eventTime : lastT,
        price: read.support,
        label: lowEvent ? blinkLabel : '지지',
        primary: lowEvent,
      },
      {
        id: 'merged-desk-wyckoff-blink-high',
        side: 'high',
        time: lowEvent ? lastT : read.eventTime,
        price: read.resist,
        label: lowEvent ? '저항' : blinkLabel,
        primary: !lowEvent,
      },
    ])
  );

  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: read.resist,
      color: lineResist,
      title: acc ? 'WK저항' : 'WK분배상',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    },
    {
      price: read.support,
      color: lineSupport,
      title: acc ? 'WK지지' : 'WK분배하',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    },
  ];

  return { read, overlays, priceLines };
}
