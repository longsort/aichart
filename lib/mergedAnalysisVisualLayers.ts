/**
 * 통합·분석 — 차트 전용 시각 레이어 (zone·라인, 글자 배너 없음).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import { MERGED_ARES_ZONE_CAPTION_CLASS, mergedAnalysisChartZoneTimesSnapped, mergedDeskLastCandleZoneTimes, mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { monthDeskTailLabelAnchorTime } from '@/lib/monthDeskChartTailSpacing';
import { normalizeChartTimeframe } from '@/lib/constants';

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function chartSpan(candles: Candle[], timeframe: string): { t1: number; t2: number } {
  const { t1, t2 } = mergedDeskLastCandleZoneTimes(candles, timeframe);
  return { t1: Number(t1), t2: Number(t2) };
}

function bandHalf(price: number, atr: number): number {
  return Math.max(atr * 0.35, Math.abs(price) * 0.0015, 1e-9);
}

function estimateAtr(candles: Candle[]): number {
  const tail = candles.slice(-20);
  if (tail.length < 2) return Math.abs(tail[0]?.close ?? 1) * 0.01;
  let sum = 0;
  for (const c of tail) sum += Math.max(c.high - c.low, Math.abs(c.close) * 0.002);
  return sum / tail.length;
}

/** 마감·안착 레벨 — 가로 zone (텍스트 없음) */
export function buildMergedSettleZoneOverlay(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[],
  timeframe?: string
): OverlayItem | null {
  const sz = analysis?.settlementZone;
  if (!sz?.level || !Number.isFinite(sz.level) || sz.state === 'none' || candles.length < 4) return null;
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const { t1, t2 } = chartSpan(candles, tf);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  const atr = estimateAtr(candles);
  const half = bandHalf(sz.level, atr);
  const isLong = sz.direction === 'LONG';
  const confirmed = sz.state === 'confirmed';
  const failed = sz.state === 'failed';
  const settleLabel =
    confirmed ? (isLong ? '▲ 안착·롱' : '▼ 안착·숏') : failed ? '안착실패' : '마감·안착';
  return {
    id: 'merged-ares-settle-zone',
    kind: isLong ? 'demandZone' : 'supplyZone',
    label: settleLabel,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: sz.level + half,
    price2: sz.level - half,
    confidence: confirmed ? 95 : failed ? 40 : 72,
    color: confirmed
      ? isLong
        ? 'rgba(34,197,94,0.28)'
        : 'rgba(239,68,68,0.26)'
      : failed
        ? 'rgba(100,116,139,0.2)'
        : 'rgba(250,204,21,0.18)',
    category: 'scenario',
    zoneFillPreserve: true,
    zonePulse: confirmed,
    overlayZoneExtraClass: [
      'merged-ares-settle-zone',
      'merged-ares-zone',
      MERGED_ARES_ZONE_CAPTION_CLASS,
      confirmed ? 'merged-ares-settle-confirmed' : failed ? 'merged-ares-settle-failed' : 'merged-ares-settle-candidate',
    ].join(' '),
  };
}

/** 롱/숏 확정 — 짧은 가격대 zone (마커·글자 대신) */
export function buildMergedConfirmZoneOverlays(
  confirms: MergedDirectionConfirm[],
  candles: Candle[],
  timeframe?: string
): OverlayItem[] {
  const byTime = new Map<number, Candle>();
  for (const c of candles) byTime.set(Number(c.time), c);
  const atr = estimateAtr(candles);
  const out: OverlayItem[] = [];

  const confirmed = confirms.filter((x) => x.tier === 'confirmed');
  const maxZones = 2;
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const work = mergedWorkCandles(candles, tf);
  const { t1: zoneT1, t2: zoneT2 } = mergedAnalysisChartZoneTimesSnapped(work, tf);
  let pick = confirmed;
  if (confirmed.length > maxZones) {
    const asc = [...confirmed].sort((a, b) => a.time - b.time);
    const step = Math.ceil(asc.length / maxZones);
    pick = [];
    for (let i = 0; i < asc.length; i += step) pick.push(asc[i]!);
    const last = asc[asc.length - 1]!;
    if (!pick.some((e) => e.time === last.time)) pick.push(last);
  }

  for (const c of pick) {
    const bar = byTime.get(c.time);
    if (!bar) continue;
    const long = c.direction === 'LONG';
    const mid = long ? (bar.low + bar.close) / 2 : (bar.high + bar.close) / 2;
    const half = bandHalf(mid, atr) * 1.2;

    out.push({
      id: `${c.id}-zone`,
      kind: long ? 'demandZone' : 'supplyZone',
      label: long ? '▲ 롱확정' : '▼ 숏확정',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: zoneT1,
      time2: zoneT2,
      price1: mid + half,
      price2: mid - half,
      confidence: 90,
      color: long ? 'rgba(34,197,94,0.42)' : 'rgba(239,68,68,0.38)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-confirm-zone',
        'merged-ares-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        long ? 'merged-ares-confirm-zone-long' : 'merged-ares-confirm-zone-short',
      ].join(' '),
    });
  }
  return out;
}

