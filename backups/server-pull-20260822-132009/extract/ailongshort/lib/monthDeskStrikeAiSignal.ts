/**
 * Strike AI — zone·line·마감안착·구조를 융합한 차세대 시그널 레이어.
 * 확정 수익이 아닌 **조건부 참고** confluence·근접·체인 표시.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import {
  evaluateSettleBreak,
  settleHoldBarsForTf,
  volSma,
  SETTLE_BREAKOUT_VOL_RATIO,
  type SettleLevelProbe,
} from '@/lib/monthDeskSettleProbe';

export type StrikeAiPhase = 'scan' | 'align' | 'hot' | 'caution';

export type StrikeAiChainLink = {
  icon: string;
  label: string;
  ok: boolean;
  weight: number;
};

export type StrikeAiLegMeta = {
  confluence: number;
  phase: StrikeAiPhase;
  proximityPct: number;
  chain: StrikeAiChainLink[];
  tagKo: string;
};

export type StrikeAiDeskMeta = {
  phase: StrikeAiPhase;
  phaseKo: string;
  confluence: number;
  alignment: number;
  headlineKo: string;
  sublineKo: string;
  chain: StrikeAiChainLink[];
  long: StrikeAiLegMeta | null;
  short: StrikeAiLegMeta | null;
};

export type StrikeAiChartMarker = {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  color: string;
  text: string;
  size?: number;
};

const PHASE_KO: Record<StrikeAiPhase, string> = {
  scan: '스캔',
  align: '정렬',
  hot: 'HOT',
  caution: '주의',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function phaseFromScore(score: number, proximityPct: number, caution: boolean): StrikeAiPhase {
  if (caution) return 'caution';
  if (score >= 78 && proximityPct <= 1.4) return 'hot';
  if (score >= 58) return 'align';
  return 'scan';
}

function tagForPhase(phase: StrikeAiPhase, side: 'LONG' | 'SHORT'): string {
  if (phase === 'hot') return side === 'LONG' ? '⚡ 롱 HOT' : '⚡ 숏 HOT';
  if (phase === 'align') return side === 'LONG' ? '◆ 롱 정렬' : '◆ 숏 정렬';
  if (phase === 'caution') return '⚠ 재검토';
  return side === 'LONG' ? '◎ 롱 스캔' : '◎ 숏 스캔';
}

function analyzeLegAi(
  leg: MonthDeskStrikeLeg,
  bundle: MonthDeskStrikeDeskBundle,
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  timeframe: string
): StrikeAiLegMeta {
  const close = bundle.close;
  const proximityPct = (Math.abs(close - leg.entry) / Math.max(close, 1e-9)) * 100;
  const chain: StrikeAiChainLink[] = [];
  let score = 0;

  const structOk =
    (leg.side === 'LONG' && bundle.fusion.direction !== 'SHORT') ||
    (leg.side === 'SHORT' && bundle.fusion.direction !== 'LONG');
  chain.push({ icon: '◇', label: '구조', ok: structOk, weight: 18 });
  if (structOk) score += 18;

  const strengthOk = leg.strength === 'strong';
  chain.push({ icon: '★', label: 'Strike', ok: strengthOk, weight: 16 });
  score += strengthOk ? 16 : leg.strength === 'moderate' ? 9 : 4;

  const rrOk = leg.rr1 >= 1.35;
  chain.push({ icon: 'R', label: 'R:R', ok: rrOk, weight: 12 });
  if (rrOk) score += 12;
  else if (leg.rr1 >= 1.0) score += 6;

  const near = proximityPct <= 1.25;
  chain.push({ icon: '◎', label: '근접', ok: near, weight: 14 });
  if (near) score += 14;
  else if (proximityPct <= 2.5) score += 7;

  const inZone = close >= leg.zoneBot && close <= leg.zoneTop;
  chain.push({ icon: '▣', label: 'Zone', ok: inZone, weight: 12 });
  if (inZone) score += 12;

  const n = candles.length;
  const lastIdx = n - 1;
  const vol = Number(candles[lastIdx]?.volume) || 0;
  const volMa = volSma(candles, lastIdx + 1, 20);
  const volOk = volMa > 0 && vol >= volMa * SETTLE_BREAKOUT_VOL_RATIO * 0.85;
  chain.push({ icon: 'V', label: '거래량', ok: volOk, weight: 10 });
  if (volOk) score += 10;

  const probe: SettleLevelProbe = {
    key: leg.side === 'LONG' ? 'strike-long-e' : 'strike-short-e',
    levelKo: leg.side === 'LONG' ? 'Strike 롱 E' : 'Strike 숏 E',
    level: leg.entry,
    dir: leg.side === 'LONG' ? 'above' : 'below',
    weight: 100,
  };
  let settleOk = false;
  let settleCaution = false;
  const snap = evaluateSettleBreak(candles.slice(-80), probe, {
    useLastBreak: true,
    holdBars: settleHoldBarsForTf(timeframe),
    timeframe,
  });
  if (snap) {
    settleOk = snap.confirmIdx >= 0 || (snap.hold2 && snap.stillAbove);
    settleCaution = snap.fakeBreak || snap.retest.violated || !snap.stillAbove;
  }
  chain.push({ icon: '✓', label: '안착', ok: settleOk, weight: 14 });
  if (settleOk) score += 14;

  const sz = analysis?.settlementZone;
  const engineOk =
    sz &&
    sz.state !== 'none' &&
    ((leg.side === 'LONG' && sz.direction === 'LONG') || (leg.side === 'SHORT' && sz.direction === 'SHORT'));
  if (engineOk) {
    chain.push({ icon: 'AI', label: '엔진', ok: true, weight: 8 });
    score += 8;
  }

  const slBreach =
    leg.side === 'LONG' ? close < leg.stopLoss : close > leg.stopLoss;
  if (slBreach) settleCaution = true;

  const confluence = clamp(Math.round(score), 0, 100);
  const phase = phaseFromScore(confluence, proximityPct, settleCaution);

  return {
    confluence,
    phase,
    proximityPct,
    chain: chain.sort((a, b) => b.weight - a.weight).slice(0, 6),
    tagKo: tagForPhase(phase, leg.side),
  };
}

/** Strike 번들에 AI 메타 부착 */
export function enrichStrikeDeskWithAi(
  bundle: MonthDeskStrikeDeskBundle,
  candles: Candle[],
  analysis?: AnalyzeResponse | null
): MonthDeskStrikeDeskBundle & { ai: StrikeAiDeskMeta } {
  const tf = bundle.timeframe;
  const longAi = bundle.long ? analyzeLegAi(bundle.long, bundle, candles, analysis, tf) : null;
  const shortAi = bundle.short ? analyzeLegAi(bundle.short, bundle, candles, analysis, tf) : null;

  const lC = longAi?.confluence ?? 0;
  const sC = shortAi?.confluence ?? 0;
  const alignment = clamp(Math.round(lC - sC), -100, 100);

  let primaryAi: StrikeAiLegMeta | null = null;
  if (bundle.primary === 'LONG' && longAi) primaryAi = longAi;
  else if (bundle.primary === 'SHORT' && shortAi) primaryAi = shortAi;
  else primaryAi = lC >= sC ? longAi : shortAi;

  const phase = primaryAi?.phase ?? 'scan';
  const confluence = primaryAi?.confluence ?? Math.max(lC, sC);

  let headlineKo = 'AI Zone 스캔 — 레벨 정렬 대기';
  let sublineKo = 'zone·line·마감안착 체인을 실시간 융합 중';

  if (phase === 'hot' && primaryAi) {
    headlineKo =
      bundle.primary === 'LONG'
        ? `⚡ 롱 Strike HOT — E 근접 ${primaryAi.proximityPct.toFixed(1)}%`
        : bundle.primary === 'SHORT'
          ? `⚡ 숏 Strike HOT — E 근접 ${primaryAi.proximityPct.toFixed(1)}%`
          : `⚡ Strike HOT — confluence ${confluence}`;
    sublineKo = '타점·손절·TP 라인 동기화 — 조건 이탈 시 무효';
  } else if (phase === 'align') {
    headlineKo = `◆ AI 정렬 — confluence ${confluence}`;
    sublineKo = '구조·zone·안착 체인 일치 — 진입 근접 시 HOT';
  } else if (phase === 'caution') {
    headlineKo = '⚠ Strike 주의 — 시나리오 재검토';
    sublineKo = '손절 이탈·가짜돌파·안착 실패 신호';
  }

  const chain = (primaryAi?.chain ?? longAi?.chain ?? shortAi?.chain ?? []).slice(0, 6);

  return {
    ...bundle,
    ai: {
      phase,
      phaseKo: PHASE_KO[phase],
      confluence,
      alignment,
      headlineKo,
      sublineKo,
      chain,
      long: longAi,
      short: shortAi,
    },
  };
}

