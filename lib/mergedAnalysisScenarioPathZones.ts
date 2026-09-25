/**
 * 통합·분석 — 하락/상승 → 터치 zone → 반등·되돌림 목표 zone (신호·크기 라벨).
 * 기존 ZONE 색상 유지 — 조건부 참고, 확정 수익·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import {
  mergedDeskAnalysisZoneTimes,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
} from '@/lib/mergedAnalysisOverlayTimes';
import { MERGED_DESK_SHARED_ANALYZE_TF } from '@/lib/mergedDesk4hReferenceAnalysis';

export type MergedScenarioMagnitude = {
  declinePct: number;
  declineKo: string;
  bounceLegPct: number;
  bounceSizeKo: string;
  progressKo: string;
  nextTargetKo: string;
  headlineKo: string;
};

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(0);
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function bandHalfHeight(price: number, atr: number, tf: string): number {
  const t = normalizeChartTimeframe(tf);
  const pct = t === '1d' || t === '1w' ? 0.004 : 0.0025;
  return Math.max(atr * 0.22, Math.abs(price) * pct);
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

/** 하락·반등 크기·진행 — 조건부 참고 */
export function classifyMergedScenarioMagnitude(
  sc: MergedBounceScenario,
  atr: number
): MergedScenarioMagnitude {
  const up = sc.direction === 'up';
  const legSpan = Math.max(Math.abs(sc.legHigh - sc.legLow), 1e-9);
  const declinePct = up
    ? ((sc.legHigh - sc.legLow) / Math.max(sc.legHigh, 1e-9)) * 100
    : ((sc.legHigh - sc.legLow) / Math.max(sc.legHigh, 1e-9)) * 100;

  const declineKo =
    declinePct >= 8
      ? `하락 큼 ${declinePct.toFixed(1)}%`
      : declinePct >= 4
        ? `하락 ${declinePct.toFixed(1)}%`
        : `조정 ${declinePct.toFixed(1)}%`;

  const tmax = sc.targets.find((t) => t.label === 'Tmax') ?? sc.targets[sc.targets.length - 1];
  const bounceLegPct = tmax
    ? up
      ? ((tmax.price - sc.legLow) / Math.max(sc.legLow, 1e-9)) * 100
      : ((sc.legHigh - tmax.price) / Math.max(sc.legHigh, 1e-9)) * 100
    : 0;

  const atrMult = tmax ? Math.abs(tmax.price - sc.anchorPrice) / Math.max(atr, 1e-9) : 0;
  let bounceSizeKo: string;
  if (bounceLegPct >= 7 || atrMult >= 4.5) bounceSizeKo = up ? '반등 여력 큼' : '되돌림 깊음';
  else if (bounceLegPct >= 3.5 || atrMult >= 2.2) bounceSizeKo = up ? '반등 보통' : '되돌림 보통';
  else bounceSizeKo = up ? '반등 약·얕음' : '되돌림 약';

  const next = sc.targets.find((t) => !t.hit) ?? sc.targets[sc.targets.length - 1]!;
  const remainPct = up
    ? ((next.price - sc.currentPrice) / Math.max(sc.currentPrice, 1e-9)) * 100
    : ((sc.currentPrice - next.price) / Math.max(sc.currentPrice, 1e-9)) * 100;

  const progressKo = `${up ? '반등' : '하락'} 진행 ${Math.round(sc.progressPct)}%`;
  const nextTargetKo = `다음 ${next.label} ${fmtPx(next.price)}${next.hit ? '✓' : ` · ${Math.max(0, remainPct).toFixed(1)}%`}`;

  const headlineKo = up
    ? `${declineKo} → 지지터치 → ${bounceSizeKo} · ${progressKo}`
    : `${declineKo} → 저항터치 → ${bounceSizeKo} · ${progressKo}`;

  return {
    declinePct,
    declineKo,
    bounceLegPct,
    bounceSizeKo,
    progressKo,
    nextTargetKo,
    headlineKo,
  };
}

