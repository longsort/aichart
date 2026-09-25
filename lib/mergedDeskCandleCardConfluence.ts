/**
 * 캔들 분석 · 카드 패널 · 종가 마감/안착 → ActiveTrade 합류.
 * 이중 E/SL/TP 금지 — 증거만 모으고 타점은 단일 ActiveTradePlan으로 확정.
 * 확정 수익·고정 승률 문구 금지.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import type {
  MergedDeskActiveTradePlan,
  MergedDeskActivePlanStatus,
} from '@/lib/mergedDeskActiveTradePlan';
import {
  calcTradeRewardRisk,
  strengthenUnifiedDeskTradePlan,
  enforceTradePlanDirectionGeometry,
} from '@/lib/mergedDeskUnifiedTradeRails';
import {
  evaluateSettleEntryGate,
  type TfCloseSettleBoard,
  type TfCloseSettleRow,
} from '@/lib/tfCloseSettleAssessment';

/** 카드 패널에서 합류에 쓰는 최소 필드 (엔진 순환 import 방지) */
export type CandleCardPanelLite = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  longPct?: number;
  shortPct?: number;
  confidence?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
};

export type CandleCardConfluenceLevels = {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  status: MergedDeskActivePlanStatus;
  entryAllowed: boolean;
  /** 캔들·카드·마감 합류 점수 0~100 (참고) */
  agreeScore: number;
  reasonsKo: string[];
  settleKo: string | null;
  cardKo: string | null;
  candleKo: string | null;
};

export type CandleCardConfluencePack = {
  levels: CandleCardConfluenceLevels | null;
  /** ActiveTrade 없을 때만 쓰는 가격선 — 있으면 Active가 우선 */
  priceLines: AtlasPulsePriceLine[];
  /** 증거 zone (짧은 레일 금지 — 형성봉→현재) */
  evidenceOverlays: OverlayItem[];
  summaryKo: string;
  linked: boolean;
};

function num(x: unknown): number {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function approxAtr(candles: Candle[], len = 14): number {
  if (candles.length < 3) return 0;
  const n = Math.min(len, candles.length - 1);
  let s = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    s += tr;
  }
  return s / n;
}

function pickDirection(params: {
  analysis?: AnalyzeResponse | null;
  card?: Pick<CandleCardPanelLite, 'direction' | 'longPct' | 'shortPct'> | null;
  judgment?: MergedTradeJudgment | null;
  signal?: MergedTradeSignal | null;
}): 'LONG' | 'SHORT' | null {
  const votes: Array<'LONG' | 'SHORT'> = [];
  const an = params.analysis;
  if (an?.verdict === 'LONG' || an?.verdict === 'SHORT') votes.push(an.verdict);
  if (params.card?.direction === 'LONG' || params.card?.direction === 'SHORT') {
    votes.push(params.card.direction);
  }
  if (params.judgment?.direction === 'LONG' || params.judgment?.direction === 'SHORT') {
    votes.push(params.judgment.direction);
  }
  if (params.signal?.primary === 'LONG' || params.signal?.primary === 'SHORT') {
    votes.push(params.signal.primary);
  }
  if (!votes.length) {
    const ls = Number(an?.longScore ?? params.card?.longPct ?? 0);
    const ss = Number(an?.shortScore ?? params.card?.shortPct ?? 0);
    if (ls > ss + 4) return 'LONG';
    if (ss > ls + 4) return 'SHORT';
    return null;
  }
  const longN = votes.filter((v) => v === 'LONG').length;
  const shortN = votes.filter((v) => v === 'SHORT').length;
  if (longN === shortN) return null;
  return longN > shortN ? 'LONG' : 'SHORT';
}

