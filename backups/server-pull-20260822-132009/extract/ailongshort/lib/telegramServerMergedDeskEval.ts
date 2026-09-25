/**
 * 서버 — 통합·분석 데스크 엔진 평가 (앱 미접속).
 * 스윙중투 ENTER · 타점 · TP · 무효 → 텔레그램용 desk/levels.
 * 조건부 참고 — 승률·수익 보장 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import { buildMonthDeskStrikeDeskBundle, buildMonthDeskStrikeDeskOverlays } from '@/lib/monthDeskStrikeDesk';
import { buildMergedAnalysisBandFusionContext } from '@/lib/mergedAnalysisTradeLayer';
import { runMergedAnalysisDeskEngine, type MergedAnalysisDeskPack } from '@/lib/mergedAnalysisDeskEngine';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { resolveMergedDeskCanonicalCandles } from '@/lib/mergedAnalysisOverlayTimes';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';
import type {
  ConfirmNotifyKind,
  ConfirmPhase,
  TradeConfirmDesk,
} from '@/lib/tradeConfirmDesk';
import type { TelegramServerPhaseRow } from '@/lib/telegramServerPhaseState';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import {
  evalMergedDeskNewsEntryGate,
  mergedDeskRiskSizeHintKo,
  type MergedDeskNewsHintLite,
} from '@/lib/mergedDeskEntryHardGates';

/** 중투·스윙 텔레 — 저번 TF(1m~5m) 제외 (스팸 방지) */
export const MERGED_DESK_AUTO_ALERT_TFS = new Set([
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
]);

export type TelegramMergedDeskEval = {
  pack: MergedAnalysisDeskPack;
  swing: SwingMidEntryPack;
  candles: Candle[];
  price: number;
  desk: TradeConfirmDesk;
  levels: {
    entry: number | null;
    sl: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    inv: number | null;
    sourceKo: string;
  };
  insideEntry: boolean;
  learningLine: string | null;
  riskLine: string | null;
  newsBlocked: boolean;
};

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function candlesFromAnalysis(analysis: AnalyzeResponse): Candle[] {
  const raw = (analysis as AnalyzeResponse & { candles?: Candle[] }).candles;
  return Array.isArray(raw) && raw.length ? raw : [];
}