/** 하락/상승 leg · 터치 · 목표 — ZONE 박스 (색상 = 기존 demand/supply·critical 톤) */
export function buildMergedScenarioPathZones(
  candles: Candle[],
  scenarios: MergedBounceScenario[],
  timeframe?: string
): OverlayItem[] {
  if (!scenarios.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const work = mergedWorkCandles(candles, tf);
  const atr = estimateAtr(work, work.length - 1);
  const out: OverlayItem[] = [];

  const active = scenarios.filter((s) => s.active).slice(0, 1);
  for (const sc of active) {
    const { t1, t2 } = mergedDeskAnalysisZoneTimes(work, tf, {
      anchorTime: sc.anchorTime,
      legHigh: sc.legHigh,
      legLow: sc.legLow,
      direction: sc.direction,
    });
    const up = sc.direction === 'up';
    const mag = classifyMergedScenarioMagnitude(sc, atr);
    const anchorHalf = bandHalfHeight(sc.anchorPrice, atr, tf);

    /** ① 하락/상승 leg 구간 — 같은 보라(하락)·주황(되돌림) 톤, 옅게 */
    const legTop = up ? sc.legHigh : sc.legHigh;
    const legBot = up ? sc.legLow : sc.legLow;
    out.push({
      id: `${sc.id}-scenario-decline-leg`,
      kind: up ? 'demandZone' : 'supplyZone',
      label: up ? `① ${mag.declineKo}` : `① ${mag.declineKo}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: legTop,
      price2: legBot,
      confidence: 58,
      color: up ? 'rgba(167,139,250,0.12)' : 'rgba(251,191,36,0.1)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-scenario-leg',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        up ? 'merged-ares-critical-decline' : 'merged-ares-critical-rally',
      ].join(' '),
      labelTooltip: `${mag.declineKo} · ${fmtPx(legBot)}~${fmtPx(legTop)} · 조건부 참고`,
      labelBackgroundColor: up ? 'rgba(76,29,149,0.88)' : 'rgba(120,53,15,0.88)',
      labelTextColor: '#fafafa',
    });

    /** ② 지지/저항 터치 zone — 기존 핵심 demand/supply 색 */
    out.push({
      id: `${sc.id}-scenario-touch`,
      kind: up ? 'demandZone' : 'supplyZone',
      label: up ? `② 지지터치 ${fmtPx(sc.anchorPrice)}` : `② 저항터치 ${fmtPx(sc.anchorPrice)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: Math.max(sc.anchorTop, sc.anchorBot) + anchorHalf * 0.15,
      price2: Math.min(sc.anchorTop, sc.anchorBot) - anchorHalf * 0.15,
      confidence: 78,
      color: up ? 'rgba(34,211,238,0.22)' : 'rgba(251,146,60,0.2)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-scenario-touch',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        up ? 'merged-ares-key-demand' : 'merged-ares-key-supply',
      ].join(' '),
      labelTooltip: `${sc.labelKo} · ${mag.bounceSizeKo} · ${sc.statusKo}`,
      labelBackgroundColor: up ? 'rgba(8,78,99,0.92)' : 'rgba(124,45,18,0.9)',
      labelTextColor: '#f8fafc',
    });

    /** ③ 반등/되돌림 경로 band — 기존 bounce-path 색, 진행·크기 라벨 */
    out.push({
      id: `${sc.id}-scenario-path`,
      kind: up ? 'demandZone' : 'supplyZone',
      label: `③ ${mag.bounceSizeKo} · ${mag.progressKo}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: up ? sc.legHigh : sc.anchorTop,
      price2: up ? sc.anchorBot : sc.legLow,
      confidence: 72,
      color: up ? 'rgba(45,212,191,0.1)' : 'rgba(251,146,60,0.08)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-bounce-path',
        'merged-ares-scenario-path',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        up ? 'merged-ares-bounce-path--up' : 'merged-ares-bounce-path--down',
      ].join(' '),
      labelTooltip: `${mag.headlineKo} · ${mag.nextTargetKo}`,
      labelBackgroundColor: up ? 'rgba(6,78,59,0.9)' : 'rgba(127,29,29,0.88)',
      labelTextColor: '#ecfdf5',
    });

    /** ④ 다음 목표 · Tmax(크다/약) — 얇은 target zone */
    const next = sc.targets.find((t) => !t.hit) ?? sc.targets[sc.targets.length - 1]!;
    const tmax = sc.targets.find((t) => t.label === 'Tmax') ?? next;
    const targetHalf = bandHalfHeight(tmax.price, atr, tf) * 0.85;
    const targetLabel = tmax.hit
      ? `④ ${tmax.label} 적중 ${fmtPx(tmax.price)}`
      : `④ ${mag.bounceSizeKo} → ${tmax.label} ${fmtPx(tmax.price)}`;

    out.push({
      id: `${sc.id}-scenario-target-${tmax.label.toLowerCase()}`,
      kind: up ? 'demandZone' : 'supplyZone',
      label: targetLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: tmax.price + targetHalf,
      price2: tmax.price - targetHalf,
      confidence: tmax.hit ? 82 : 76,
      color: up
        ? tmax.hit
          ? 'rgba(34,211,238,0.28)'
          : 'rgba(45,212,191,0.18)'
        : tmax.hit
          ? 'rgba(251,146,60,0.26)'
          : 'rgba(251,146,60,0.16)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-scenario-target',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        up ? 'merged-ares-key-demand' : 'merged-ares-key-supply',
        tmax.hit ? 'merged-ares-scenario-target--hit' : '',
      ]
        .filter(Boolean)
        .join(' '),
      labelTooltip: `${tmax.sourceKo} · ${mag.nextTargetKo} · 무효는 ${up ? '지지' : '저항'} 이탈`,
      labelBackgroundColor: up ? 'rgba(8,78,99,0.94)' : 'rgba(120,53,15,0.9)',
      labelTextColor: '#f0fdfa',
    });

    /** ⑤ T1 근처 — 다음 단계 (hit 아니면) */
    const t1Target = sc.targets.find((t) => t.label === 'T1');
    if (t1Target && t1Target.id !== tmax.id && !t1Target.hit) {
      const h = targetHalf * 0.7;
      out.push({
        id: `${sc.id}-scenario-target-t1`,
        kind: up ? 'demandZone' : 'supplyZone',
        label: `T1 ${fmtPx(t1Target.price)}`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: t2,
        price1: t1Target.price + h,
        price2: t1Target.price - h,
        confidence: 68,
        color: up ? 'rgba(34,211,238,0.14)' : 'rgba(251,191,36,0.12)',
        category: 'scenario',
        zoneFillPreserve: true,
        overlayZoneExtraClass: [
          'merged-ares-zone',
          'merged-ares-scenario-target',
          'merged-ares-scenario-target--t1',
          MERGED_ARES_ZONE_CAPTION_CLASS,
          up ? 'merged-ares-key-demand' : 'merged-ares-key-supply',
        ].join(' '),
        labelTooltip: `${t1Target.sourceKo} · 1차 목표 · ${mag.progressKo}`,
        labelBackgroundColor: up ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.85)',
        labelTextColor: '#cbd5e1',
      });
    }
  }

  return out;
}

export function summarizeMergedScenarioPathKo(scenarios: MergedBounceScenario[], candles: Candle[]): string {
  const sc = scenarios.find((s) => s.active) ?? scenarios[0];
  if (!sc || !candles.length) return '시나리오 zone — 하락·터치·반등 대기';
  const work = mergedWorkCandles(candles, MERGED_DESK_SHARED_ANALYZE_TF);
  const atr = estimateAtr(work, work.length - 1);
  const mag = classifyMergedScenarioMagnitude(sc, atr);
  return mag.headlineKo;
}
