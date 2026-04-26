import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { SmartOverlayPayload } from '@/types/smartOverlay';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import { buildCandleAnalysisMemoryPathOverlays, type CandleAnalysisPathTuning } from '@/lib/candleAnalysisMemoryPath';

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function midRange(pair: [number, number] | null | undefined): number | null {
  if (!pair || pair.length !== 2) return null;
  const [a, b] = pair;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (Math.min(a, b) + Math.max(a, b)) / 2;
}

function parseTp1(analysis: AnalyzeResponse, isLong: boolean): number | null {
  const targets: number[] = [];
  for (const t of analysis.targets ?? []) {
    const n = num(t);
    if (n != null) targets.push(n);
  }
  for (const t of analysis.nextTargets ?? []) {
    const n = num(t);
    if (n != null) targets.push(n);
  }
  const u = [...new Set(targets.map((x) => Math.round(x * 1e8) / 1e8))].sort((a, b) => a - b);
  if (!u.length) return null;
  return isLong ? u[u.length - 1] : u[0];
}

function isLongBias(analysis: AnalyzeResponse, smart: SmartOverlayPayload | null, px: number): boolean {
  if (smart) return (Number(smart.prob_long) || 0) >= (Number(smart.prob_short) || 0);
  if (analysis.verdict === 'SHORT') return false;
  if (analysis.verdict === 'LONG') return true;
  const ls = analysis.longScore ?? 0;
  const ss = analysis.shortScore ?? 0;
  if (ls !== ss) return ls > ss;
  const e = num(analysis.entry);
  if (e != null && px > 0) return px >= e * 0.998;
  return true;
}

/**
 * 핵심 가로선: 돌파·무효·진입·목표(스마트 우선, 없으면 analysis 필드).
 */
export function buildCandleAnalysisCoreKeyOverlays(
  analysis: AnalyzeResponse,
  candles: Candle[],
  smart: SmartOverlayPayload | null,
  timeframe: string
): OverlayItem[] {
  if (candles.length < 3) return [];
  const last = candles[candles.length - 1];
  const tA = candles[0].time as number;
  const tB = last.time as number;
  const px = analysis.currentPrice ?? last.close;
  const out: OverlayItem[] = [];
  const pushH = (id: string, label: string, price: number, color: string, line: string, w = 1.55) => {
    if (!Number.isFinite(price) || !(price > 0)) return;
    out.push({
      id,
      kind: 'keyLevel',
      label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tA,
      time2: tB,
      price1: price,
      price2: price,
      confidence: 86,
      color,
      lineLabelColor: line,
      lineStrokeWidth: w,
      category: 'labels',
    });
  };

  const br = smart?.breakout_level ?? num(analysis.breakoutLevel?.price);
  const inv = smart?.invalid ?? num(analysis.invalidationLevel?.price);
  const en = smart?.entry_1 ?? num(analysis.entry);
  const tp = smart?.tp1 ?? parseTp1(analysis, isLongBias(analysis, smart, px));

  if (br != null) pushH('candle-analysis-exec-key-breakout', '핵심 돌파', br, 'rgba(147,197,253,0.55)', '#93c5fd', 1.75);
  if (inv != null) pushH('candle-analysis-exec-key-invalid', '핵심 무효(이탈)', inv, 'rgba(248,113,113,0.5)', '#f87171', 1.45);
  if (en != null) pushH('candle-analysis-exec-key-entry', '진입 참고', en, 'rgba(250,204,21,0.55)', '#facc15', 1.5);
  if (tp != null) pushH('candle-analysis-exec-key-tp1', '목표 1(참고)', tp, 'rgba(52,211,153,0.5)', '#4ade80', 1.45);

  const sz = midRange(smart?.support_zone ?? undefined);
  const rz = midRange(smart?.resist_zone ?? undefined);
  if (sz != null) pushH('candle-analysis-exec-key-support-mid', '핵심 지지(맥락)', sz, 'rgba(34,197,94,0.45)', '#4ade80', 1.35);
  if (rz != null) pushH('candle-analysis-exec-key-resist-mid', '핵심 저항(맥락)', rz, 'rgba(239,68,68,0.45)', '#fb7185', 1.35);

  return out;
}

/**
 * 이론 경로: 종가 → (롱) 지지 쪽 짧은 되돌림 → 돌파/진입 방향 → 목표 근처.
 * 과거 패턴 DB가 아니라 엔진 가격·스마트 맥락을 쓴 휴리스틱(교육용).
 */
