/**
 * 통합·분석 — 롱/숏 매매 판단 합성 (마감안착·구조·유동성·청산·확정).
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';

import { lastBarTime } from '@/lib/monthDeskLastCandleFocus';

export type MergedJudgmentPillarKey =
  | 'settle'
  | 'structure'
  | 'confirm'
  | 'zone'
  | 'liquidity'
  | 'strike'
  | 'smc';
export type MergedJudgmentPillar = {
  key: MergedJudgmentPillarKey;
  labelKo: string;
  detailKo: string;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
};

export type MergedTradeJudgment = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  stanceKo: string;
  headlineKo: string;
  summaryKo: string;
  actionKo: string;
  invalidationKo: string;
  pillars: MergedJudgmentPillar[];
  /** 패널 한 줄 요약 */
  panelKo: string;
};

function settleKo(analysis: AnalyzeResponse | null | undefined): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  const sz = analysis?.settlementZone;
  if (!sz || sz.state === 'none') {
    return { text: '마감·안착 — zone 터치 후 종가 유지 대기', bias: 'NEUTRAL' };
  }
  const dir = sz.direction === 'LONG' || sz.direction === 'SHORT' ? sz.direction : 'NEUTRAL';
  if (sz.state === 'confirmed') {
    return {
      text: `마감·안착 ✓ ${sz.grade} — ${dir === 'LONG' ? '상방' : dir === 'SHORT' ? '하방' : ''} zone 종가 확정`,
      bias: dir,
    };
  }
  if (sz.state === 'failed') {
    return { text: '마감·안착 ✗ — 돌파 실패·되돌림, 방향 재확인', bias: dir === 'LONG' ? 'SHORT' : dir === 'SHORT' ? 'LONG' : 'NEUTRAL' };
  }
  return {
    text: `마감·안착 ? ${sz.grade} — ${(sz.reasons ?? []).slice(0, 1).join(' ') || '종가 유지 봉 수 확인'}`,
    bias: dir,
  };
}

function structureKo(analysis: AnalyzeResponse | null | undefined): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  const st = analysis?.structureState;
  if (!st) return { text: '구조 — HH/HL·LH/LL·BOS 데이터 대기', bias: 'NEUTRAL' };
  const parts: string[] = [];
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (st.state === 'trend_up') {
    bias = 'LONG';
    parts.push('상승 추세');
  } else if (st.state === 'trend_down') {
    bias = 'SHORT';
    parts.push('하락 추세');
  } else if (st.state === 'reversal') {
    parts.push('전환 구간');
  } else {
    parts.push('횡보');
  }
  if (st.bosUp > st.bosDown) {
    parts.push(`상방 돌파 ${st.bosUp}`);
    if (bias === 'NEUTRAL') bias = 'LONG';
  } else if (st.bosDown > st.bosUp) {
    parts.push(`하방 이탈 ${st.bosDown}`);
    if (bias === 'NEUTRAL') bias = 'SHORT';
  }
  if (st.chochUp > 0) parts.push(`CHOCH↑ ${st.chochUp}`);
  if (st.chochDown > 0) parts.push(`CHOCH↓ ${st.chochDown}`);
  if (st.premiumDiscount === 'discount') parts.push('할인 구간(지지 쪽)');
  if (st.premiumDiscount === 'premium') parts.push('프리미엄(저항 쪽)');
  return { text: `구조 — ${parts.join(' · ')}`, bias };
}

function liquidityKo(analysis: AnalyzeResponse | null | undefined): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  const m = analysis?.unifiedMarketMetrics;
  if (!m) return { text: '유동성·청산 — 시장 집계 데이터 대기', bias: 'NEUTRAL' };
  const lLong = m.liquidationLongUsd ?? 0;
  const lShort = m.liquidationShortUsd ?? 0;
  const total = lLong + lShort;
  if (total < 1) {
    return { text: '유동성·청산 — 최근 강제청산 규모 미미', bias: 'NEUTRAL' };
  }
  const longPct = Math.round((lLong / total) * 100);
  const shortPct = 100 - longPct;
  if (lLong > lShort * 1.35) {
    return {
      text: `롱청산 ${longPct}% 우세 — 급락 후 반등·숏커버 감시 (재롱은 zone 안착 확인 후)`,
      bias: 'LONG',
    };
  }
  if (lShort > lLong * 1.35) {
    return {
      text: `숏청산 ${shortPct}% 우세 — 급등 후 되돌림·롱청산 감시 (재숏은 저항 거부 확인 후)`,
      bias: 'SHORT',
    };
  }
  return {
    text: `청산 균형 — 롱 ${longPct}% / 숏 ${shortPct}% (방향 단정 어려움)`,
    bias: 'NEUTRAL',
  };
}

