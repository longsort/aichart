/**
 * 통합·분석 — 선물 마스터 확정 (롱/숏/관망 1개).
 * 하드 게이트 · A/B/C 등급 · 계좌 리스크 사이징 · 세션·펀딩/OI 맥락.
 * 조건부 참고 — 승률·수익 보장·투자 권유 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

export type MasterFuturesSide = 'LONG' | 'SHORT' | 'WAIT';
export type MasterFuturesGrade = 'A' | 'B' | 'C' | 'X';

export type MasterFuturesSizing = {
  accountUsdt: number;
  riskPct: number;
  riskUsdt: number;
  stopDistPct: number;
  qty: number;
  notionalUsdt: number;
  suggestLeverage: number;
  sizingKo: string;
};

export type MasterFuturesSession = {
  sessionKo: string;
  ok: boolean;
  filterKo: string;
};

export type MasterFuturesContext = {
  fundingKo: string;
  oiKo: string;
  liqKo: string;
  fundingBias: 'LONG' | 'SHORT' | 'NEUTRAL';
};

export type MasterFuturesDecision = {
  side: MasterFuturesSide;
  rawDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  grade: MasterFuturesGrade;
  entryAllowed: boolean;
  /** 신호 일치도 0–100 (승률 아님) */
  strength: number;
  verdictKo: string;
  reasonKo: string;
  reasonsKo: string[];
  invalidationKo: string;
  entryPrice: number;
  stopPrice: number;
  tp1: number;
  rr: number;
  gatesPassCount: number;
  gatesRequired: number;
  gateBlockReasons: string[];
  sizing: MasterFuturesSizing;
  session: MasterFuturesSession;
  futures: MasterFuturesContext;
  journalHintKo: string;
  color: string;
};

const DEFAULT_ACCOUNT = 1000;
const DEFAULT_RISK_PCT = 1;
const GATES_REQUIRED = 4;
const MIN_RR = 1.5;

function atrPct(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 0;
  let sum = 0;
  const n = candles.length;
  for (let i = n - period; i < n; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
  }
  const atr = sum / period;
  const last = candles[n - 1]!.close;
  return last > 0 ? (atr / last) * 100 : 0;
}

function utcSession(now = new Date()): MasterFuturesSession {
  const h = now.getUTCHours();
  // Asia 00–08 · London overlap 07–16 · NY 13–21 (UTC)
  if (h >= 13 && h < 21) {
    return {
      sessionKo: '뉴욕·런던 겹침대',
      ok: true,
      filterKo: '유동성 양호 — 변동성·슬리피지 상대적으로 유리',
    };
  }
  if (h >= 7 && h < 13) {
    return {
      sessionKo: '런던 개장대',
      ok: true,
      filterKo: '유럽 유동성 — 돌파·되돌림 확인에 적합',
    };
  }
  if (h >= 0 && h < 7) {
    return {
      sessionKo: '아시아대',
      ok: true,
      filterKo: '유동성 중간 — 가짜 돌파 주의, 게이트 강화 권장',
    };
  }
  return {
    sessionKo: '전환·저유동 구간',
    ok: false,
    filterKo: '세션 전환 — 신규 진입보다 관망 권장',
  };
}

function futuresContext(analysis: AnalyzeResponse | null | undefined): MasterFuturesContext {
  const m = analysis?.unifiedMarketMetrics;
  const funding = analysis?.fundingState ?? 'neutral';
  const oi = analysis?.oiState ?? 'neutral';

  let fundingKo = '펀딩 — 데이터 대기';
  let fundingBias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (funding === 'positive') {
    fundingKo = '펀딩 + (롱 지불) — 과열 시 숏 되돌림 감시';
    fundingBias = 'SHORT';
  } else if (funding === 'negative') {
    fundingKo = '펀딩 − (숏 지불) — 숏 과밀 시 롱 커버 감시';
    fundingBias = 'LONG';
  } else {
    fundingKo = '펀딩 중립';
  }

  let oiKo = 'OI — 데이터 대기';
  if (oi === 'increasing') oiKo = 'OI 증가 — 포지션 유입(추세 지속·청산 리스크 동시)';
  else if (oi === 'decreasing') oiKo = 'OI 감소 — 포지션 청산·축소 흐름';
  else oiKo = 'OI 변화 미미';

  let liqKo = '청산 — 데이터 대기';
  if (m) {
    const lLong = m.liquidationLongUsd ?? 0;
    const lShort = m.liquidationShortUsd ?? 0;
    const total = lLong + lShort;
    if (total > 0) {
      const lp = Math.round((lLong / total) * 100);
      liqKo = `청산 롱 ${lp}% / 숏 ${100 - lp}%`;
    } else {
      liqKo = '최근 강제청산 규모 미미';
    }
  }

  return { fundingKo, oiKo, liqKo, fundingBias };
}

