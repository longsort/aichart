/**
 * 통합·분석 — 단일 ActiveTradePlan (E/SL/TP/무효/RR/상태).
 * 스윙중투 · HotZone · unified 중 하나를 골라 차트·축·시그널에 동일 적용.
 * 종가 무효화 시 WAIT — 확정 수익·승률 보장 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedDeskChannelMoneyPlan } from '@/lib/mergedDeskChannelMoneyEdge';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import {
  calcTradeRewardRisk,
  strengthenUnifiedDeskTradePlan,
  enforceTradePlanDirectionGeometry,
} from '@/lib/mergedDeskUnifiedTradeRails';
import {
  evalMergedDeskNewsEntryGate,
  mergedDeskHtfSplitBlocksEnter,
  mergedDeskRiskSizeHintKo,
  type MergedDeskNewsHintLite,
} from '@/lib/mergedDeskEntryHardGates';
import type { CandleCardConfluencePack } from '@/lib/mergedDeskCandleCardConfluence';
import {
  candleCardLevelsToActiveDraft,
  mergeCandleCardIntoActiveTrade,
} from '@/lib/mergedDeskCandleCardConfluence';

export type MergedDeskActivePlanStatus = 'WAIT' | 'TOUCH' | 'ENTER' | 'INVALID';
export type MergedDeskActivePlanSource =
  | 'swingMid'
  | 'hotZone'
  | 'channel'
  | 'unified'
  | 'candleCard'
  | 'none';

export type MergedDeskActiveTradePlan = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  invalidationKo: string;
  rr: number;
  status: MergedDeskActivePlanStatus;
  statusKo: string;
  source: MergedDeskActivePlanSource;
  sourceKo: string;
  /** 지금 진입 허용(차트 선 강조) — INVALID/WAIT·마스터 잠금 시 false */
  entryAllowed: boolean;
  asUnifiedPlan: UnifiedDeskTradePlan;
};

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function emptyPlan(reasonKo: string): MergedDeskActiveTradePlan {
  const asUnifiedPlan: UnifiedDeskTradePlan = {
    direction: 'NEUTRAL',
    entry: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    invalidationKo: reasonKo,
    sourceKo: '없음',
    alignedWithChart: false,
    warningsKo: [reasonKo],
  };
  return {
    direction: 'NEUTRAL',
    entry: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    invalidationPrice: 0,
    invalidationKo: reasonKo,
    rr: 0,
    status: 'WAIT',
    statusKo: '대기',
    source: 'none',
    sourceKo: '없음',
    entryAllowed: false,
    asUnifiedPlan,
  };
}

function statusKoOf(s: MergedDeskActivePlanStatus): string {
  if (s === 'ENTER') return '진입';
  if (s === 'TOUCH') return '터치';
  if (s === 'INVALID') return '무효';
  return '대기';
}

function applyInvalidation(
  plan: MergedDeskActiveTradePlan,
  close: number
): MergedDeskActiveTradePlan {
  if (plan.direction === 'NEUTRAL' || !(plan.invalidationPrice > 0) || !(close > 0)) {
    return plan;
  }
  const broken =
    plan.direction === 'LONG'
      ? close < plan.invalidationPrice
      : close > plan.invalidationPrice;
  if (!broken) return plan;
  return {
    ...plan,
    status: 'INVALID',
    statusKo: '무효',
    entryAllowed: false,
    invalidationKo: `${plan.invalidationKo} · 종가 ${fmt(close)} 이탈`,
    asUnifiedPlan: {
      ...plan.asUnifiedPlan,
      warningsKo: [
        ...plan.asUnifiedPlan.warningsKo,
        `종가 ${fmt(close)} — 무효가 ${fmt(plan.invalidationPrice)} 이탈`,
      ],
      invalidationKo: `${plan.invalidationKo} · 종가 이탈`,
    },
  };
}

/**
 * 우선순위: 스윙중투 → 채널머니(엣지·RR) → HotZone → unified.
 * 이후 종가 무효화·마스터 게이트 적용.
 */