function confirmKo(
  analysis: AnalyzeResponse | null | undefined,
  confirms: MergedDirectionConfirm[]
): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  const cs = analysis?.confirmedSignal;
  const last = confirms.find((c) => c.tier === 'confirmed') ?? confirms[0];
  if (cs?.confirmed && cs.direction) {
    return {
      text: `확정 게이트 ${cs.gatesPassCount ?? 5}/5 — ${cs.direction === 'LONG' ? '▲ 롱확정' : '▼ 숏확정'}`,
      bias: cs.direction,
    };
  }
  if (last) {
    return {
      text: `${last.labelKo} ${last.gatesPassCount}/5 — ${last.detailKo}`,
      bias: last.direction,
    };
  }
  const zs = analysis?.zoneSignal?.zone;
  if (zs === 'long_confirm') return { text: 'zone — 롱 확인 구간 (눌림·반등 감시)', bias: 'LONG' };
  if (zs === 'short_confirm') return { text: 'zone — 숏 확인 구간 (반등·거부 감시)', bias: 'SHORT' };
  return { text: '확정 — ST·zone·종가 게이트 미충족', bias: 'NEUTRAL' };
}

function zoneKo(keyZones: MergedKeyZone[], price: number | null): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  if (!keyZones.length || price == null) {
    return { text: '핵심 zone — 스윙 지지·저항 탐지 대기', bias: 'NEUTRAL' };
  }
  let nearest: MergedKeyZone | null = null;
  let dist = Infinity;
  for (const z of keyZones) {
    const d = Math.abs(z.price - price);
    if (d < dist) {
      dist = d;
      nearest = z;
    }
  }
  if (!nearest) return { text: '핵심 zone — 근접 구간 없음', bias: 'NEUTRAL' };
  const inZone = price >= nearest.bot && price <= nearest.top;
  const bias = nearest.kind === 'demand' ? 'LONG' : 'SHORT';
  return {
    text: inZone
      ? `${nearest.labelKo} 안 — ${nearest.kind === 'demand' ? '지지·반등' : '저항·거부'} zone 내`
      : `${nearest.labelKo} 근처 — ${nearest.kind === 'demand' ? '지지 테스트' : '저항 테스트'}`,
    bias,
  };
}

function strikeKo(trade: MergedTradeSignal): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  if (trade.primary === 'NEUTRAL') {
    return { text: 'Strike — E/SL/TP 양방향 참고, 우세 방향 없음', bias: 'NEUTRAL' };
  }
  return {
    text: `Strike ${trade.primary} — E ${trade.entry.toFixed(0)} · SL ${trade.stopLoss.toFixed(0)} · TP1 ${trade.tp1.toFixed(0)}`,
    bias: trade.primary,
  };
}

function smcKo(smc: MergedSmcLeadingContext | null | undefined): { text: string; bias: 'LONG' | 'SHORT' | 'NEUTRAL' } {
  if (!smc?.active && !smc?.marks.length) {
    return { text: 'SMC — BOS/CHoCH·OB 선행 데이터 대기', bias: 'NEUTRAL' };
  }
  const choch = smc.lastChoch;
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (choch?.bias === 'bullish') bias = 'LONG';
  else if (choch?.bias === 'bearish') bias = 'SHORT';
  else if (smc.legDirection === 'up') bias = 'LONG';
  else if (smc.legDirection === 'down') bias = 'SHORT';

  const parts: string[] = [];
  if (choch) {
    parts.push(
      `${choch.tag}${choch.bias === 'bullish' ? '↑' : '↓'}${choch.developing ? '(선행)' : ''}`
    );
  }
  parts.push(`BOS×${smc.bosCountInLeg}`);
  if (smc.bounceHint) {
    parts.push(smc.bounceHint.direction === 'up' ? '반등목표' : '되돌림목표');
  }
  return {
    text: `SMC — ${parts.join(' · ') || smc.summaryKo}`,
    bias,
  };
}