export function buildCandleAnalysisTheoryPathOverlays(
  analysis: AnalyzeResponse,
  candles: Candle[],
  smart: SmartOverlayPayload | null,
  timeframe: string,
  theorySteepen = 1.1
): OverlayItem[] {
  if (candles.length < 8) return [];
  const last = candles[candles.length - 1];
  const tNow = Number(last.time);
  const tf = timeframe ?? analysis.timeframe ?? '1h';
  const barSec = candleBarDurationSec(tf, tNow);
  const step = Math.max(3, Math.min(12, Math.round(5 * Math.sqrt(3600 / Math.max(60, barSec)))));
  const px = last.close;
  const isLong = isLongBias(analysis, smart, px);

  const br = smart?.breakout_level ?? num(analysis.breakoutLevel?.price);
  const en = smart?.entry_1 ?? num(analysis.entry);
  const tp = smart?.tp1 ?? parseTp1(analysis, isLong);

  const pathCol = 'rgba(196,181,253,0.78)';
  const dash = '5 5';
  const out: OverlayItem[] = [];
  let seg = 0;
  const pushSeg = (t1: number, p1: number, t2: number, p2: number, label: string) => {
    if (![t1, t2, p1, p2].every(Number.isFinite)) return;
    if (Math.abs(p2 - p1) < px * 1e-6 && Math.abs(t2 - t1) < 1) return;
    out.push({
      id: `candle-analysis-exec-theory-${seg++}`,
      kind: 'trendLine',
      label,
      x1: 0,
      y1: 0,
      time1: t1,
      price1: p1,
      time2: t2,
      price2: p2,
      confidence: 42,
      color: pathCol,
      lineDash: dash,
      lineStrokeWidth: 1.45,
      category: 'labels',
      noProject: true,
    });
  };

  const t1 = tNow + Math.floor(step * 0.55) * barSec;
  const t2 = tNow + Math.floor(step * 1.35) * barSec;
  const t3full = tNow + Math.floor(step * 2.45) * barSec;
  const st = Math.max(0.85, Math.min(1.42, theorySteepen));
  /** 목표 점선이 일봉 등에서 수평처럼 보이지 않게, 마지막 구간 시간폭만 압축(같은 Δ가격·짧은 Δt → 가파른 대각선) */
  const rawLastDt = Math.max(0, t3full - t2);
  const t3 =
    t2 +
    Math.max(
      Math.floor(step * 0.42) * barSec,
      Math.floor(rawLastDt * 0.33)
    );

  if (isLong) {
    const supMid = midRange(smart?.support_zone ?? undefined);
    const dip =
      supMid != null && supMid < px
        ? supMid
        : Math.min(px * (1 - 0.0035), px - (last.high - last.low) * 0.15);
    pushSeg(tNow, px, t1, dip, '이론·되돌림(지지)');
    const p2 = br ?? en ?? px * 1.004;
    pushSeg(t1, dip, t2, p2, '이론·돌파·진입');
    const rangeUp = Math.max(px * 0.012, (last.high - last.low) * 0.42);
    let p3 = tp != null && tp > p2 ? tp : p2 * 1.028;
    p3 = Math.max(p3, p2 + rangeUp);
    p3 = p2 + (p3 - p2) * st;
    if (Math.abs(p3 - p2) > px * 2e-5) pushSeg(t2, p2, t3, p3, '이론·목표(참고)');
  } else {
    const resMid = midRange(smart?.resist_zone ?? undefined);
    const bounce =
      resMid != null && resMid > px
        ? resMid
        : Math.max(px * (1 + 0.0035), px + (last.high - last.low) * 0.15);
    pushSeg(tNow, px, t1, bounce, '이론·반등(저항)');
    const p2 = br ?? en ?? px * 0.996;
    pushSeg(t1, bounce, t2, p2, '이론·이탈·진입');
    const rangeDn = Math.max(px * 0.012, (last.high - last.low) * 0.42);
    let p3 = tp != null && tp < p2 ? tp : p2 * 0.972;
    p3 = Math.min(p3, p2 - rangeDn);
    p3 = p2 + (p3 - p2) * st;
    if (Math.abs(p3 - p2) > px * 2e-5) pushSeg(t2, p2, t3, p3, '이론·목표(참고)');
  }

  return out.slice(0, 5);
}

/**
 * 현재가 → 목표(또는 저항/지지 맥락) **한 줄** 직진 점선. 3단 이론 경로와 별도(교육용).
 */