function computeRr(dir: 'LONG' | 'SHORT', entry: number, sl: number, tp1: number): number {
  if (entry <= 0 || sl <= 0 || tp1 <= 0) return 0;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);
  if (risk < 1e-9) return 0;
  if (dir === 'LONG' && !(sl < entry && tp1 > entry)) return 0;
  if (dir === 'SHORT' && !(sl > entry && tp1 < entry)) return 0;
  return reward / risk;
}

function computeSizing(
  entry: number,
  stop: number,
  accountUsdt = DEFAULT_ACCOUNT,
  riskPct = DEFAULT_RISK_PCT
): MasterFuturesSizing {
  const riskUsdt = Math.max(0, accountUsdt * (riskPct / 100));
  const stopDist = Math.abs(entry - stop);
  const stopDistPct = entry > 0 ? (stopDist / entry) * 100 : 0;
  const qty = stopDist > 0 ? riskUsdt / stopDist : 0;
  const notionalUsdt = qty * entry;
  const suggestLeverage =
    accountUsdt > 0 && notionalUsdt > 0
      ? Math.min(10, Math.max(5, Math.ceil(notionalUsdt / accountUsdt)))
      : 5;
  const sizingKo =
    entry > 0 && stop > 0
      ? `계좌 ${accountUsdt.toFixed(0)}USDT · 리스크 ${riskPct}%(${riskUsdt.toFixed(1)}) → 수량≈${qty.toFixed(4)} · 스윙권장레버 ${suggestLeverage}x(5~10) · 손절폭 ${stopDistPct.toFixed(2)}%`
      : 'E/SL 미정 — 사이징 대기';
  return {
    accountUsdt,
    riskPct,
    riskUsdt,
    stopDistPct,
    qty,
    notionalUsdt,
    suggestLeverage,
    sizingKo,
  };
}

function gradeOf(params: {
  entryAllowed: boolean;
  gates: number;
  rr: number;
  strength: number;
  sessionOk: boolean;
}): MasterFuturesGrade {
  if (!params.entryAllowed) return 'X';
  if (params.gates >= 5 && params.rr >= 2 && params.strength >= 72 && params.sessionOk) return 'A';
  if (params.gates >= 4 && params.rr >= MIN_RR && params.strength >= 58) return 'B';
  if (params.gates >= 3 && params.rr >= 1.2) return 'C';
  return 'X';
}