function approxAtr(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  const start = Math.max(1, n - 14);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every(Number.isFinite)) continue;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    cnt += 1;
  }
  if (cnt <= 0) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  return sum / cnt;
}

/**
 * 스윙/Hot/unified가 비었을 때 — 분석·Strike·ATR로 E/SL/TP1~3 합성.
 * 분·시·일·주·월 공동 (차트에 타점 가로선이 비지 않게).
 */
export function synthesizeMergedDeskActiveTradePlan(params: {
  candles: Candle[];
  close: number;
  signal?: MergedTradeSignal | null;
  analysis?: AnalyzeResponse | null;
  judgment?: MergedTradeJudgment | null;
}): MergedDeskActiveTradePlan | null {
  const close = params.close > 0 ? params.close : Number(params.candles[params.candles.length - 1]?.close) || 0;
  if (!(close > 0) || params.candles.length < 8) return null;

  const sig = params.signal;
  const an = params.analysis;
  const dir: 'LONG' | 'SHORT' | null =
    sig?.primary === 'LONG' || sig?.primary === 'SHORT'
      ? sig.primary
      : an?.verdict === 'LONG' || an?.verdict === 'SHORT'
        ? an.verdict
        : params.judgment?.direction === 'LONG' || params.judgment?.direction === 'SHORT'
          ? params.judgment.direction
          : null;
  if (!dir) return null;

  let entry = sig && sig.entry > 0 ? sig.entry : Number(an?.entry) || 0;
  let stopLoss = sig && sig.stopLoss > 0 ? sig.stopLoss : Number(an?.stopLoss) || 0;
  let tp1 = sig && sig.tp1 > 0 ? sig.tp1 : Number(an?.targets?.[0]) || 0;
  let tp2 = sig && sig.tp2 > 0 ? sig.tp2 : Number(an?.targets?.[1]) || 0;
  let tp3 = sig && sig.tp3 > 0 ? sig.tp3 : Number(an?.targets?.[2]) || 0;

  if (!(entry > 0)) entry = close;
  const atr = approxAtr(params.candles);
  const risk = atr > 0 ? atr * 1.15 : entry * 0.008;
  if (!(stopLoss > 0)) {
    stopLoss = dir === 'LONG' ? entry - risk : entry + risk;
  }
  const sign = dir === 'LONG' ? 1 : -1;
  if (!(tp1 > 0)) tp1 = entry + sign * risk * 1.5;
  if (!(tp2 > 0)) tp2 = entry + sign * risk * 2.5;
  if (!(tp3 > 0)) tp3 = entry + sign * risk * 4;

  const geoOk =
    dir === 'LONG'
      ? stopLoss < entry && tp1 > entry
      : stopLoss > entry && tp1 < entry;
  if (!geoOk) return null;

  const strengthened = strengthenUnifiedDeskTradePlan({
    direction: dir,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationKo: `종가 ${fmt(stopLoss)} 이탈 시 무효`,
    sourceKo: sig?.entry ? 'Strike·분석' : '분석·ATR',
    alignedWithChart: true,
    warningsKo: ['구조·수급 재확인 후 진입 (참고 타점)'],
  });

  return {
    direction: dir,
    entry: strengthened.entry,
    stopLoss: strengthened.stopLoss,
    tp1: strengthened.tp1,
    tp2: strengthened.tp2,
    tp3: strengthened.tp3,
    invalidationPrice: strengthened.stopLoss,
    invalidationKo: strengthened.invalidationKo,
    rr: calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) || 0,
    status: 'WAIT',
    statusKo: '대기',
    source: 'unified',
    sourceKo: strengthened.sourceKo,
    entryAllowed: false,
    asUnifiedPlan: strengthened,
  };
}