function atrLast(analysis: AnalyzeResponse): number | undefined {
  const atr = analysis.indicators?.atr;
  if (!Array.isArray(atr) || !atr.length) return undefined;
  const v = atr[atr.length - 1];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function priceInEntryZone(price: number, swing: SwingMidEntryPack): boolean {
  if (!(swing.entryLow > 0) || !(swing.entryHigh > 0) || !(price > 0)) return false;
  const lo = Math.min(swing.entryLow, swing.entryHigh);
  const hi = Math.max(swing.entryLow, swing.entryHigh);
  const pad = (hi - lo) * 0.08 || price * 0.0008;
  return price >= lo - pad && price <= hi + pad;
}

function phaseFromSwing(
  swing: SwingMidEntryPack,
  inside: boolean,
  invalid: boolean
): { phase: ConfirmPhase; phaseKo: string } {
  if (invalid) {
    return { phase: 'invalid', phaseKo: '무효 이탈 — 시나리오 재검토' };
  }
  if (swing.stance.startsWith('ENTER')) {
    if (inside) {
      return {
        phase: 'at_entry',
        phaseKo: `스윙중투 ${swing.side === 'LONG' ? '롱' : '숏'} · ★타점 구간`,
      };
    }
    return {
      phase: 'confirmed',
      phaseKo: `스윙중투 ${swing.side === 'LONG' ? '롱' : '숏'} ENTER · 자리 대기`,
    };
  }
  if (swing.stance === 'WAIT_PULLBACK' && inside) {
    return {
      phase: 'at_entry',
      phaseKo: `되돌림 타점 · ${swing.side === 'LONG' ? '롱' : '숏'} 자리`,
    };
  }
  if (swing.stance === 'WAIT_PULLBACK') {
    return { phase: 'candidate', phaseKo: '되돌림 대기 · 진입존 접근 감시' };
  }
  return { phase: 'wait', phaseKo: '관망 · 합류·게이트 부족' };
}

function buildSyntheticDesk(
  swing: SwingMidEntryPack,
  price: number,
  inside: boolean,
  invalid: boolean
): TradeConfirmDesk {
  const { phase, phaseKo } = phaseFromSwing(swing, inside, invalid);
  const dir: 'LONG' | 'SHORT' | 'WAIT' =
    swing.side === 'LONG' || swing.side === 'SHORT' ? swing.side : 'WAIT';
  const gates =
    swing.grade === 'A' ? 5 : swing.grade === 'B' ? 4 : swing.grade === 'C' ? 3 : 1;
  const notifyKind: ConfirmNotifyKind | null =
    phase === 'wait'
      ? null
      : phase === 'candidate'
        ? 'candidate'
        : phase === 'invalid'
          ? 'invalid'
          : phase === 'at_entry'
            ? 'at_entry'
            : 'confirmed';

  const entryLo = swing.entryLow > 0 ? Math.min(swing.entryLow, swing.entryHigh) : null;
  const entryHi = swing.entryHigh > 0 ? Math.max(swing.entryLow, swing.entryHigh) : null;
  const entryMid = swing.entryMid > 0 ? swing.entryMid : null;

  return {
    phase,
    phaseKo,
    direction: dir,
    gatesPassCount: gates,
    isConfirmed: phase === 'confirmed' || phase === 'at_entry' || phase === 'confirmed_full',
    isFullConfirm: swing.grade === 'A' && swing.stance.startsWith('ENTER'),
    mtfBlocked: false,
    entryLow: entryLo,
    entryHigh: entryHi,
    entryKo:
      entryLo != null && entryHi != null
        ? `${fmtPx(entryLo)} ~ ${fmtPx(entryHi)}`
        : entryMid != null
          ? fmtPx(entryMid)
          : '—',
    confirmPrice: swing.stopLoss > 0 ? swing.stopLoss : null,
    confirmLabel: '스윙중투 방어(SL)',
    confirmKo: swing.invalidationKo || swing.summaryKo || '—',
    invalidPrice: swing.stopLoss > 0 ? swing.stopLoss : null,
    tp1: swing.tp1 > 0 ? swing.tp1 : null,
    close: price,
    steps: [],
    notifyKind,
    notifyTitle: phaseKo,
    notifyBody: swing.actionKo || swing.headlineKo || '',
    notifyKey: `merged-swing|${dir}|${swing.stance}|${Math.round(entryMid ?? 0)}|${Math.round(swing.stopLoss || 0)}`,
  };
}

function nearPx(price: number, target: number, rel = 0.0028): boolean {
  if (!(price > 0) || !(target > 0)) return false;
  return Math.abs(price - target) / target <= rel;
}

function deskFromActiveTrade(
  at: MergedDeskActiveTradePlan,
  price: number,
  invalidForced: boolean
): TradeConfirmDesk | null {
  if (at.direction !== 'LONG' && at.direction !== 'SHORT') return null;
  if (!(at.entry > 0) || !(at.stopLoss > 0)) return null;
  const dir = at.direction;
  const near = nearPx(price, at.entry);
  let phase: ConfirmPhase = 'wait';
  if (invalidForced || at.status === 'INVALID') phase = 'invalid';
  else if (at.status === 'ENTER' && at.entryAllowed && near) phase = 'at_entry';
  else if (at.status === 'ENTER' && at.entryAllowed) {
    phase = at.source === 'channel' ? 'confirmed_full' : 'confirmed';
  } else if (at.status === 'TOUCH' && near) phase = 'at_entry';
  else if (at.status === 'TOUCH' || (at.status === 'WAIT' && at.entry > 0)) phase = 'candidate';

  const phaseKo =
    phase === 'invalid'
      ? '무효 이탈 — 시나리오 재검토'
      : phase === 'at_entry'
        ? `${dir === 'LONG' ? '롱' : '숏'} · ★진입자리`
        : phase === 'confirmed_full'
          ? `${dir === 'LONG' ? '롱' : '숏'} · 돌파안착·ENTER`
          : phase === 'confirmed'
            ? `${dir === 'LONG' ? '롱' : '숏'} · 플랜확정`
            : phase === 'candidate'
              ? '자리 접근 · 진입 전 대기'
              : '관망';

  const notifyKind: ConfirmNotifyKind | null =
    phase === 'wait' || phase === 'candidate'
      ? phase === 'candidate'
        ? 'candidate'
        : null
      : phase === 'invalid'
        ? 'invalid'
        : phase === 'at_entry'
          ? 'at_entry'
          : phase === 'confirmed_full'
            ? 'confirmed_full'
            : 'confirmed';

  return {
    phase,
    phaseKo,
    direction: dir,
    gatesPassCount: at.entryAllowed ? 5 : at.status === 'TOUCH' ? 3 : 2,
    isConfirmed: phase === 'confirmed' || phase === 'at_entry' || phase === 'confirmed_full',
    isFullConfirm: phase === 'confirmed_full',
    mtfBlocked: false,
    entryLow: at.entry,
    entryHigh: at.entry,
    entryKo: fmtPx(at.entry),
    confirmPrice: at.stopLoss,
    confirmLabel: 'ActiveTrade SL',
    confirmKo: at.invalidationKo || at.statusKo,
    invalidPrice: at.invalidationPrice > 0 ? at.invalidationPrice : at.stopLoss,
    tp1: at.tp1 > 0 ? at.tp1 : null,
    close: price,
    steps: [],
    notifyKind,
    notifyTitle: phaseKo,
    notifyBody: `${at.sourceKo} · ${at.statusKo} · ${mergedDeskRiskSizeHintKo(at.entry, at.stopLoss)}`,
    notifyKey: `merged-at|${dir}|${at.status}|${at.source}|${Math.round(at.entry)}|${Math.round(at.stopLoss)}`,
  };
}

function detectInvalid(
  prev: TelegramServerPhaseRow | null,
  price: number,
  swing: SwingMidEntryPack
): boolean {
  if (!prev) return false;
  if (prev.phase === 'invalid' || prev.phase === 'wait') return false;
  if (prev.direction !== 'LONG' && prev.direction !== 'SHORT') return false;

  const sl = prev.invalidPrice;
  if (sl != null && Number.isFinite(sl) && sl > 0) {
    if (prev.direction === 'LONG' && price < sl) return true;
    if (prev.direction === 'SHORT' && price > sl) return true;
  }

  const hadPlan =
    prev.phase === 'confirmed' ||
    prev.phase === 'confirmed_full' ||
    prev.phase === 'at_entry' ||
    prev.phase === 'candidate';
  if (
    hadPlan &&
    swing.stance === 'WAIT' &&
    swing.side === 'WAIT' &&
    (prev.direction === 'LONG' || prev.direction === 'SHORT')
  ) {
    return true;
  }
  return false;
}

/**
 * analyze 응답 → 통합 데스크 팩 (차트와 동일 엔진 경로).
 */
export function buildTelegramMergedDeskEval(
  analysis: AnalyzeResponse,
  timeframe: string,
  settleBoard: TfCloseSettleBoard | null,
  prev: TelegramServerPhaseRow | null,
  newsHint?: MergedDeskNewsHintLite | null
): TelegramMergedDeskEval | null {
  const raw = candlesFromAnalysis(analysis);
  if (raw.length < 24) return null;

  const sanitized = sanitizeChartCandlesForSeries(raw, timeframe);
  const candles = resolveMergedDeskCanonicalCandles(sanitized, sanitized, timeframe);
  if (candles.length < 12) return null;

  const price =
    analysis.currentPrice && analysis.currentPrice > 0
      ? analysis.currentPrice
      : candles[candles.length - 1]!.close;

  const bundle = buildMonthDeskStrikeDeskBundle({
    candles,
    timeframe,
    swingPivot: 2,
    scenario: null,
    stCore: null,
    analyzeVerdict:
      analysis.verdict === 'LONG' || analysis.verdict === 'SHORT' ? analysis.verdict : null,
    analyzeFusion: {
      currentPrice: price,
      atr: atrLast(analysis),
      longScore: analysis.longScore,
      shortScore: analysis.shortScore,
      verdict: analysis.verdict,
    },
    analysis,
  });

  const probePack = buildMonthDeskStrikeDeskOverlays(bundle, candles);
  const pack = runMergedAnalysisDeskEngine({
    candles,
    timeframe,
    bundle,
    fusion: buildMergedAnalysisBandFusionContext({
      timeframe,
      bundle,
      analysis,
      candles,
    }),
    analysis,
    probePack,
    swingDrawEnabled: true,
    settleBoard,
  });
  if (!pack?.swingMidEntry) return null;

  const swing = pack.swingMidEntry;
  const at = pack.activeTradePlan;
  const newsBlocked = Boolean(evalMergedDeskNewsEntryGate(newsHint)?.blockEnter);
  const invalidSwing = detectInvalid(prev, price, swing);
  const invalidAt =
    at &&
    (at.direction === 'LONG' || at.direction === 'SHORT') &&
    prev &&
    (prev.direction === 'LONG' || prev.direction === 'SHORT') &&
    prev.invalidPrice != null &&
    prev.invalidPrice > 0 &&
    ((prev.direction === 'LONG' && price < prev.invalidPrice) ||
      (prev.direction === 'SHORT' && price > prev.invalidPrice));
  const invalid = Boolean(invalidSwing || invalidAt || at?.status === 'INVALID');
  const insideSwing = priceInEntryZone(price, swing);
  const insideAt = at && at.entry > 0 ? nearPx(price, at.entry) : false;
  const deskFromAt = at ? deskFromActiveTrade(at, price, invalid) : null;
  const desk = deskFromAt ?? buildSyntheticDesk(swing, price, insideSwing, invalid);
  const inside = deskFromAt ? Boolean(insideAt) : insideSwing;

  const plan = pack.unifiedTradePlan;
  const entry =
    at && at.entry > 0
      ? at.entry
      : swing.entryMid > 0
        ? swing.entryMid
        : plan.entry > 0
          ? plan.entry
          : desk.entryLow;
  const sl =
    at && at.stopLoss > 0
      ? at.stopLoss
      : swing.stopLoss > 0
        ? swing.stopLoss
        : plan.stopLoss > 0
          ? plan.stopLoss
          : desk.invalidPrice;
  const tp1 = at && at.tp1 > 0 ? at.tp1 : swing.tp1 > 0 ? swing.tp1 : plan.tp1 > 0 ? plan.tp1 : desk.tp1;
  const tp2 = at && at.tp2 > 0 ? at.tp2 : swing.tp2 > 0 ? swing.tp2 : plan.tp2 > 0 ? plan.tp2 : null;
  const tp3 = at && at.tp3 > 0 ? at.tp3 : swing.tp3 > 0 ? swing.tp3 : plan.tp3 > 0 ? plan.tp3 : null;
  const inv =
    at && at.invalidationPrice > 0
      ? at.invalidationPrice
      : desk.invalidPrice != null && desk.invalidPrice > 0
        ? desk.invalidPrice
        : sl;

  const learning = analysis.signalLearning;
  const learningLine =
    learning && learning.longCount + learning.shortCount > 0
      ? `학습 표본 ${learning.longCount + learning.shortCount}건 · TP1 ${learning.tp1Count} SL ${learning.slCount} · ${Math.round(learning.successRate * 100)}%(검증)`
      : null;

  const sourceKo = at
    ? `통합·분석 ActiveTrade · ${at.sourceKo} · ${at.statusKo}${
        at.entryAllowed ? ' · 진입허용' : ' · 진입보류'
      }`
    : `통합·분석 스윙중투 · ${swing.stance} · 합류 ${swing.confluence}% · ${swing.grade}급${
        swing.settleGateKo ? ` · ${swing.settleGateKo}` : ''
      }`;

  return {
    pack,
    swing,
    candles,
    price,
    desk,
    levels: {
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      inv: inv ?? null,
      sourceKo,
    },
    insideEntry: inside,
    learningLine,
    riskLine: entry && sl ? mergedDeskRiskSizeHintKo(entry, sl) : null,
    newsBlocked,
  };
}

/**
 * 이전 phase 대비 보낼 알림 종류 (후보 제외 — 자리·플랜·무효만).
 */
export function detectMergedDeskNotifyKind(
  prev: TelegramServerPhaseRow | null,
  ev: TelegramMergedDeskEval
): ConfirmNotifyKind | null {
  const { desk, swing, insideEntry } = ev;

  if (desk.phase === 'invalid') {
    if (prev?.phase === 'invalid') return null;
    if (
      prev &&
      (prev.phase === 'confirmed' ||
        prev.phase === 'confirmed_full' ||
        prev.phase === 'at_entry' ||
        prev.phase === 'candidate')
    ) {
      return 'invalid';
    }
    return null;
  }

  // ★타점: ActiveTrade 근접 또는 스윙 진입존
  if (desk.phase === 'at_entry') {
    if (prev?.phase === 'at_entry' && prev.direction === desk.direction) return null;
    if (prev?.phase === 'invalid') return null;
    return 'at_entry';
  }

  if (desk.phase === 'confirmed_full' && desk.direction !== 'WAIT') {
    if (
      prev &&
      (prev.phase === 'confirmed_full' || prev.phase === 'confirmed' || prev.phase === 'at_entry') &&
      prev.direction === desk.direction &&
      prev.lastNotifyKey === desk.notifyKey
    ) {
      return null;
    }
    return 'confirmed_full';
  }

  // 플랜 확정: ENTER 전환 (자리 밖 — 대기 알림)
  if (
    (swing.stance.startsWith('ENTER') || desk.phase === 'confirmed') &&
    desk.direction !== 'WAIT' &&
    !insideEntry
  ) {
    if (
      prev &&
      (prev.phase === 'confirmed' || prev.phase === 'confirmed_full' || prev.phase === 'at_entry') &&
      prev.direction === desk.direction &&
      prev.lastNotifyKey === desk.notifyKey
    ) {
      return null;
    }
    if (
      prev &&
      (prev.phase === 'confirmed' || prev.phase === 'confirmed_full') &&
      prev.direction === desk.direction &&
      Math.abs((prev.entryMid ?? 0) - (swing.entryMid || 0)) < (swing.entryMid || 1) * 0.0015
    ) {
      return null;
    }
    return 'confirmed';
  }

  return null;
}