export function buildCandleAnalysisDirectTheoryPathOverlays(
  analysis: AnalyzeResponse,
  candles: Candle[],
  smart: SmartOverlayPayload | null,
  timeframe: string,
  theorySteepen = 1.12
): OverlayItem[] {
  if (candles.length < 3) return [];
  const last = candles[candles.length - 1];
  const tNow = Number(last.time);
  const tf = timeframe ?? analysis.timeframe ?? '1h';
  const barSec = candleBarDurationSec(tf, tNow);
  const step = Math.max(3, Math.min(12, Math.round(5 * Math.sqrt(3600 / Math.max(60, barSec)))));
  const px = last.close;
  if (!(px > 0)) return [];
  const isLong = isLongBias(analysis, smart, px);
  const tp = smart?.tp1 ?? parseTp1(analysis, isLong);
  const rz = midRange(smart?.resist_zone ?? undefined);
  const sz = midRange(smart?.support_zone ?? undefined);
  const st = Math.max(0.85, Math.min(1.42, theorySteepen));
  const rng = Math.max(px * 0.014, (last.high - last.low) * 0.45);
  const dtBars = Math.max(Math.floor(step * 0.88), 2);
  const tEnd = tNow + dtBars * barSec;

  let pT: number;
  if (isLong) {
    pT = tp != null && tp > px ? tp : px * 1.032;
    if (rz != null && rz > px) pT = Math.max(pT, Math.min(rz, px * 1.14));
    pT = Math.max(pT, px + rng);
    pT = px + (pT - px) * st;
  } else {
    pT = tp != null && tp < px ? tp : px * 0.968;
    if (sz != null && sz < px) pT = Math.min(pT, Math.max(sz, px * 0.86));
    pT = Math.min(pT, px - rng);
    pT = px + (pT - px) * st;
  }

  if (![tNow, tEnd, px, pT].every(Number.isFinite) || Math.abs(pT - px) < px * 3e-6) return [];

  return [
    {
      id: 'candle-analysis-exec-theory-direct',
      kind: 'trendLine',
      label: '이론·직진목표(참고)',
      x1: 0,
      y1: 0,
      time1: tNow,
      price1: px,
      time2: tEnd,
      price2: pT,
      confidence: 40,
      color: 'rgba(233,213,255,0.9)',
      lineDash: '7 4',
      lineStrokeWidth: 1.58,
      category: 'labels',
      noProject: true,
    },
  ];
}

/** 구조·종가 확정 배지(스마트 확인만) */
export function buildCandleAnalysisConfirmationPin(
  candles: Candle[],
  smart: SmartOverlayPayload | null
): OverlayItem[] {
  if (!candles.length || !smart?.confirmation) return [];
  const h = smart.confirmation.headline;
  if (h !== 'BULL_CONFIRM' && h !== 'BEAR_CONFIRM') return [];
  const last = candles[candles.length - 1];
  const isBull = h === 'BULL_CONFIRM';
  return [
    {
      id: 'candle-analysis-exec-confirm-pin',
      kind: 'label',
      label: isBull ? '반응·확정: 상승 축 우세(휴리스틱)' : '반응·확정: 하락 축 우세(휴리스틱)',
      x1: 0,
      y1: 0,
      time1: last.time as number,
      price1: isBull ? last.high * 1.0008 : last.low * 0.9992,
      confidence: 78,
      color: isBull ? '#4ade80' : '#f87171',
      category: 'labels',
      labelBackgroundColor: isBull ? 'rgba(21,128,61,0.42)' : 'rgba(153,27,27,0.4)',
      labelTextColor: isBull ? '#ecfccb' : '#fecaca',
    },
  ];
}

export function buildCandleAnalysisExecutiveOverlayPack(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[],
  timeframe: string,
  smart: SmartOverlayPayload | null,
  pathTuning?: CandleAnalysisPathTuning
): OverlayItem[] {
  if (!analysis || candles.length < 8) return [];
  const mem = buildCandleAnalysisMemoryPathOverlays(candles, timeframe, analysis, pathTuning);
  const th = pathTuning?.theoryPathSteepen ?? 1.12;
  const directOn = pathTuning?.directTheoryPath !== false;
  const direct = directOn ? buildCandleAnalysisDirectTheoryPathOverlays(analysis, candles, smart, timeframe, th) : [];
  return [
    ...buildCandleAnalysisCoreKeyOverlays(analysis, candles, smart, timeframe),
    ...buildCandleAnalysisTheoryPathOverlays(analysis, candles, smart, timeframe, th),
    ...direct,
    ...mem.overlays,
    ...buildCandleAnalysisConfirmationPin(candles, smart),
  ];
}