/** 진입·손절·목표 ZONE 면 — 형성봉→마지막봉 전폭(짧은 레일 금지). 가격선과 병행. */
export function buildMergedDeskEntryZoneOverlays(
  plan: MergedDeskActiveTradePlan,
  candles: Candle[],
  _timeframe: string
): OverlayItem[] {
  if (plan.direction === 'NEUTRAL' || !(plan.entry > 0) || candles.length < 8) return [];
  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  const formI = Math.max(0, n - Math.min(72, Math.max(24, Math.floor(n * 0.35))));
  const formT = Number(candles[formI]!.time);
  if (!(lastT > formT)) return [];

  const atr = approxAtr(candles);
  const half = atr > 0 ? atr * 0.38 : plan.entry * 0.0025;
  const dead = plan.status === 'INVALID';
  const out: OverlayItem[] = [];

  const pushBand = (
    id: string,
    label: string,
    mid: number,
    pad: number,
    color: string,
    extra: string,
    conf: number
  ) => {
    if (!(mid > 0)) return;
    const top = mid + pad;
    const bot = mid - pad;
    out.push({
      id,
      kind: 'zone',
      label,
      x1: 0,
      y1: 0,
      confidence: conf,
      color,
      time1: formT,
      time2: lastT,
      price1: top,
      price2: bot,
      category: 'structure',
      overlayZoneExtraClass: `${extra} merged-desk-zone-face-minimal merged-desk-trade-target-band`.trim(),
    });
  };

  pushBand(
    'merged-desk-entry-zone',
    plan.direction === 'LONG' ? '롱진입' : '숏진입',
    plan.entry,
    half,
    dead ? 'rgba(45,212,191,0.12)' : 'rgba(45,212,191,0.18)',
    'merged-desk-entry-zone merged-hq-entry-zone merged-desk-rb-fog-pocket merged-desk-rb-fog-entry',
    plan.entryAllowed ? 88 : 72
  );

  if (plan.stopLoss > 0) {
    pushBand(
      'merged-desk-sl-zone',
      '손절',
      plan.stopLoss,
      half * 0.72,
      dead ? 'rgba(248,113,113,0.1)' : 'rgba(248,113,113,0.16)',
      'merged-desk-sl-zone merged-desk-rb-fog-pocket merged-desk-rb-fog-sl',
      70
    );
  }

  if (plan.tp1 > 0) {
    pushBand(
      'merged-desk-tp-zone',
      '목표1',
      plan.tp1,
      half * 0.85,
      dead ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.16)',
      'merged-desk-tp-zone merged-desk-rb-fog-pocket merged-desk-rb-fog-tp',
      74
    );
  }

  /** Hot 스타일 합류 띠 — 진입~손절 사이 얇은 밴드 (무효가와 겹치면 스킵) */
  if (plan.stopLoss > 0 && Math.abs(plan.entry - plan.stopLoss) > half * 2) {
    const hi = Math.max(plan.entry, plan.stopLoss);
    const lo = Math.min(plan.entry, plan.stopLoss);
    const midBand = (hi + lo) / 2;
    const padBand = Math.min(half * 0.55, (hi - lo) * 0.12);
    pushBand(
      'merged-desk-hot-glow-band',
      '합류',
      midBand,
      padBand,
      plan.direction === 'LONG' ? 'rgba(45,212,191,0.1)' : 'rgba(244,114,182,0.1)',
      'merged-desk-hot-glow-band',
      60
    );
  }

  return out;
}