/** 방향 편향 — E↔TP1 수익 구간 강조 (이미 position box 보완) */
export function buildMergedBiasTradeBand(
  leg: MonthDeskStrikeLeg | null,
  candles: Candle[],
  direction: 'LONG' | 'SHORT' | 'NEUTRAL',
  timeframe?: string
): OverlayItem | null {
  if (!leg || direction === 'NEUTRAL' || candles.length < 4) return null;
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const { t1, t2 } = chartSpan(candles, tf);
  const isLong = direction === 'LONG' && leg.side === 'LONG';
  const isShort = direction === 'SHORT' && leg.side === 'SHORT';
  if (!isLong && !isShort) return null;

  const top = isLong ? leg.tp1 : leg.entry;
  const bot = isLong ? leg.entry : leg.tp1;
  if (!(top > bot)) return null;

  return {
    id: 'merged-ares-bias-trade-band',
    kind: isLong ? 'demandZone' : 'supplyZone',
    label: isLong ? '롱 편향·E→TP1' : '숏 편향·E→TP1',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: top,
    price2: bot,
    confidence: 94,
    color: isLong ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)',
    category: 'scenario',
    zoneFillPreserve: true,
    overlayZoneExtraClass: [
      'merged-ares-bias-band',
      'merged-ares-zone',
      MERGED_ARES_ZONE_CAPTION_CLASS,
    ].join(' '),
  };
}

/** E/SL/TP — 마지막 봉 우측 빈 축 가로 점선 (TradingView식 레일) */
export function buildMergedTradeLevelLines(
  leg: MonthDeskStrikeLeg | null,
  candles: Candle[],
  timeframe?: string,
  overrides?: Partial<Pick<MonthDeskStrikeLeg, 'entry' | 'stopLoss' | 'tp1' | 'tp2' | 'tp3'>>
): OverlayItem[] {
  if (!leg || candles.length < 2) return [];
  const e = overrides?.entry && overrides.entry > 0 ? overrides.entry : leg.entry;
  const sl = overrides?.stopLoss && overrides.stopLoss > 0 ? overrides.stopLoss : leg.stopLoss;
  const tp1 = overrides?.tp1 && overrides.tp1 > 0 ? overrides.tp1 : leg.tp1;
  const tp2 = overrides?.tp2 && overrides.tp2 > 0 ? overrides.tp2 : leg.tp2;
  const tp3 = overrides?.tp3 && overrides.tp3 > 0 ? overrides.tp3 : leg.tp3;
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const work = mergedWorkCandles(candles, tf);
  const lastT = Number(work[work.length - 1]?.time);
  const tRail = monthDeskTailLabelAnchorTime(work, tf);
  if (!Number.isFinite(lastT)) return [];
  const mk = (id: string, label: string, price: number, color: string, dash: string): OverlayItem => ({
    id,
    kind: 'keyLevel',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: lastT as UTCTimestamp,
    time2: tRail as UTCTimestamp,
    price1: price,
    price2: price,
    confidence: 96,
    color,
    category: 'scenario',
    lineDash: dash,
    lineStrokeWidth: 2,
    noProject: true,
    overlayZoneExtraClass: 'merged-ares-level-line merged-ares-trade-rail-line',
    labelTooltip: label,
  });
  return [
    mk('merged-ares-line-e', `E ${fmtPx(e)}`, e, '#FACC15', '6 4'),
    mk('merged-ares-line-sl', `SL ${fmtPx(sl)}`, sl, '#F87171', '4 4'),
    mk('merged-ares-line-tp1', `TP1 ${fmtPx(tp1)}`, tp1, '#86EFAC', '2 6'),
    mk('merged-ares-line-tp2', `TP2 ${fmtPx(tp2)}`, tp2, '#7DD3FC', '2 6'),
    mk('merged-ares-line-tp3', `TP3 ${fmtPx(tp3)}`, tp3, '#A78BFA', '2 6'),
  ];
}

/** 핵심·하락후반등 zone — 지지/저항 가로선 (우측까지) */
export function buildMergedKeyZoneLevelLines(
  keyZones: MergedKeyZone[],
  candles: Candle[],
  timeframe?: string
): OverlayItem[] {
  if (!keyZones.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const { t1, t2 } = chartSpan(candles, tf);
  const out: OverlayItem[] = [];

  for (const z of keyZones.slice(0, 8)) {
    const demand = z.kind === 'demand';
    const recent = z.pattern === 'decline_bounce' || z.pattern === 'rally_reject';
    const core = z.price;
    const edge = demand ? z.top : z.bot;

    out.push({
      id: `${z.id}-core-line`,
      kind: 'keyLevel',
      label: `${z.labelKo} ${fmtPx(core)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: core,
      confidence: recent ? 94 : 88,
      color: demand ? '#22d3ee' : '#fb923c',
      category: 'structure',
      lineDash: recent ? '10 5' : '6 4',
      lineStrokeWidth: recent ? 2 : 1,
      overlayZoneExtraClass: recent
        ? 'merged-ares-key-reaction-line merged-ares-key-reaction-line--hot'
        : 'merged-ares-key-reaction-line',
    });

    if (recent) {
      out.push({
        id: `${z.id}-band-line`,
        kind: 'keyLevel',
        label: demand ? `지지상단 ${fmtPx(edge)}` : `저항하단 ${fmtPx(edge)}`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1 as UTCTimestamp,
        time2: t2 as UTCTimestamp,
        price1: edge,
        confidence: 82,
        color: demand ? 'rgba(34,211,238,0.55)' : 'rgba(251,146,60,0.5)',
        category: 'structure',
        lineDash: '3 8',
        lineStrokeWidth: 1,
        overlayZoneExtraClass: 'merged-ares-key-reaction-line merged-ares-key-reaction-line--edge',
      });
    }
  }

  return out;
}