export function buildMasterFuturesDecision(params: {
  judgment: MergedTradeJudgment;
  tradePlan: UnifiedDeskTradePlan;
  confirms: MergedDirectionConfirm[];
  analysis?: AnalyzeResponse | null;
  candles: Candle[];
  timeframe: string;
  mtfAligned?: boolean;
  accountUsdt?: number;
  riskPct?: number;
}): MasterFuturesDecision {
  const {
    judgment,
    tradePlan,
    confirms,
    analysis,
    candles,
    timeframe,
    mtfAligned = true,
  } = params;
  const accountUsdt = params.accountUsdt ?? DEFAULT_ACCOUNT;
  const riskPct = params.riskPct ?? DEFAULT_RISK_PCT;
  const tf = normalizeChartTimeframe(timeframe);

  const top = confirms.find((c) => c.tier === 'confirmed') ?? confirms[0];
  const gatesPassCount =
    analysis?.confirmedSignal?.gatesPassCount ??
    top?.gatesPassCount ??
    0;
  const mtfBlocked = Boolean(analysis?.confirmedSignal?.mtfBlocked);

  const rawDirection = judgment.direction;
  const planDir =
    tradePlan.direction !== 'NEUTRAL'
      ? tradePlan.direction
      : rawDirection !== 'NEUTRAL'
        ? rawDirection
        : 'NEUTRAL';

  const entryPrice = tradePlan.entry > 0 ? tradePlan.entry : 0;
  const stopPrice = tradePlan.stopLoss > 0 ? tradePlan.stopLoss : 0;
  const tp1 = tradePlan.tp1 > 0 ? tradePlan.tp1 : 0;
  const rr =
    planDir === 'LONG' || planDir === 'SHORT'
      ? computeRr(planDir, entryPrice, stopPrice, tp1)
      : 0;

  const session = utcSession();
  const futures = futuresContext(analysis);
  const atr = atrPct(candles);
  const sizing = computeSizing(entryPrice, stopPrice, accountUsdt, riskPct);

  const gateBlockReasons: string[] = [];
  if (rawDirection === 'NEUTRAL') gateBlockReasons.push('방향 혼재 — 마스터 관망');
  if (gatesPassCount < GATES_REQUIRED) {
    gateBlockReasons.push(`게이트 ${gatesPassCount}/${GATES_REQUIRED} 미달`);
  }
  if (mtfBlocked || mtfAligned === false) {
    gateBlockReasons.push('상위 TF(MTF) 미정렬');
  }
  if (planDir !== 'NEUTRAL' && rr > 0 && rr < MIN_RR) {
    gateBlockReasons.push(`RR ${rr.toFixed(2)} < ${MIN_RR} (손익비 부족)`);
  }
  if (planDir !== 'NEUTRAL' && (entryPrice <= 0 || stopPrice <= 0)) {
    gateBlockReasons.push('E/SL 미확정');
  }
  if (!session.ok) {
    gateBlockReasons.push(`세션 필터: ${session.sessionKo}`);
  }
  if (atr >= 4.5) {
    gateBlockReasons.push(`변동성 과다(ATR≈${atr.toFixed(1)}%) — 손절폭 확대 위험`);
  }
  if (
    (planDir === 'LONG' && futures.fundingBias === 'SHORT' && atr >= 2.2) ||
    (planDir === 'SHORT' && futures.fundingBias === 'LONG' && atr >= 2.2)
  ) {
    gateBlockReasons.push('펀딩·변동성 역방향 — 진입 축소/대기');
  }

  // 가격이 지지·저항 중간대면 관망 가중 (존 기둥 혼재)
  const zonePillars = judgment.pillars.filter((p) => p.key === 'zone' || p.key === 'structure');
  const mixedZone =
    zonePillars.some((p) => p.bias === 'LONG') && zonePillars.some((p) => p.bias === 'SHORT');
  if (mixedZone && gatesPassCount < 5) {
    gateBlockReasons.push('지지·저항 신호 혼재 — 중간대 관망');
  }

  const hardBlocked = gateBlockReasons.length > 0;
  const side: MasterFuturesSide = hardBlocked
    ? 'WAIT'
    : planDir === 'LONG'
      ? 'LONG'
      : planDir === 'SHORT'
        ? 'SHORT'
        : 'WAIT';

  const alignedPillars = judgment.pillars.filter(
    (p) => p.bias === planDir && planDir !== 'NEUTRAL'
  ).length;
  const strength = Math.min(
    92,
    Math.max(
      28,
      35 + gatesPassCount * 8 + alignedPillars * 4 + (rr >= 2 ? 8 : rr >= MIN_RR ? 4 : 0)
    )
  );

  const entryAllowed = side !== 'WAIT' && !hardBlocked;
  const grade = gradeOf({
    entryAllowed,
    gates: gatesPassCount,
    rr,
    strength,
    sessionOk: session.ok,
  });

  const reasonsKo: string[] = [];
  if (entryAllowed) {
    reasonsKo.push(
      ...judgment.pillars
        .filter((p) => p.bias === side)
        .slice(0, 2)
        .map((p) => p.detailKo)
    );
    if (rr > 0) reasonsKo.push(`손익비 ≈ ${rr.toFixed(2)}R`);
  } else {
    reasonsKo.push(...gateBlockReasons.slice(0, 3));
  }
  if (!reasonsKo.length) reasonsKo.push(judgment.headlineKo);

  const reasonKo = reasonsKo.slice(0, 2).join(' · ');

  const verdictKo =
    side === 'LONG'
      ? `롱 확정 · ${grade}등급 · 신호 ${strength}점`
      : side === 'SHORT'
        ? `숏 확정 · ${grade}등급 · 신호 ${strength}점`
        : `관망 · ${grade === 'X' ? '진입잠금' : `${grade}등급`} · 신호 ${strength}점`;

  const invalidationKo =
    tradePlan.invalidationKo ||
    judgment.invalidationKo ||
    (stopPrice > 0
      ? `무효: SL ${stopPrice.toFixed(0)} 종가 이탈 시 시나리오 종료 (재진입 쿨다운)`
      : '무효: 구조 이탈·게이트 붕괴 시 시나리오 종료');

  const journalHintKo = entryAllowed
    ? `저널: ${side} ${grade} · E${entryPrice.toFixed(0)} SL${stopPrice.toFixed(0)} · 게이트${gatesPassCount}/5 · TF ${tf}`
    : `저널: WAIT — ${gateBlockReasons[0] ?? '조건 미달'} · TF ${tf}`;

  const color = side === 'LONG' ? '#22c55e' : side === 'SHORT' ? '#f87171' : '#fbbf24';

  return {
    side,
    rawDirection,
    grade,
    entryAllowed,
    strength,
    verdictKo,
    reasonKo,
    reasonsKo,
    invalidationKo,
    entryPrice,
    stopPrice,
    tp1,
    rr,
    gatesPassCount,
    gatesRequired: GATES_REQUIRED,
    gateBlockReasons,
    sizing,
    session,
    futures,
    journalHintKo,
    color,
  };
}