function draftFromChannelMoney(ch: MergedDeskChannelMoneyPlan): MergedDeskActiveTradePlan | null {
  if (!(ch.direction === 'LONG' || ch.direction === 'SHORT')) return null;
  if (!(ch.entry > 0) || !(ch.stopLoss > 0) || !(ch.tp1 > 0)) return null;
  const strengthened = strengthenUnifiedDeskTradePlan({
    direction: ch.direction,
    entry: ch.entry,
    stopLoss: ch.stopLoss,
    tp1: ch.tp1,
    tp2: ch.tp2,
    tp3: ch.tp3,
    invalidationKo: ch.invalidationKo,
    sourceKo: '채널게이트',
    alignedWithChart: true,
    warningsKo: [
      ...(ch.reasonsKo ?? []),
      ch.edgeStateKo ? `게이트=${ch.edgeStateKo}` : '',
      ch.edgeStateKo === '안착확정'
        ? '안착확정→진입허용'
        : ch.edgeStateKo === '돌파실패'
          ? '돌파실패→진입금지'
          : '안착전→진입금지',
    ]
      .filter(Boolean)
      .slice(0, 6),
  });
  const status: MergedDeskActivePlanStatus =
    ch.status === 'ENTER'
      ? 'ENTER'
      : ch.status === 'INVALID'
        ? 'INVALID'
        : ch.status === 'TOUCH'
          ? 'TOUCH'
          : 'WAIT';
  return {
    direction: ch.direction,
    entry: strengthened.entry,
    stopLoss: strengthened.stopLoss,
    tp1: strengthened.tp1,
    tp2: strengthened.tp2,
    tp3: strengthened.tp3,
    invalidationPrice: ch.invalidationPrice > 0 ? ch.invalidationPrice : strengthened.stopLoss,
    invalidationKo: strengthened.invalidationKo,
    rr: ch.rr || calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) || 0,
    status,
    statusKo: statusKoOf(status),
    source: 'channel',
    sourceKo: `채널게이트·${ch.edgeStateKo || '엣지'}`,
    entryAllowed: status === 'ENTER' && ch.entryAllowed && ch.edgeStateKo === '안착확정',
    asUnifiedPlan: strengthened,
  };
}

/** E/SL/TP/무효 전폭선 — ActiveTrade·채널게이트 중복 제거용 */
export function isMergedDeskTradeRailPriceLine(pl: { title?: string } | null | undefined): boolean {
  const t = String(pl?.title || '');
  return /진입E|손절SL|익절TP[123]|롱진입|숏진입|^[▲▼]무효|무효·이탈|무효·채널|무효화|◆(매수|매도)관점|게이트손절|게이트TP|게이트무효|^진입\s|^손절\s|^목표\d?\s|^무효\s/.test(
    t
  );
}

