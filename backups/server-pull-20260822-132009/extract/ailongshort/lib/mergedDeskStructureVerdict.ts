/**
 * 통합·분석 — 구조 판정: 반등 / 하락확정 / 상승확정 / 되돌림 / 관망.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { computeCandleTrendChannelGeom } from '@/lib/mergedDeskCandleTrendline';

export type MergedDeskStructureVerdict =
  | 'BOUNCE'
  | 'DECLINE_CONFIRMED'
  | 'RISE_CONFIRMED'
  | 'PULLBACK'
  | 'WAIT';

export type MergedDeskStructureVerdictPack = {
  verdict: MergedDeskStructureVerdict;
  labelKo: string;
  summaryKo: string;
  detailKo: string;
  confidence: number;
  overlays: OverlayItem[];
};

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
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

export function buildMergedDeskStructureVerdictPack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones: MergedKeyZone[];
  bounceScenarios: MergedBounceScenario[];
  smcLeading: MergedSmcLeadingContext;
  judgment?: MergedTradeJudgment | null;
  supportPrice?: number | null;
}): MergedDeskStructureVerdictPack {
  const work = mergedWorkCandles(params.candles, params.timeframe);
  if (work.length < 16) {
    return {
      verdict: 'WAIT',
      labelKo: '관망',
      summaryKo: '구조 판정 — 봉 수 부족',
      detailKo: '',
      confidence: 0,
      overlays: [],
    };
  }

  const last = work[work.length - 1]!;
  const close = last.close;
  const atr = estimateAtr(work, work.length - 1);
  const channel = computeCandleTrendChannelGeom(params.candles, params.timeframe);
  const lower = channel?.lowerEnd.price ?? null;
  const upper = channel?.upperEnd.price ?? null;

  const demand = params.keyZones
    .filter((z) => z.kind === 'demand')
    .sort((a, b) => Math.abs(close - a.price) - Math.abs(close - b.price));
  const supply = params.keyZones
    .filter((z) => z.kind === 'supply')
    .sort((a, b) => Math.abs(close - a.price) - Math.abs(close - b.price));
  const nearSupport = demand[0] ?? null;
  const nearResist = supply[0] ?? null;

  const bounceUp = params.bounceScenarios.find((s) => s.active && s.direction === 'up');
  const bounceDown = params.bounceScenarios.find((s) => s.active && s.direction === 'down');
  const smc = params.smcLeading;
  const choch = smc.lastChoch;
  const judgment = params.judgment;

  const supportPx = params.supportPrice ?? nearSupport?.price ?? lower;
  const atSupport =
    supportPx != null && Math.abs(close - supportPx) <= atr * 1.1 && close >= supportPx - atr * 0.35;
  const belowSupport = supportPx != null && close < supportPx - atr * 0.15;
  const atResist =
    nearResist != null && Math.abs(close - nearResist.price) <= atr * 1.0 && close <= nearResist.price + atr * 0.35;
  const brokeDownChannel = lower != null && close < lower - atr * 0.12;
  const brokeUpChannel = upper != null && close > upper + atr * 0.12;

  let verdict: MergedDeskStructureVerdict = 'WAIT';
  let confidence = 42;
  const reasons: string[] = [];

  if (choch?.phase === 'failed' || judgment?.direction === 'SHORT') {
    if (belowSupport || brokeDownChannel) {
      verdict = 'DECLINE_CONFIRMED';
      confidence = 72;
      reasons.push('지지 이탈·구조 약화');
    }
  }

  if (verdict === 'WAIT' && (choch?.phase === 'failed' || smc.legDirection === 'down')) {
    if (brokeDownChannel || judgment?.direction === 'SHORT') {
      verdict = 'DECLINE_CONFIRMED';
      confidence = 68;
      reasons.push('하락 구조·CHoCH 무효');
    }
  }

  if (verdict === 'WAIT' && bounceDown?.active && atResist) {
    verdict = 'PULLBACK';
    confidence = 64;
    reasons.push('저항 터치·되돌림 시나리오');
  }

  if (
    verdict === 'WAIT' &&
    (bounceUp?.active || smc.legDirection === 'up' || choch?.bias === 'bullish') &&
    atSupport
  ) {
    verdict = 'BOUNCE';
    confidence = 66;
    reasons.push('지지 반응·반등 시나리오');
  }

  if (
    verdict === 'WAIT' &&
    brokeUpChannel &&
    (smc.legDirection === 'up' || choch?.bias === 'bullish' || judgment?.direction === 'LONG')
  ) {
    verdict = 'RISE_CONFIRMED';
    confidence = 70;
    reasons.push('채널 상단 돌파·상승 구조');
  }

  if (verdict === 'WAIT' && atSupport && last.close > last.open) {
    verdict = 'BOUNCE';
    confidence = 58;
    reasons.push('지지권 양봉 반등 시도');
  }

  if (verdict === 'WAIT' && belowSupport) {
    verdict = 'DECLINE_CONFIRMED';
    confidence = 55;
    reasons.push('지지 하향 이탈');
  }

  const labelMap: Record<MergedDeskStructureVerdict, string> = {
    BOUNCE: '▲ 반등',
    DECLINE_CONFIRMED: '▼ 하락확정',
    RISE_CONFIRMED: '▲ 상승확정',
    PULLBACK: '▼ 되돌림',
    WAIT: '◆ 관망',
  };

  const colorMap: Record<MergedDeskStructureVerdict, string> = {
    BOUNCE: '#2dd4bf',
    DECLINE_CONFIRMED: '#f87171',
    RISE_CONFIRMED: '#4ade80',
    PULLBACK: '#fb923c',
    WAIT: '#94a3b8',
  };

  const nextTarget =
    verdict === 'BOUNCE' || verdict === 'RISE_CONFIRMED'
      ? bounceUp?.targets.find((t) => t.price > close)
      : verdict === 'PULLBACK' || verdict === 'DECLINE_CONFIRMED'
        ? bounceDown?.targets.find((t) => t.price < close)
        : null;

  const summaryKo = `${labelMap[verdict]}${supportPx != null ? ` · 지지 ${fmtPx(supportPx)}` : ''}${
    nextTarget ? ` → ${nextTarget.label} ${fmtPx(nextTarget.price)}` : ''
  }`;

  const detailKo = [
    ...reasons,
    nearSupport ? `핵심지지 ${nearSupport.labelKo}` : null,
    choch?.phase === 'failed' ? 'CHoCH 무효' : null,
    judgment?.direction && judgment.direction !== 'NEUTRAL' ? `판정 ${judgment.direction}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const tBar = Number(last.time) as UTCTimestamp;
  const pinPrice = verdict === 'DECLINE_CONFIRMED' || verdict === 'PULLBACK' ? last.high : last.low;
  const overlays: OverlayItem[] = [
    {
      id: `merged-desk-verdict-pin-${verdict.toLowerCase()}`,
      kind: 'label',
      label: labelMap[verdict],
      x1: 0.5,
      y1: 0.5,
      time1: tBar,
      price1: pinPrice,
      confidence: confidence,
      color: colorMap[verdict],
      labelBackgroundColor:
        verdict === 'DECLINE_CONFIRMED'
          ? 'rgba(127,29,29,0.94)'
          : verdict === 'BOUNCE' || verdict === 'RISE_CONFIRMED'
            ? 'rgba(6,78,59,0.94)'
            : 'rgba(30,41,59,0.94)',
      labelTextColor: '#f8fafc',
      category: 'labels',
      overlayZoneExtraClass: 'merged-desk-structure-verdict',
      labelTooltip: `${summaryKo} · ${detailKo} (조건부 참고)`,
    },
  ];

  return {
    verdict,
    labelKo: labelMap[verdict],
    summaryKo,
    detailKo,
    confidence,
    overlays,
  };
}

export function summarizeMergedDeskStructureVerdictKo(pack: MergedDeskStructureVerdictPack | null | undefined): string {
  if (!pack) return '구조 판정 — 데이터 대기';
  return pack.summaryKo;
}