/** 차트 마커 — HOT·정렬 시 E 근처 */
export function buildStrikeAiChartMarkers(
  bundle: MonthDeskStrikeDeskBundle & { ai?: StrikeAiDeskMeta },
  candles: Candle[]
): StrikeAiChartMarker[] {
  const ai = bundle.ai;
  if (!ai || candles.length < 4) return [];
  const lastT = Number(candles[candles.length - 1]?.time);
  if (!Number.isFinite(lastT)) return [];
  const out: StrikeAiChartMarker[] = [];

  const pushLeg = (leg: MonthDeskStrikeLeg, meta: StrikeAiLegMeta | null) => {
    if (!meta || meta.phase === 'scan') return;
    const isLong = leg.side === 'LONG';
    const hot = meta.phase === 'hot';
    out.push({
      time: lastT,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: hot ? 'arrowUp' : 'circle',
      color: hot ? (isLong ? '#fde047' : '#fb923c') : isLong ? '#4ade80' : '#f87171',
      text: hot ? '⚡' : meta.confluence.toString(),
      size: hot ? 2 : 1,
    });
  };

  if (bundle.primary === 'LONG' && bundle.long) pushLeg(bundle.long, ai.long);
  else if (bundle.primary === 'SHORT' && bundle.short) pushLeg(bundle.short, ai.short);
  else {
    if (bundle.long) pushLeg(bundle.long, ai.long);
    if (bundle.short) pushLeg(bundle.short, ai.short);
  }

  return out;
}