export function resolveMergedDeskActiveTradePlan(params: {
  candles: Candle[];
  swingMid: SwingMidEntryPack | null | undefined;
  hotZone: MergedDeskHotZoneEntryPack | null | undefined;
  /** 파란·빨간 채널 머니엣지 */
  channelMoney?: MergedDeskChannelMoneyPlan | null;
  unified: UnifiedDeskTradePlan | null | undefined;
  master?: MasterFuturesDecision | null;
  currentPrice?: number | null;
  /** false면 ENTER 차단 (MTF 불일치) */
  mtfAligned?: boolean | null;
  mtfLabelKo?: string | null;
  /** 폴백용 */
  signal?: MergedTradeSignal | null;
  analysis?: AnalyzeResponse | null;
  judgment?: MergedTradeJudgment | null;
  /** 파랑빨강띠 ON — 채널 플랜을 ActiveTrade 단일 소스로 */
  preferChannel?: boolean;
  newsHint?: MergedDeskNewsHintLite | null;
  mtfAlignmentScore?: number | null;
  /** 캔들·카드·마감 합류 — ActiveTrade 보강/폴백 */
  candleCardConfluence?: CandleCardConfluencePack | null;
}): MergedDeskActiveTradePlan {
  const last = params.candles[params.candles.length - 1];
  const close =
    params.currentPrice && params.currentPrice > 0
      ? params.currentPrice
      : Number(last?.close) || 0;

  const swing = params.swingMid;
  const hot = params.hotZone;
  const uni = params.unified;

  let draft: MergedDeskActiveTradePlan | null = null;
  const ch = params.channelMoney;

  /** 0) 파랑빨강띠 ON — 라이브 채널머니가 E/SL/무효 단일 소스 */
  if (params.preferChannel && ch) {
    draft = draftFromChannelMoney(ch);
  }

  /** 1) 스윙중투 — 띠 단일소스일 때는 채널 플랜을 덮지 않음 */
  if (
    !(params.preferChannel && draft?.source === 'channel') &&
    swing?.active &&
    (swing.side === 'LONG' || swing.side === 'SHORT') &&
    swing.entryMid > 0 &&
    swing.stopLoss > 0 &&
    (swing.stance.startsWith('ENTER') ||
      swing.stance === 'WAIT_PULLBACK' ||
      swing.settleEnterAllowed)
  ) {
    const dir = swing.side;
    const inval =
      dir === 'LONG'
        ? Math.min(swing.stopLoss, swing.entryLow > 0 ? swing.entryLow : swing.stopLoss)
        : Math.max(swing.stopLoss, swing.entryHigh > 0 ? swing.entryHigh : swing.stopLoss);
    const status: MergedDeskActivePlanStatus = swing.stance.startsWith('ENTER')
      ? 'ENTER'
      : swing.stance === 'WAIT_PULLBACK'
        ? 'TOUCH'
        : 'WAIT';
    const strengthened = strengthenUnifiedDeskTradePlan({
      direction: dir,
      entry: swing.entryMid,
      stopLoss: swing.stopLoss,
      tp1: swing.tp1,
      tp2: swing.tp2,
      tp3: swing.tp3,
      invalidationKo: swing.invalidationKo || `종가 ${fmt(inval)} 이탈 시 무효`,
      sourceKo: '스윙중투',
      alignedWithChart: true,
      warningsKo: [...(swing.reasonsKo ?? [])].slice(0, 4),
    });
    draft = {
      direction: dir,
      entry: strengthened.entry,
      stopLoss: strengthened.stopLoss,
      tp1: strengthened.tp1,
      tp2: strengthened.tp2,
      tp3: strengthened.tp3,
      invalidationPrice: inval,
      invalidationKo: strengthened.invalidationKo,
      rr:
        calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) ??
        swing.rr ??
        0,
      status,
      statusKo: statusKoOf(status),
      source: 'swingMid',
      sourceKo: '스윙중투',
      entryAllowed: status === 'ENTER' && swing.settleEnterAllowed !== false,
      asUnifiedPlan: strengthened,
    };
  }

  /** 1.5) 채널머니 — 돌파/지지 세트(E/SL/TP). 스윙 ENTER/TOUCH만 잠금 */
  if (!params.preferChannel && ch && ch.rr >= 1.05) {
    const swingLocked =
      !!draft &&
      draft.source === 'swingMid' &&
      (draft.status === 'ENTER' || draft.status === 'TOUCH');
    const breakoutSet =
      ch.mode === 'breakout' ||
      ch.edgeStateKo === '돌파' ||
      ch.edgeStateKo === '돌파가능' ||
      ch.edgeStateKo === '안착확정' ||
      ch.edgeStateKo === '돌파실패';
    const canTake =
      !swingLocked &&
      (!draft ||
        draft.status === 'WAIT' ||
        draft.source === 'unified' ||
        draft.source === 'none' ||
        (breakoutSet && draft.source === 'hotZone'));
    if (
      canTake &&
      (ch.status === 'ENTER' ||
        ch.status === 'TOUCH' ||
        ch.status === 'INVALID' ||
        (ch.status === 'WAIT' && breakoutSet))
    ) {
      const fromCh = draftFromChannelMoney(ch);
      if (fromCh) draft = fromCh;
    }
  }

  /** 2) HotZone precision */
  if (!draft && hot?.precision && (hot.precision.side === 'LONG' || hot.precision.side === 'SHORT')) {
    const p = hot.precision;
    const primary = hot.all.find((z) => z.primary) ?? hot.all[0];
    const hzStatus = primary?.status ?? 'WAIT';
    const status: MergedDeskActivePlanStatus =
      hzStatus === 'ENTER' ? 'ENTER' : hzStatus === 'TOUCH' ? 'TOUCH' : 'WAIT';
    const risk = Math.abs(p.entry - p.stopLoss) || Math.abs(p.entry) * 0.01;
    const sign = p.side === 'LONG' ? 1 : -1;
    const tp2 = p.entry + sign * risk * 2.5;
    const tp3 = p.entry + sign * risk * 4;
    const strengthened = strengthenUnifiedDeskTradePlan({
      direction: p.side,
      entry: p.entry,
      stopLoss: p.stopLoss,
      tp1: p.tp1,
      tp2,
      tp3,
      invalidationKo: p.invalidationKo,
      sourceKo: 'HotZone',
      alignedWithChart: true,
      warningsKo: [],
    });
    draft = {
      direction: p.side,
      entry: strengthened.entry,
      stopLoss: strengthened.stopLoss,
      tp1: strengthened.tp1,
      tp2: strengthened.tp2,
      tp3: strengthened.tp3,
      invalidationPrice: p.invalidationPrice > 0 ? p.invalidationPrice : strengthened.stopLoss,
      invalidationKo: strengthened.invalidationKo,
      rr: p.rr || calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) || 0,
      status,
      statusKo: statusKoOf(status),
      source: 'hotZone',
      sourceKo: 'HotZone',
      entryAllowed: status === 'ENTER',
      asUnifiedPlan: strengthened,
    };
  }

  /** 3) unified fallback */
  if (
    !draft &&
    uni &&
    (uni.direction === 'LONG' || uni.direction === 'SHORT') &&
    uni.entry > 0 &&
    uni.stopLoss > 0
  ) {
    const strengthened = strengthenUnifiedDeskTradePlan(uni);
    draft = {
      direction: strengthened.direction,
      entry: strengthened.entry,
      stopLoss: strengthened.stopLoss,
      tp1: strengthened.tp1,
      tp2: strengthened.tp2,
      tp3: strengthened.tp3,
      invalidationPrice: strengthened.stopLoss,
      invalidationKo: strengthened.invalidationKo,
      rr: calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) || 0,
      status: 'WAIT',
      statusKo: '대기',
      source: 'unified',
      sourceKo: strengthened.sourceKo || '통합플랜',
      entryAllowed: false,
      asUnifiedPlan: strengthened,
    };
  }

  /** 3.5) 캔들·카드·마감 합류 — 플랜 없을 때 초안 */
  if (!draft && params.candleCardConfluence?.levels) {
    draft = candleCardLevelsToActiveDraft(params.candleCardConfluence.levels);
  }

  if (!draft) {
    draft = synthesizeMergedDeskActiveTradePlan({
      candles: params.candles,
      close,
      signal: params.signal,
      analysis: params.analysis,
      judgment: params.judgment,
    });
  }
  if (!draft) return emptyPlan('활성 매매 플랜 없음 — 관망');

  /** 캔들·카드 증거를 Active에 합류 (이중 타점 없이 보강) */
  draft = mergeCandleCardIntoActiveTrade(draft, params.candleCardConfluence);

  let next = applyInvalidation(draft, close);

  /** 마스터 하드 게이트 — ENTER 잠금 */
  const master = params.master;
  if (master && next.status !== 'INVALID') {
    if (master.side === 'WAIT' || master.entryAllowed === false) {
      if (next.status === 'ENTER') {
        next = {
          ...next,
          status: 'WAIT',
          statusKo: '대기',
          entryAllowed: false,
          asUnifiedPlan: {
            ...next.asUnifiedPlan,
            warningsKo: [...next.asUnifiedPlan.warningsKo, '마스터 게이트 — 진입 잠금'],
          },
        };
      } else {
        next = { ...next, entryAllowed: false };
      }
    }
    if (
      (master.side === 'LONG' || master.side === 'SHORT') &&
      next.direction !== 'NEUTRAL' &&
      master.side !== next.direction
    ) {
      /** 방향 충돌 — 반대쪽 E/SL/TP를 그대로 두지 않음. 마스터 타점만 남기거나 대기 */
      const masterEntry = master.entryPrice > 0 ? master.entryPrice : 0;
      const masterSl = master.stopPrice > 0 ? master.stopPrice : 0;
      const masterTp1 = master.tp1 > 0 ? master.tp1 : 0;
      if (masterEntry > 0 && masterSl > 0) {
        const strengthened = strengthenUnifiedDeskTradePlan({
          direction: master.side,
          entry: masterEntry,
          stopLoss: masterSl,
          tp1: masterTp1,
          tp2: 0,
          tp3: 0,
          invalidationKo: master.invalidationKo || '마스터 방향 우선',
          sourceKo: '마스터확정',
          alignedWithChart: true,
          warningsKo: ['마스터 방향 불일치 — 단일 타점으로 교체'],
        });
        next = {
          direction: master.side,
          entry: strengthened.entry,
          stopLoss: strengthened.stopLoss,
          tp1: strengthened.tp1,
          tp2: strengthened.tp2,
          tp3: strengthened.tp3,
          invalidationPrice: strengthened.stopLoss,
          invalidationKo: strengthened.invalidationKo,
          rr:
            calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) ??
            master.rr ??
            0,
          status: master.entryAllowed ? 'WAIT' : 'WAIT',
          statusKo: '대기',
          source: 'unified',
          sourceKo: '마스터확정',
          entryAllowed: Boolean(master.entryAllowed),
          asUnifiedPlan: strengthened,
        };
      } else {
        next = emptyPlan('마스터 방향 불일치 — 관망(단일 판정)');
      }
    }
  }

  const htfGate = mergedDeskHtfSplitBlocksEnter({
    mtfAligned: params.mtfAligned,
    mtfAlignmentScore: params.mtfAlignmentScore,
  });
  if (htfGate && next.status !== 'INVALID') {
    if (next.status === 'ENTER' || next.entryAllowed) {
      next = {
        ...next,
        status: 'WAIT',
        statusKo: '대기',
        entryAllowed: false,
        asUnifiedPlan: {
          ...next.asUnifiedPlan,
          warningsKo: [...next.asUnifiedPlan.warningsKo, htfGate.reasonKo],
        },
      };
    } else {
      next = {
        ...next,
        entryAllowed: false,
        asUnifiedPlan: {
          ...next.asUnifiedPlan,
          warningsKo: next.asUnifiedPlan.warningsKo.some((w) => w.includes('MTF') || w.includes('1D'))
            ? next.asUnifiedPlan.warningsKo
            : [...next.asUnifiedPlan.warningsKo, htfGate.reasonKo],
        },
      };
    }
  }

  const newsGate = evalMergedDeskNewsEntryGate(params.newsHint);
  if (newsGate?.blockEnter && next.status !== 'INVALID') {
    next = {
      ...next,
      status: next.status === 'ENTER' ? 'WAIT' : next.status,
      statusKo: next.status === 'ENTER' ? '대기' : next.statusKo,
      entryAllowed: false,
      asUnifiedPlan: {
        ...next.asUnifiedPlan,
        warningsKo: [...next.asUnifiedPlan.warningsKo, newsGate.reasonKo],
      },
    };
  }

  /** 超级统计 기하 — 선언 방향과 E/SL/TP 불일치 금지 */
  if ((next.direction === 'LONG' || next.direction === 'SHORT') && next.entry > 0) {
    const g = enforceTradePlanDirectionGeometry(
      next.direction,
      next.entry,
      next.stopLoss,
      next.tp1,
      next.tp2,
      next.tp3
    );
    const strengthened = strengthenUnifiedDeskTradePlan(
      {
        ...next.asUnifiedPlan,
        direction: next.direction,
        entry: g.entry,
        stopLoss: g.stopLoss,
        tp1: g.tp1,
        tp2: g.tp2,
        tp3: g.tp3,
      },
      { lockDirection: true }
    );
    next = {
      ...next,
      entry: strengthened.entry,
      stopLoss: strengthened.stopLoss,
      tp1: strengthened.tp1,
      tp2: strengthened.tp2,
      tp3: strengthened.tp3,
      invalidationPrice:
        next.invalidationPrice > 0 ? next.invalidationPrice : strengthened.stopLoss,
      rr:
        calcTradeRewardRisk(strengthened.entry, strengthened.stopLoss, strengthened.tp1) ??
        next.rr,
      asUnifiedPlan: strengthened,
    };
  }

  return next;
}