function voteDirection(bias: 'LONG' | 'SHORT' | 'NEUTRAL', weight: number, scores: { long: number; short: number }) {
  if (bias === 'LONG') scores.long += weight;
  else if (bias === 'SHORT') scores.short += weight;
}

export function buildMergedTradeJudgment(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  bundle: MonthDeskStrikeDeskBundle;
  trade: MergedTradeSignal;
  keyZones: MergedKeyZone[];
  directionConfirms: MergedDirectionConfirm[];
  smcLeading?: MergedSmcLeadingContext | null;
}): MergedTradeJudgment {
  const { analysis, trade, keyZones, directionConfirms, smcLeading } = params;
  const price = analysis?.currentPrice ?? params.bundle.close ?? null;
  const tf = normalizeChartTimeframe(params.timeframe);

  const settle = settleKo(analysis);
  const structure = structureKo(analysis);
  const confirm = confirmKo(analysis, directionConfirms);
  const zone = zoneKo(keyZones, price);
  const liquidity = liquidityKo(analysis);
  const strike = strikeKo(trade);
  const smc = smcKo(smcLeading);

  const scores = { long: 0, short: 0 };
  voteDirection(settle.bias, 2.2, scores);
  voteDirection(structure.bias, 1.8, scores);
  voteDirection(confirm.bias, 2.5, scores);
  voteDirection(zone.bias, 1.5, scores);
  voteDirection(liquidity.bias, 1.2, scores);
  voteDirection(strike.bias, 2.0, scores);
  voteDirection(smc.bias, 1.6, scores);
  if (analysis?.verdict === 'LONG') scores.long += 1.5;
  if (analysis?.verdict === 'SHORT') scores.short += 1.5;

  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  const margin = 1.2;
  if (scores.long > scores.short + margin) direction = 'LONG';
  else if (scores.short > scores.long + margin) direction = 'SHORT';
  else if (trade.primary !== 'NEUTRAL') direction = trade.primary;
  else if (analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT') direction = analysis.verdict;

  const stanceKo =
    direction === 'LONG' ? '▲ 지금은 롱 관점' : direction === 'SHORT' ? '▼ 지금은 숏 관점' : '◆ 관망 · 방향 혼재';

  const headlineParts: string[] = [];
  if (settle.bias === direction && settle.bias !== 'NEUTRAL') headlineParts.push('zone 안착');
  if (structure.bias === direction && structure.bias !== 'NEUTRAL') headlineParts.push('구조 정렬');
  if (confirm.bias === direction && confirm.bias !== 'NEUTRAL') headlineParts.push('확정 게이트');
  if (smc.bias === direction && smc.bias !== 'NEUTRAL') headlineParts.push('SMC 정렬');
  if (liquidity.bias === direction && liquidity.bias !== 'NEUTRAL') headlineParts.push('청산·반등 맥락');
  const headlineKo =
    headlineParts.length > 0
      ? `${stanceKo} — ${headlineParts.join(' + ')}`
      : `${stanceKo} — 근거 분산, TF ${tf} 재확인`;

  const actionKo =
    direction === 'LONG'
      ? `매매 참고: E ${trade.entry.toFixed(0)} 근처 zone 안착·종가 유지 → TP1 ${trade.tp1.toFixed(0)}. SL ${trade.stopLoss.toFixed(0)} 이탈 시 무효.`
      : direction === 'SHORT'
        ? `매매 참고: E ${trade.entry.toFixed(0)} 근처 저항·거부·종가 하방 → TP1 ${trade.tp1.toFixed(0)}. SL ${trade.stopLoss.toFixed(0)} 이탈 시 무효.`
        : `매매 참고: 방향 확정 전 관망. zone 안착·구조 돌파·청산 소진 중 2개 이상 일치할 때만 진입 검토.`;

  const summaryKo = [settle.text, structure.text, liquidity.text].join(' · ');

  const pillars: MergedJudgmentPillar[] = [
    { key: 'settle', labelKo: '① 마감·안착', detailKo: settle.text, bias: settle.bias },
    { key: 'structure', labelKo: '② 구조·돌파', detailKo: structure.text, bias: structure.bias },
    { key: 'confirm', labelKo: '③ 롱/숏 확정', detailKo: confirm.text, bias: confirm.bias },
    { key: 'zone', labelKo: '④ 핵심 zone', detailKo: zone.text, bias: zone.bias },
    { key: 'liquidity', labelKo: '⑤ 유동성·청산', detailKo: liquidity.text, bias: liquidity.bias },
    { key: 'strike', labelKo: '⑥ Strike E/SL/TP', detailKo: strike.text, bias: strike.bias },
    { key: 'smc', labelKo: '⑦ SMC·CHoCH', detailKo: smc.text, bias: smc.bias },
  ];

  const panelKo = pillars
    .filter((p) => p.bias !== 'NEUTRAL')
    .slice(0, 3)
    .map((p) => p.detailKo)
    .join(' · ') || summaryKo;

  return {
    direction,
    stanceKo,
    headlineKo,
    summaryKo,
    actionKo,
    invalidationKo: trade.invalidationKo,
    pillars,
    panelKo,
  };
}

/** 차트 우측·현재봉 — 매매 판단 HUD 라벨 */
export function buildMergedTradeJudgmentOverlays(
  judgment: MergedTradeJudgment,
  candles: Candle[]
): OverlayItem[] {
  const lastT = lastBarTime(candles);
  if (lastT == null || !candles.length) return [];
  const last = candles[candles.length - 1]!;
  const long = judgment.direction === 'LONG';
  const short = judgment.direction === 'SHORT';
  const yPrice = long ? last.low : short ? last.high : last.close;

  const tooltip = [
    judgment.headlineKo,
    ...judgment.pillars.slice(0, 4).map((p) => `${p.labelKo} ${p.detailKo}`),
    judgment.actionKo,
    judgment.invalidationKo,
  ].join('\n');

  return [
    {
      id: 'merged-ares-judgment-hud',
      kind: 'label',
      label: judgment.stanceKo,
      x1: 1,
      y1: long ? 1 : short ? 0 : 0.5,
      x2: 1,
      y2: long ? 1 : short ? 0 : 0.5,
      time1: lastT as UTCTimestamp,
      time2: lastT as UTCTimestamp,
      price1: yPrice,
      confidence: long || short ? 88 : 50,
      color: long ? '#22c55e' : short ? '#ef4444' : '#94a3b8',
      category: 'scenario',
      labelTooltip: tooltip,
      labelBackgroundColor: long
        ? 'rgba(22,101,52,0.96)'
        : short
          ? 'rgba(127,29,29,0.94)'
          : 'rgba(30,41,59,0.92)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: [
        'merged-ares-judgment-hud',
        long ? 'merged-ares-judgment-long' : short ? 'merged-ares-judgment-short' : 'merged-ares-judgment-neutral',
      ].join(' '),
    },
    {
      id: 'merged-ares-judgment-action',
      kind: 'label',
      label:
        judgment.direction === 'LONG'
          ? '→ zone안착·E 참고'
          : judgment.direction === 'SHORT'
            ? '→ 저항거부·E 참고'
            : '→ 2개 일치 대기',
      x1: 1,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: lastT as UTCTimestamp,
      time2: lastT as UTCTimestamp,
      price1: last.close,
      confidence: 70,
      color: '#e2e8f0',
      category: 'scenario',
      labelTooltip: judgment.actionKo,
      labelBackgroundColor: 'rgba(15,23,42,0.88)',
      labelTextColor: '#cbd5e1',
      overlayZoneExtraClass: 'merged-ares-judgment-action',
    },
  ];
}

export function summarizeMergedTradeJudgmentKo(j: MergedTradeJudgment): string {
  return `${j.stanceKo} · ${j.panelKo}`;
}