function settleBiasKo(row: TfCloseSettleRow | null | undefined): {
  favor: 'LONG' | 'SHORT' | 'NEUTRAL';
  ko: string;
} {
  if (!row) return { favor: 'NEUTRAL', ko: '마감보드 없음' };
  const tag = row.tailongTag;
  const edge = row.confirmedEdge;
  const v = row.formingVerdict;
  let favor: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (edge === '롱 유리') favor = 'LONG';
  else if (edge === '숏 유리') favor = 'SHORT';
  else if (tag === '종가안착' && row.vsPriorClose === '위') favor = 'LONG';
  else if (tag === '종가안착' && row.vsPriorClose === '아래') favor = 'SHORT';
  else if (v === '안착' && row.vsPriorClose === '위') favor = 'LONG';
  else if (v === '안착' && row.vsPriorClose === '아래') favor = 'SHORT';
  else if (v === '실패') favor = 'NEUTRAL';

  const ko = [
    `${row.tfKo} ${v}`,
    tag ? tag : null,
    edge !== '중립' ? edge : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { favor, ko };
}

/**
 * 캔들·카드·마감 row에서 합류 타점 후보 추출.
 */
export function buildCandleCardConfluencePack(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  cardPanel?: CandleCardPanelLite | null;
  judgment?: MergedTradeJudgment | null;
  signal?: MergedTradeSignal | null;
  settleRow?: TfCloseSettleRow | null;
  settleBoard?: TfCloseSettleBoard | null;
  currentPrice?: number | null;
}): CandleCardConfluencePack {
  const empty: CandleCardConfluencePack = {
    levels: null,
    priceLines: [],
    evidenceOverlays: [],
    summaryKo: '캔들·카드 합류 대기',
    linked: false,
  };
  const candles = params.candles;
  if (candles.length < 8) return empty;

  const close =
    params.currentPrice && params.currentPrice > 0
      ? params.currentPrice
      : Number(candles[candles.length - 1]?.close) || 0;
  if (!(close > 0)) return empty;

  const dir = pickDirection({
    analysis: params.analysis,
    card: params.cardPanel,
    judgment: params.judgment,
    signal: params.signal,
  });
  if (!dir) return empty;

  const an = params.analysis;
  const card = params.cardPanel;
  const sig = params.signal;

  let entry =
    num(sig?.entry) ||
    num(card?.entry) ||
    num(an?.entry) ||
    0;
  let stopLoss =
    num(sig?.stopLoss) ||
    num(card?.stopLoss) ||
    num(an?.stopLoss) ||
    0;
  let tp1 =
    num(sig?.tp1) ||
    num(card?.tp1) ||
    num(an?.targets?.[0]) ||
    num(an?.nextTargets?.[0]) ||
    0;
  let tp2 =
    num(sig?.tp2) ||
    num(card?.tp2) ||
    num(an?.targets?.[1]) ||
    num(an?.nextTargets?.[1]) ||
    0;
  let tp3 =
    num(sig?.tp3) ||
    num(card?.tp3) ||
    num(an?.targets?.[2]) ||
    num(an?.nextTargets?.[2]) ||
    0;

  const atr = approxAtr(candles);
  const risk = atr > 0 ? atr * 1.12 : close * 0.008;
  if (!(entry > 0)) entry = close;
  if (!(stopLoss > 0)) {
    stopLoss = dir === 'LONG' ? entry - risk : entry + risk;
  }
  const sign = dir === 'LONG' ? 1 : -1;
  if (!(tp1 > 0)) tp1 = entry + sign * risk * 1.6;
  if (!(tp2 > 0)) tp2 = entry + sign * risk * 2.6;
  if (!(tp3 > 0)) tp3 = entry + sign * risk * 4;

  const geo = enforceTradePlanDirectionGeometry(dir, entry, stopLoss, tp1, tp2, tp3);
  entry = geo.entry;
  stopLoss = geo.stopLoss;
  tp1 = geo.tp1;
  tp2 = geo.tp2;
  tp3 = geo.tp3;

  const settle = settleBiasKo(params.settleRow);
  const gate = evaluateSettleEntryGate({
    side: dir,
    settleBoard: params.settleBoard ?? null,
    settleRow: params.settleRow ?? null,
    chartTf: params.timeframe,
  });

  const reasons: string[] = [];
  let agree = 36;

  const candleKo =
    an?.verdict === 'LONG' || an?.verdict === 'SHORT'
      ? `캔들 ${an.verdict}`
      : an
        ? `캔들 점수 L${Math.round(Number(an.longScore) || 0)}/S${Math.round(Number(an.shortScore) || 0)}`
        : null;
  if (candleKo) {
    reasons.push(candleKo);
    agree += an?.verdict === dir ? 18 : 8;
  }

  const cardKo =
    card?.direction === 'LONG' || card?.direction === 'SHORT'
      ? `카드 ${card.direction === 'LONG' ? '롱' : '숏'} · 확${Math.round(card.confidence || 0)}`
      : null;
  if (cardKo) {
    reasons.push(cardKo);
    agree += card?.direction === dir ? 16 : 6;
  }

  if (settle.ko) {
    reasons.push(`마감 ${settle.ko}`);
    if (settle.favor === dir) agree += 18;
    else if (settle.favor !== 'NEUTRAL' && settle.favor !== dir) agree -= 14;
  }

  if (gate.allowEnter) {
    reasons.push(gate.summaryKo || '마감게이트 통과');
    agree += 12;
  } else if (gate.failAgainst || gate.hardBlockReasons.length) {
    reasons.push(gate.summaryKo || '마감게이트 잠금');
    agree -= 10;
  }

  agree = Math.max(0, Math.min(100, agree));

  let status: MergedDeskActivePlanStatus = 'WAIT';
  let entryAllowed = false;
  if (
    gate.failAgainst ||
    (settle.favor !== 'NEUTRAL' && settle.favor !== dir && agree < 50)
  ) {
    status = 'WAIT';
    entryAllowed = false;
  } else if (gate.allowEnter && agree >= 62) {
    status = 'ENTER';
    entryAllowed = true;
  } else if (agree >= 48 && (settle.favor === dir || gate.sealedOk)) {
    status = 'TOUCH';
    entryAllowed = false;
  }

  const strengthened = strengthenUnifiedDeskTradePlan({
    direction: dir,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationKo: `종가 ${fmt(stopLoss)} 이탈 시 무효`,
    sourceKo: '캔들·카드합류',
    alignedWithChart: true,
    warningsKo: reasons.slice(0, 5),
  });

  const levels: CandleCardConfluenceLevels = {
    direction: dir,
    entry: strengthened.entry,
    stopLoss: strengthened.stopLoss,
    tp1: strengthened.tp1,
    tp2: strengthened.tp2,
    tp3: strengthened.tp3,
    invalidationPrice: strengthened.stopLoss,
    status,
    entryAllowed,
    agreeScore: agree,
    reasonsKo: reasons.slice(0, 6),
    settleKo: settle.ko,
    cardKo,
    candleKo,
  };

  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  const formI = Math.max(0, n - Math.min(64, Math.max(20, Math.floor(n * 0.3))));
  const formT = Number(candles[formI]!.time);
  const half = atr > 0 ? atr * 0.32 : entry * 0.002;
  const evidenceOverlays: OverlayItem[] = [];
  if (lastT > formT && levels.entry > 0) {
    evidenceOverlays.push({
      id: 'merged-desk-candle-card-entry-ev',
      kind: 'zone',
      label: '합류진입',
      x1: 0,
      y1: 0,
      confidence: Math.min(90, 50 + Math.floor(agree / 3)),
      color:
        status === 'ENTER'
          ? 'rgba(45,212,191,0.2)'
          : status === 'TOUCH'
            ? 'rgba(250,204,21,0.14)'
            : 'rgba(45,212,191,0.12)',
      time1: formT,
      time2: lastT,
      price1: levels.entry + half,
      price2: levels.entry - half,
      category: 'structure',
      overlayZoneExtraClass:
        'merged-desk-zone-face-minimal merged-desk-candle-card-evidence',
    });
  }

  const go = status === 'ENTER' && entryAllowed;
  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: levels.entry,
      color: go ? '#2DD4BF' : '#14B8A6',
      title: `진입 ${fmt(levels.entry)}`,
      lineWidth: go ? 3 : 2,
      lineStyle: go || status === 'TOUCH' ? 'solid' : 'dashed',
      axisLabel: true,
    },
    {
      price: levels.stopLoss,
      color: '#F87171',
      title: `손절 ${fmt(levels.stopLoss)}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    },
  ];
  if (levels.tp1 > 0) {
    const rr = calcTradeRewardRisk(levels.entry, levels.stopLoss, levels.tp1);
    priceLines.push({
      price: levels.tp1,
      color: '#4ADE80',
      title: `목표 ${fmt(levels.tp1)}${rr != null ? ` · ${rr.toFixed(1)}R` : ''}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (levels.tp2 > 0) {
    priceLines.push({
      price: levels.tp2,
      color: '#7DD3FC',
      title: `목표2 ${fmt(levels.tp2)}`,
      lineWidth: 2,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (levels.tp3 > 0) {
    priceLines.push({
      price: levels.tp3,
      color: '#A78BFA',
      title: `목표3 ${fmt(levels.tp3)}`,
      lineWidth: 2,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  const statusKo =
    status === 'ENTER' ? '진입' : status === 'TOUCH' ? '터치' : '대기';
  const summaryKo = `합류 ${dir === 'LONG' ? '롱' : '숏'} · ${statusKo} · 동의${agree} · E${fmt(levels.entry)} SL${fmt(levels.stopLoss)} TP${fmt(levels.tp1)}`;

  return {
    levels,
    priceLines,
    evidenceOverlays,
    summaryKo,
    linked: true,
  };
}

/** 합류 레벨 → ActiveTrade 초안 */
export function candleCardLevelsToActiveDraft(
  levels: CandleCardConfluenceLevels
): MergedDeskActiveTradePlan {
  const strengthened = strengthenUnifiedDeskTradePlan({
    direction: levels.direction,
    entry: levels.entry,
    stopLoss: levels.stopLoss,
    tp1: levels.tp1,
    tp2: levels.tp2,
    tp3: levels.tp3,
    invalidationKo: `종가 ${fmt(levels.invalidationPrice || levels.stopLoss)} 이탈 시 무효`,
    sourceKo: '캔들·카드합류',
    alignedWithChart: true,
    warningsKo: levels.reasonsKo.slice(0, 4),
  });
  return {
    direction: levels.direction,
    entry: strengthened.entry,
    stopLoss: strengthened.stopLoss,
    tp1: strengthened.tp1,
    tp2: strengthened.tp2,
    tp3: strengthened.tp3,
    invalidationPrice: levels.invalidationPrice || strengthened.stopLoss,
    invalidationKo: strengthened.invalidationKo,
    rr: calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) || 0,
    status: levels.status,
    statusKo:
      levels.status === 'ENTER'
        ? '진입'
        : levels.status === 'TOUCH'
          ? '터치'
          : levels.status === 'INVALID'
            ? '무효'
            : '대기',
    source: 'candleCard',
    sourceKo: '캔들·카드합류',
    entryAllowed: levels.entryAllowed && levels.status === 'ENTER',
    asUnifiedPlan: strengthened,
  };
}

/**
 * 기존 ActiveTrade에 캔들·카드 증거 합류.
 * swing/hot/channel 우선 — 방향 충돌 시 덮지 않고 경고만.
 */
export function mergeCandleCardIntoActiveTrade(
  plan: MergedDeskActiveTradePlan,
  pack: CandleCardConfluencePack | null | undefined
): MergedDeskActiveTradePlan {
  const lv = pack?.levels;
  if (!lv || !pack?.linked) return plan;
  if (plan.direction === 'NEUTRAL' || !(plan.entry > 0)) {
    return candleCardLevelsToActiveDraft(lv);
  }
  if (plan.direction !== lv.direction) {
    return {
      ...plan,
      asUnifiedPlan: {
        ...plan.asUnifiedPlan,
        warningsKo: [
          ...plan.asUnifiedPlan.warningsKo,
          `캔들·카드 ${lv.direction} 불일치 — Active(${plan.sourceKo}) 유지`,
        ].slice(0, 6),
      },
    };
  }

  let next = { ...plan };
  const warn = [...plan.asUnifiedPlan.warningsKo];

  if (!(next.tp2 > 0) && lv.tp2 > 0) next.tp2 = lv.tp2;
  if (!(next.tp3 > 0) && lv.tp3 > 0) next.tp3 = lv.tp3;
  if (!(next.tp1 > 0) && lv.tp1 > 0) next.tp1 = lv.tp1;

  /** 약한 소스(unified/none)만 합류 타점으로 교체 가능 */
  if (
    (plan.source === 'unified' || plan.source === 'none') &&
    lv.agreeScore >= 55 &&
    lv.entry > 0 &&
    lv.stopLoss > 0
  ) {
    const draft = candleCardLevelsToActiveDraft(lv);
    next = {
      ...draft,
      asUnifiedPlan: {
        ...draft.asUnifiedPlan,
        warningsKo: [...draft.asUnifiedPlan.warningsKo, `기존 ${plan.sourceKo} → 합류 보강`].slice(
          0,
          6
        ),
      },
    };
  } else {
    /** 상태 승격: WAIT→TOUCH만 (ENTER는 게이트 있는 합류만) */
    if (next.status === 'WAIT' && lv.status === 'TOUCH') {
      next = { ...next, status: 'TOUCH', statusKo: '터치', entryAllowed: false };
      warn.push('캔들·카드·마감 터치 합류');
    }
    if (
      next.status !== 'INVALID' &&
      next.status !== 'ENTER' &&
      lv.status === 'ENTER' &&
      lv.entryAllowed &&
      (plan.source === 'unified' || plan.source === 'none' || plan.source === 'candleCard')
    ) {
      next = {
        ...next,
        status: 'ENTER',
        statusKo: '진입',
        entryAllowed: true,
      };
      warn.push('합류 ENTER (마감게이트+동의)');
    }
    warn.push(...lv.reasonsKo.slice(0, 2));
    next = {
      ...next,
      asUnifiedPlan: {
        ...next.asUnifiedPlan,
        tp1: next.tp1,
        tp2: next.tp2,
        tp3: next.tp3,
        warningsKo: [...new Set(warn)].slice(0, 6),
      },
      rr: calcTradeRewardRisk(next.entry, next.stopLoss, next.tp1) || next.rr,
    };
  }

  return next;
}

export function summarizeCandleCardConfluenceKo(
  pack: CandleCardConfluencePack | null | undefined
): string {
  if (!pack?.linked || !pack.levels) return '';
  return pack.summaryKo;
}