/**
 * 차트 전폭선 — ActivePlan 한 세트 (E / SL / TP1 / TP2 / TP3 / 무효).
 * WAIT·TOUCH·ENTER 모두 표시 — TP2/TP3를 ENTER에만 숨기면 타점이 안 보임.
 * 분·시·일·주·월 공동 (엔진 geometry TF와 동일 플랜).
 */
export function buildMergedDeskActiveTradePriceLines(
  plan: MergedDeskActiveTradePlan
): AtlasPulsePriceLine[] {
  if (plan.direction === 'NEUTRAL' || !(plan.entry > 0) || !(plan.stopLoss > 0)) return [];

  const st = plan.status;
  const go = st === 'ENTER' && plan.entryAllowed;
  const touch = st === 'TOUCH';
  const dead = st === 'INVALID';

  const slColor = dead ? 'rgba(248,113,113,0.45)' : '#F87171';
  const tp2Color = dead ? 'rgba(125,211,252,0.35)' : '#7DD3FC';
  const tp3Color = dead ? 'rgba(167,139,250,0.35)' : '#A78BFA';

  const eStyle: 'solid' | 'dashed' | 'dotted' = 'solid';
  const rr1 = plan.rr > 0 ? ` · ${plan.rr.toFixed(1)}R` : '';
  const rr2 = calcTradeRewardRisk(plan.entry, plan.stopLoss, plan.tp2);
  const rr3 = calcTradeRewardRisk(plan.entry, plan.stopLoss, plan.tp3);
  const invPx = plan.invalidationPrice > 0 ? plan.invalidationPrice : plan.stopLoss;
  const invSame = Math.abs(invPx - plan.stopLoss) / Math.max(plan.stopLoss, 1) <= 0.0004;
  const entryKo = plan.direction === 'LONG' ? '롱진입' : '숏진입';

  const lines: AtlasPulsePriceLine[] = [
    {
      price: plan.entry,
      color: dead ? 'rgba(45,212,191,0.45)' : go ? '#2DD4BF' : touch ? '#2DD4BF' : '#14B8A6',
      title: `${entryKo} ${fmt(plan.entry)}`,
      lineWidth: go ? 3 : 2,
      lineStyle: eStyle,
      axisLabel: true,
    },
    {
      price: plan.stopLoss,
      color: slColor,
      title: `손절 ${fmt(plan.stopLoss)}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    },
  ];

  if (plan.tp1 > 0) {
    lines.push({
      price: plan.tp1,
      color: dead ? 'rgba(251,191,36,0.4)' : '#FBBF24',
      title: `목표1 ${fmt(plan.tp1)}${rr1}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (plan.tp2 > 0) {
    lines.push({
      price: plan.tp2,
      color: tp2Color,
      title: `목표2 ${fmt(plan.tp2)}${rr2 != null ? ` · ${rr2.toFixed(1)}R` : ''}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (plan.tp3 > 0) {
    lines.push({
      price: plan.tp3,
      color: tp3Color,
      title: `목표3 ${fmt(plan.tp3)}${rr3 != null ? ` · ${rr3.toFixed(1)}R` : ''}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (!invSame && invPx > 0) {
    lines.push({
      price: invPx,
      color: dead ? '#F87171' : 'rgba(226,232,240,0.88)',
      title: `무효화 ${fmt(invPx)}`,
      lineWidth: dead || go ? 2 : 1,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }

  return lines;
}

export function summarizeMergedDeskActiveTradePlanKo(plan: MergedDeskActiveTradePlan): string {
  if (plan.direction === 'NEUTRAL') return plan.invalidationKo || '관망';
  const dir = plan.direction === 'LONG' ? '롱' : '숏';
  const size = mergedDeskRiskSizeHintKo(plan.entry, plan.stopLoss);
  return `${plan.sourceKo} · ${dir} · ${plan.statusKo} · E${fmt(plan.entry)} SL${fmt(plan.stopLoss)} TP1${fmt(plan.tp1)}${
    plan.rr > 0 ? ` · ${plan.rr.toFixed(1)}R` : ''
  } · 무효 ${fmt(plan.invalidationPrice)} · ${size}`;
}
